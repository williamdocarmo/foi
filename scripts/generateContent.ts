// scripts/generateContent.ts
/**
 * Gerador de conteúdo robusto (curiosidades + quizzes) — versão turbo+confiável
 *
 * Principais diferenças:
 * - Usa responseMimeType: "application/json" + responseSchema => saída 100% JSON.
 * - Fallback esperto: tenta reparar JSON, mantém itens válidos do batch (não descarta tudo).
 * - Auto-tune de batch em parse fail/429 (reduz de 50→25→10→5→2).
 * - Fallback de modelo (ex.: gemini-1.5-flash → gemini-1.5-pro) quando útil.
 * - Retries com backoff e jitter; delay menor entre chamadas.
 * - Escrita incremental + checkpoints e locks preservados.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import fs from "fs/promises";
import fsExtra from "fs-extra";
import path from "path";
import JSON5 from "json5";
import pLimit from "p-limit";
import cliProgress from "cli-progress";
import stringSimilarity from "string-similarity";
import crypto from "crypto";
import minimist from "minimist";
import { fileURLToPath } from "url";

import categories from "../src/lib/data/categories.json" assert { type: "json" };
import type { Curiosity, QuizQuestion } from "../src/lib/types";

config();

// ---------------- CONFIG & FLAGS ----------------
const argv = minimist(process.argv.slice(2));
const ONLY_CATEGORY: string | undefined = argv.category;
const CATEGORY_EXCLUDE: string[] = (argv["category-exclude"] ? String(argv["category-exclude"]) : "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DRY_RUN = !!argv["dry-run"];
const EQUALIZE_ONLY = !!argv["equalize-only"];
const FORCE = !!argv["force"];

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error("GEMINI_API_KEY is not defined in your .env file");

const PRIMARY_MODEL = String(argv.model || process.env.GEMINI_MODEL || "gemini-1.5-flash");
const FALLBACK_MODEL = String(process.env.GEMINI_MODEL_FALLBACK || "gemini-1.5-pro");

const genAI = new GoogleGenerativeAI(API_KEY);
let model = genAI.getGenerativeModel({ model: PRIMARY_MODEL });

const CURIOSITIES_TARGET_PER_CATEGORY = Number(argv.count ?? process.env.CURIOSITIES_TARGET ?? 1000);
const QUIZ_QUESTIONS_TARGET_PER_CATEGORY = Number(argv.count ?? process.env.QUIZ_TARGET ?? 500);

// valores iniciais mais conservadores, mas com auto-tune
const DEFAULT_BATCH_SIZE = 30;
const BATCH_SIZE = Number(argv["batch-size"] ?? DEFAULT_BATCH_SIZE);

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 900;
const API_CALL_DELAY_MS_BASE = 350; // ↓ mais agressivo; com jitter
const DEFAULT_CONCURRENCY = 4; // concorrência cross-categorias; batch intra-categoria é sequencial
const CONCURRENCY = Number(argv["concurrency"] ?? DEFAULT_CONCURRENCY);
const SIMILARITY_THRESHOLD = 0.82;
const HASH_FLUSH_INTERVAL = 200;

// ESM-safe ROOT
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), "..");
const dataDir = path.join(ROOT, "data");
const curiositiesDir = path.join(dataDir, "curiosities");
const quizzesDir = path.join(dataDir, "quiz-questions");
const checkpointPath = path.join(dataDir, ".checkpoints.json");
const globalHashesPath = path.join(dataDir, ".global-hashes.json");
const lockPath = path.join(dataDir, ".lock");

// ---------------- LOGGING ----------------
type LogLevel = "info" | "warn" | "error";
function ts() {
  const d = new Date();
  return d.toISOString().replace("T", " ").replace("Z", "");
}
function log(level: LogLevel, msg: string) {
  const tag = level === "info" ? "INFO" : level === "warn" ? "WARN" : "ERROR";
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`[${ts()}] [${tag}] ${msg}`);
}

// ---------------- GLOBAL DEDUPE STATE ----------------
const globalTitleHashes = new Set<string>();
const globalContentHashes = new Set<string>();
const globalQuizHashes = new Set<string>();
let dirtyHashCount = 0;

// ---------------- UTIL ----------------
async function ensureDirExists(dirPath: string) {
  await fsExtra.ensureDir(dirPath);
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function atomicWriteJson(filePath: string, data: any) {
  if (DRY_RUN) {
    log("info", `[dry-run] write -> ${filePath} (${Array.isArray(data) ? data.length : "obj"})`);
    return;
  }
  const tmp = filePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, filePath);
}
async function safeReadJson<T = any>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const txt = await fs.readFile(filePath, "utf-8");
    return txt ? JSON.parse(txt) : defaultValue;
  } catch {
    return defaultValue;
  }
}
async function safeParseJsonText<T = any>(text: string): Promise<T | null> {
  if (!text || !text.trim()) return null;
  const stripped = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    try {
      return JSON5.parse(stripped) as T;
    } catch {
      // tenta capturar bloco JSON final
      const matches = stripped.match(/(\[[\s\S]*\]|\{[\s\S]*\})/g);
      if (matches && matches.length) {
        const candidate = matches[matches.length - 1];
        try {
          return JSON.parse(candidate) as T;
        } catch {
          try {
            return JSON5.parse(candidate) as T;
          } catch {
            return null;
          }
        }
      }
      return null;
    }
  }
}
function normalizeText(s: string) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function sha1(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex");
}
function nextSequentialId(existing: { id?: string }[], categoryId: string) {
  let max = 0;
  for (const it of existing) {
    const suf = (it.id ?? "").split("-").pop() ?? "0";
    const n = Number.parseInt(suf, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${categoryId}-${max + 1}`;
}

// ---------------- VALIDATION ----------------
function wordCount(s: string) {
  return s ? s.trim().split(/\s+/).length : 0;
}
function validateCuriosity(item: any): item is Curiosity {
  if (!item || typeof item !== "object") return false;
  if (!item.title || typeof item.title !== "string") return false;
  const title = item.title.trim();
  if (title.length < 6 || title.length > 120) return false;

  if (!item.content || typeof item.content !== "string") return false;
  const wc = wordCount(item.content);
  if (wc < 40 || wc > 90) return false;

  if (!item.funFact || typeof item.funFact !== "string" || item.funFact.trim().length < 10) return false;

  if (item.hook && (typeof item.hook !== "string" || item.hook.trim().length < 6)) return false;
  if (item.curiosityLevel && !(Number.isFinite(item.curiosityLevel) && item.curiosityLevel >= 1 && item.curiosityLevel <= 5))
    return false;

  return true;
}
function validateQuizStrict(item: any): item is QuizQuestion {
  if (!item || typeof item !== "object") return false;
  const difficultyOk = ["easy", "medium", "hard"].includes(item.difficulty);
  if (!difficultyOk) return false;

  const q = String(item.question ?? "").trim();
  if (q.length < 10) return false;

  if (!Array.isArray(item.options) || item.options.length !== 4) return false;
  const optsTrim = item.options.map((o: any) => String(o ?? "").trim()).filter(Boolean);
  if (optsTrim.length !== 4) return false;

  const norm = (s: string) => normalizeText(s);
  const uniqueNorm = new Set(optsTrim.map(norm));
  if (uniqueNorm.size !== 4) return false;

  const ca = String(item.correctAnswer ?? "").trim();
  if (!ca) return false;
  if (!optsTrim.some((o) => norm(o) === norm(ca))) return false;

  const exp = String(item.explanation ?? "").trim();
  if (exp.length < 12) return false;

  return true;
}
function normalizeCuriosityFields(c: Curiosity): Curiosity {
  return {
    ...c,
    id: c.id,
    categoryId: c.categoryId,
    title: c.title.trim(),
    content: c.content.trim(),
    funFact: c.funFact.trim(),
    isNew: c.isNew,
  };
}

// ---------------- DUPLICATES ----------------
function isDuplicateCuriosity(title: string, content: string, existingTitles: string[]) {
  const tNorm = normalizeText(title);
  const cNorm = normalizeText(content);
  if (!tNorm || !cNorm) return true;

  const tHash = sha1(tNorm);
  const cHash = sha1(cNorm);

  if (globalTitleHashes.has(tHash) || globalContentHashes.has(cHash)) return true;
  if (existingTitles.includes(title)) return true;

  if (existingTitles.length > 0) {
    const best = stringSimilarity.findBestMatch(title, existingTitles);
    return !!best?.bestMatch && best.bestMatch.rating >= SIMILARITY_THRESHOLD;
  }
  return false;
}
function isDuplicateQuizQuestion(question: string, existingQuestions: string[]) {
  const qNorm = normalizeText(question);
  if (!qNorm) return true;

  const qHash = sha1(qNorm);
  if (globalQuizHashes.has(qHash)) return true;
  if (existingQuestions.includes(question)) return true;

  if (existingQuestions.length > 0) {
    const best = stringSimilarity.findBestMatch(question, existingQuestions);
    return !!best?.bestMatch && best.bestMatch.rating >= SIMILARITY_THRESHOLD;
  }
  return false;
}

// ---------------- CHECKPOINTS ----------------
type CheckpointSchema = Record<
  string,
  {
    curiositiesBatchesProcessed?: number;
    quizzesBatchesProcessed?: number;
    lastRunAt?: string;
  }
>;
async function readCheckpoints(): Promise<CheckpointSchema> {
  return safeReadJson<CheckpointSchema>(checkpointPath, {});
}
async function writeCheckpoints(cp: CheckpointSchema) {
  (cp as any).__meta__ = { lastWriteAt: new Date().toISOString() };
  await atomicWriteJson(checkpointPath, cp);
}

// ---------------- GLOBAL HASHES PERSISTÊNCIA ----------------
type GlobalHashesSchema = {
  title: string[];
  content: string[];
  quiz: string[];
};
async function readGlobalHashes() {
  const data = await safeReadJson<GlobalHashesSchema>(globalHashesPath, {
    title: [],
    content: [],
    quiz: [],
  });
  data.title.forEach((h) => globalTitleHashes.add(h));
  data.content.forEach((h) => globalContentHashes.add(h));
  data.quiz.forEach((h) => globalQuizHashes.add(h));
  log(
    "info",
    `Hashes persistidos carregados: ${globalTitleHashes.size} títulos, ${globalContentHashes.size} conteúdos, ${globalQuizHashes.size} perguntas`
  );
}
async function flushGlobalHashesIfNeeded(force = false) {
  if (DRY_RUN) return;
  if (!force && dirtyHashCount < HASH_FLUSH_INTERVAL) return;
  dirtyHashCount = 0;
  const payload: GlobalHashesSchema = {
    title: Array.from(globalTitleHashes),
    content: Array.from(globalContentHashes),
    quiz: Array.from(globalQuizHashes),
  };
  await atomicWriteJson(globalHashesPath, payload);
  log("info", "Hashes globais persistidos em disco.");
}

// ---------------- JSON SCHEMAS (Gemini) ----------------
const curiosityItemSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    hook: { type: "STRING" },
    content: { type: "STRING" },
    funFact: { type: "STRING" },
    curiosityLevel: { type: "INTEGER" },
  },
  required: ["title", "content", "funFact"],
};
const quizItemSchema = {
  type: "OBJECT",
  properties: {
    difficulty: { type: "STRING", enum: ["easy", "medium", "hard"] },
    question: { type: "STRING" },
    options: { type: "ARRAY", items: { type: "STRING" } },
    correctAnswer: { type: "STRING" },
    explanation: { type: "STRING" },
  },
  required: ["difficulty", "question", "options", "correctAnswer", "explanation"],
};

// ---------------- API + RETRIES ----------------
type GenMode = "curiosities" | "quizzes";

async function generateJsonArrayWithRetry(
  mode: GenMode,
  prompt: string,
  count: number,
  attempt = 1,
  currentModel = model
): Promise<any[] | null> {
  const isQuiz = mode === "quizzes";
  const schema = {
    type: "ARRAY",
    items: isQuiz ? quizItemSchema : curiosityItemSchema,
  } as any;

  try {
    // Tenta modo "JSON puro" com schema
    const result = await currentModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
        maxOutputTokens: 4096,
      },
    });
    const txt = result.response.text();
    const parsed = await safeParseJsonText<any[]>(txt);
    if (Array.isArray(parsed) && parsed.length) return parsed;

    // Se vier vazio, tenta reparar
    const repaired = await tryRepairArray(txt);
    if (Array.isArray(repaired) && repaired.length) return repaired;

    return null;
  } catch (err: any) {
    const status = err?.status;
    const retriable =
      [408, 409, 425, 429, 500, 502, 503, 504].includes(status) ||
      (!status && attempt <= Math.ceil(MAX_RETRIES / 2));

    if (attempt <= MAX_RETRIES && retriable) {
      const delay = Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 800);
      log("warn", `API error (status=${status ?? "?"}). Retry em ${delay}ms (tentativa ${attempt}/${MAX_RETRIES})`);
      await sleep(delay);

      // Fallback de modelo se persistir
      if (attempt === Math.ceil(MAX_RETRIES / 2) && currentModel === model && FALLBACK_MODEL) {
        log("warn", `Alternando para modelo fallback: ${FALLBACK_MODEL}`);
        const fb = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
        return generateJsonArrayWithRetry(mode, prompt, count, attempt + 1, fb);
      }

      return generateJsonArrayWithRetry(mode, prompt, count, attempt + 1, currentModel);
    }

    log("error", `Erro não-retryable ou máximas tentativas: ${err?.message ?? err}`);
    return null;
  }
}

async function tryRepairArray(txt: string | null): Promise<any[] | null> {
  if (!txt) return null;
  // 1) tentativa direta
  const parsed = await safeParseJsonText<any[]>(txt);
  if (Array.isArray(parsed)) return parsed;

  // 2) heurística: capture último [ ... ]
  const m = txt.match(/\[[\s\S]*\]/);
  if (m) {
    const candidate = m[0];
    try {
      const j = JSON.parse(candidate);
      if (Array.isArray(j)) return j;
    } catch {
      try {
        const j = JSON5.parse(candidate);
        if (Array.isArray(j)) return j;
      } catch {}
    }
  }
  return null;
}

// ---------------- PROMPTS ----------------
function buildCuriosityPrompt(categoryName: string, count: number, bannedTitles: string[]) {
  const banned = bannedTitles.slice(-200);
  return `
Gere ${count} curiosidades INÉDITAS e atraentes sobre "${categoryName}".
Saída: APENAS um ARRAY JSON de objetos com chaves: "title", "hook", "content", "funFact", "curiosityLevel".
Restrições:
- title 6–80 chars, intrigante, única. Não repetir: ${JSON.stringify(banned)}
- content: 40–80 palavras, parágrafo corrido, linguagem simples.
- funFact: 1 frase extra surpreendente (obrigatório).
- curiosityLevel: inteiro 1–5.
Sem markdown, sem comentários, sem textos fora do JSON.
`;
}
function buildQuizPrompt(categoryName: string, count: number, bannedQuestions: string[]) {
  const banned = bannedQuestions.slice(-200);
  return `
Gere ${count} perguntas de quiz ORIGINAIS sobre "${categoryName}".
Saída: APENAS um ARRAY JSON de objetos com:
- difficulty: "easy" | "medium" | "hard"
- question: string clara e única (não repetir: ${JSON.stringify(banned)})
- options: array com 4 alternativas plausíveis e distintas
- correctAnswer: string igual a uma das options
- explanation: curta, dizendo por que a correta está certa e as outras 3 não; inclua 1 curiosidade.
Sem markdown, sem comentários, sem textos fora do JSON.
`;
}

// ---------------- I/O helpers ----------------
async function readCategoryJson<T = any[]>(filePath: string): Promise<T> {
  try {
    await fs.access(filePath);
    const txt = await fs.readFile(filePath, "utf-8");
    if (!txt || !txt.trim()) return [] as unknown as T;
    const parsed = await safeParseJsonText<T>(txt);
    return (parsed ?? []) as T;
  } catch {
    return [] as unknown as T;
  }
}
async function writeCategoryJson(filePath: string, arr: any[]) {
  const sorted = [...arr].sort((a, b) => {
    const aIdNum = a.id ? parseInt(String(a.id).split("-").pop() || "0", 10) : 0;
    const bIdNum = b.id ? parseInt(String(b.id).split("-").pop() || "0", 10) : 0;
    return aIdNum - bIdNum;
  });
  await atomicWriteJson(filePath, sorted);
}

// ---------------- LOCKFILE ----------------
async function acquireLock() {
  await ensureDirExists(dataDir);
  const exists = await fsExtra.pathExists(lockPath);
  if (exists && !FORCE) {
    const content = await fs.readFile(lockPath, "utf-8").catch(() => "");
    throw new Error(
      `Lockfile encontrado em ${lockPath}. Outra execução pode estar ativa.\nUse --force para sobrescrever.\nConteúdo: ${content}`
    );
  }
  const payload = { pid: process.pid, startedAt: new Date().toISOString(), model: PRIMARY_MODEL };
  await atomicWriteJson(lockPath, payload);
  log("info", "Lock adquirido.");
}
async function releaseLock() {
  if (await fsExtra.pathExists(lockPath)) {
    if (DRY_RUN) {
      log("info", "[dry-run] lock não removido");
      return;
    }
    await fsExtra.remove(lockPath);
    log("info", "Lock removido.");
  }
}

// ---------------- CORE GENERATION PIPELINE ----------------
type GenerateKind = "curiosities" | "quizzes";
let EQUALIZER_RUN = false;

function isCuriosity(kind: GenerateKind): kind is "curiosities" {
  return kind === "curiosities";
}

async function generateForCategory(
  category: (typeof categories)[0],
  kind: GenerateKind,
  totalToGenerate: number,
  cp: CheckpointSchema,
  bars: { multibar: cliProgress.MultiBar }
) {
  const curiosityMode = isCuriosity(kind);
  const filePath = path.join(curiosityMode ? curiositiesDir : quizzesDir, `${curiosityMode ? "" : "quiz-"}${category.id}.json`);
  const targetCount = curiosityMode ? CURIOSITIES_TARGET_PER_CATEGORY : QUIZ_QUESTIONS_TARGET_PER_CATEGORY;

  const existingItems = await readCategoryJson<any[]>(filePath);
  const itemsToGenerate = totalToGenerate > 0 ? totalToGenerate : Math.max(0, targetCount - existingItems.length);

  if (itemsToGenerate === 0 && !EQUALIZER_RUN) {
    log("info", `[${category.id}] ${kind}: ${existingItems.length}/${targetCount}. Nenhuma ação necessária.`);
    return;
  }

  log("info", `[${category.id}] ${kind}: ${existingItems.length}/${targetCount}. Gerando ${itemsToGenerate} itens...`);
  const progressBar = bars.multibar.create(itemsToGenerate, 0, { category: `${category.id} ${kind}` });

  let generatedCount = 0;
  let dynamicBatch = Math.min(BATCH_SIZE, itemsToGenerate);
  let consecutiveParseFails = 0;

  while (generatedCount < itemsToGenerate) {
    const remaining = itemsToGenerate - generatedCount;
    const batchGenSize = Math.max(2, Math.min(remaining, dynamicBatch));
    if (batchGenSize <= 0) break;

    const bannedContent = curiosityMode ? existingItems.map((i) => i.title) : existingItems.map((i) => i.question);

    const prompt = curiosityMode
      ? buildCuriosityPrompt(category.name, batchGenSize, bannedContent)
      : buildQuizPrompt(category.name, batchGenSize, bannedContent);

    const rawParsed = await generateJsonArrayWithRetry(curiosityMode ? "curiosities" : "quizzes", prompt, batchGenSize);

    if (!rawParsed || !Array.isArray(rawParsed) || rawParsed.length === 0) {
      consecutiveParseFails++;
      log("warn", `[${category.id}] ${kind}: resposta não parseável/sem itens. Pulando batch.`);

      // auto-tune: reduza o batch progressivamente para estabilizar
      if (consecutiveParseFails >= 2) {
        dynamicBatch = nextLowerBatch(dynamicBatch);
        log("warn", `[${category.id}] ${kind}: reduzindo batch para ${dynamicBatch}`);
      }

      await sleep(API_CALL_DELAY_MS_BASE + Math.floor(Math.random() * 400));
      continue;
    }

    consecutiveParseFails = 0;

    // Filtra e valida os itens retornados, aproveitando o que é bom
    const uniqueToAdd: any[] = [];
    for (const rawItem of rawParsed) {
      if (curiosityMode) {
        if (
          validateCuriosity(rawItem) &&
          !isDuplicateCuriosity(
            rawItem.title,
            rawItem.content,
            bannedContent.concat(uniqueToAdd.map((i) => i.title))
          )
        ) {
          const newItem = normalizeCuriosityFields(rawItem as Curiosity);
          newItem.id = nextSequentialId(existingItems.concat(uniqueToAdd), category.id);
          newItem.categoryId = category.id;
          uniqueToAdd.push(newItem);
          globalTitleHashes.add(sha1(normalizeText(newItem.title)));
          globalContentHashes.add(sha1(normalizeText(newItem.content)));
          dirtyHashCount++;
        }
      } else {
        if (
          validateQuizStrict(rawItem) &&
          !isDuplicateQuizQuestion(rawItem.question, bannedContent.concat(uniqueToAdd.map((i) => i.question)))
        ) {
          const newItem = rawItem as QuizQuestion;
          newItem.id = nextSequentialId(existingItems.concat(uniqueToAdd), `quiz-${category.id}`);
          newItem.categoryId = category.id;
          uniqueToAdd.push(newItem);
          globalQuizHashes.add(sha1(normalizeText(newItem.question)));
          dirtyHashCount++;
        }
      }
    }

    if (uniqueToAdd.length > 0) {
      existingItems.push(...uniqueToAdd);
      await writeCategoryJson(filePath, existingItems);
      generatedCount += uniqueToAdd.length;
      progressBar.increment(uniqueToAdd.length);

      // checkpoints
      const key = category.id;
      const entry = (cp[key] = cp[key] || {});
      if (curiosityMode) entry.curiositiesBatchesProcessed = (entry.curiositiesBatchesProcessed ?? 0) + 1;
      else entry.quizzesBatchesProcessed = (entry.quizzesBatchesProcessed ?? 0) + 1;
      entry.lastRunAt = new Date().toISOString();
      await writeCheckpoints(cp);
      await flushGlobalHashesIfNeeded(false);
    } else {
      // Se o batch veio todo inválido por validação/duplicatas, ajusta batch para tentar maior diversidade
      dynamicBatch = nextLowerBatch(dynamicBatch);
      log("warn", `[${category.id}] ${kind}: batch válido=0 após validação; novo batch=${dynamicBatch}`);
    }

    // respeita leve delay + jitter para evitar rate limit
    await sleep(API_CALL_DELAY_MS_BASE + Math.floor(Math.random() * 300));
  }

  bars.multibar.remove(progressBar);
  log("info", `[${category.id}] ${kind} finalizado. Total: ${existingItems.length}`);
}

function nextLowerBatch(current: number) {
  if (current > 40) return 25;
  if (current > 25) return 20;
  if (current > 20) return 10;
  if (current > 10) return 5;
  if (current > 5) return 3;
  return 2;
}

async function equalizeCounts(kind: GenerateKind, cp: CheckpointSchema) {
  EQUALIZER_RUN = true;
  const target = isCuriosity(kind) ? CURIOSITIES_TARGET_PER_CATEGORY : QUIZ_QUESTIONS_TARGET_PER_CATEGORY;
  log("info", `=== Balanceando contagem de ${kind} para o alvo de ${target} ===`);

  const filtered = categories.filter((c) => {
    if (ONLY_CATEGORY && c.id !== ONLY_CATEGORY) return false;
    if (CATEGORY_EXCLUDE.includes(c.id)) return false;
    return true;
  });

  const multibar = new cliProgress.MultiBar(
    { clearOnComplete: false, hideCursor: true, format: "{bar} | {category} | {value}/{total} Itens" },
    cliProgress.Presets.shades_classic
  );

  for (const category of filtered) {
    await generateForCategory(category, kind, 0, cp, { multibar });
  }

  multibar.stop();
}

// ---------------- MAIN ----------------
let shuttingDown = false;
async function gracefulExit(cp: CheckpointSchema) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "Encerrando com segurança...");
  try {
    await flushGlobalHashesIfNeeded(true);
    await writeCheckpoints(cp);
  } catch (e) {
    log("warn", `Falha ao salvar estado no encerramento: ${(e as any)?.message ?? e}`);
  }
  await releaseLock();
}

async function seedExistingHashes() {
  log("info", "--- Semeando hashes de conteúdo existente ---");
  for (const c of categories) {
    const curFile = path.join(curiositiesDir, `${c.id}.json`);
    const curItems: Curiosity[] = await readCategoryJson(curFile);
    curItems.forEach((it) => {
      if (it?.title) globalTitleHashes.add(sha1(normalizeText(it.title)));
      if (it?.content) globalContentHashes.add(sha1(normalizeText(it.content)));
    });

    const quizFile = path.join(quizzesDir, `quiz-${c.id}.json`);
    const quizItems: QuizQuestion[] = await readCategoryJson(quizFile);
    quizItems.forEach((it) => {
      if (it?.question) globalQuizHashes.add(sha1(normalizeText(it.question)));
    });
  }
  log(
    "info",
    `Hashes prontos: ${globalTitleHashes.size} títulos, ${globalContentHashes.size} conteúdos, ${globalQuizHashes.size} perguntas`
  );
}

async function main() {
  log("info", "=== Iniciando geração de conteúdo (turbo JSON) ===");
  if (DRY_RUN) log("info", ">>> DRY-RUN ativado. Nenhuma alteração será salva. <<<");
  if (ONLY_CATEGORY) log("info", `>>> Apenas categoria: ${ONLY_CATEGORY} <<<`);
  if (CATEGORY_EXCLUDE.length) log("info", `>>> Excluindo: ${CATEGORY_EXCLUDE.join(", ")} <<<`);
  log("info", `Modelos: primary=${PRIMARY_MODEL} | fallback=${FALLBACK_MODEL} | Concurrency=${CONCURRENCY} | Batch inicial=${BATCH_SIZE}`);

  await ensureDirExists(dataDir);
  await ensureDirExists(curiositiesDir);
  await ensureDirExists(quizzesDir);

  await acquireLock();

  const cp = await readCheckpoints();
  await readGlobalHashes();
  await seedExistingHashes();

  // handlers de encerramento
  process.on("SIGINT", async () => {
    log("warn", "SIGINT recebido (CTRL+C).");
    await gracefulExit(cp);
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    log("warn", "SIGTERM recebido.");
    await gracefulExit(cp);
    process.exit(0);
  });

  if (EQUALIZE_ONLY) {
    log("info", "--- Rodando apenas a equalização ---");
    await equalizeCounts("curiosities", cp);
    await equalizeCounts("quizzes", cp);
    log("info", "=== Equalização finalizada! ===");
    await gracefulExit(cp);
    return;
  }

  log("info", "--- Iniciando geração por categoria ---");
  const multibar = new cliProgress.MultiBar(
    { clearOnComplete: false, hideCursor: true, format: "{bar} | {category} | {value}/{total} Itens" },
    cliProgress.Presets.shades_classic
  );
  const limit = pLimit(CONCURRENCY);

  const filteredCategories = categories.filter((c) => {
    if (ONLY_CATEGORY && c.id !== ONLY_CATEGORY) return false;
    if (CATEGORY_EXCLUDE.includes(c.id)) return false;
    return true;
  });

  const tasks = filteredCategories.flatMap((category) => [
    limit(() => generateForCategory(category, "curiosities", 0, cp, { multibar })),
    limit(() => generateForCategory(category, "quizzes", 0, cp, { multibar })),
  ]);
  await Promise.all(tasks);
  multibar.stop();

  if (!ONLY_CATEGORY) {
    await equalizeCounts("curiosities", cp);
    await equalizeCounts("quizzes", cp);
  }

  log("info", "=== Geração finalizada com sucesso! ===");
  await gracefulExit(cp);
}

main().catch(async (err) => {
  log("error", `Erro fatal: ${err?.stack || err?.message || err}`);
  const cp = await readCheckpoints();
  await gracefulExit(cp);
  process.exit(1);
});
