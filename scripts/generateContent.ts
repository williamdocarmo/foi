// scripts/generateContent.ts
/**
 * Gerador de conteúdo robusto (curiosidades + quizzes) — versão turbo
 *
 * Melhorias principais:
 * - Lockfile (data/.lock) + --force para evitar execuções concorrentes
 * - Checkpoints efetivos por categoria/kind (data/.checkpoints.json)
 * - Persistência de hashes globais (data/.global-hashes.json) para dedupe entre execuções
 * - Flags extras: --count, --batch-size, --concurrency, --category-exclude, --model, --force
 * - Cancelamento limpo (SIGINT/SIGTERM): salva estado e remove lock
 * - Logs com timestamp e níveis
 * - Prompts com reforço de formato e “anti-alucinação”
 *
 * Requer:
 *  - @google/generative-ai
 *  - json5
 *  - p-limit
 *  - cli-progress
 *  - string-similarity
 *  - fs-extra
 *  - minimist
 *  - tsx
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
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is not defined in your .env file");
}
const MODEL = String(argv.model || process.env.GEMINI_MODEL || "gemini-1.5-flash");

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL });

const CURIOSITIES_TARGET_PER_CATEGORY = Number(argv.count ?? process.env.CURIOSITIES_TARGET ?? 1000);
const QUIZ_QUESTIONS_TARGET_PER_CATEGORY = Number(argv.count ?? process.env.QUIZ_TARGET ?? 500);
const DEFAULT_BATCH_SIZE = 50;
const BATCH_SIZE = Number(argv["batch-size"] ?? DEFAULT_BATCH_SIZE);
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;
const API_CALL_DELAY_MS = 1200; // base + jitter
const DEFAULT_CONCURRENCY = 5;
const CONCURRENCY = Number(argv["concurrency"] ?? DEFAULT_CONCURRENCY);
const SIMILARITY_THRESHOLD = 0.82; // 0-1 (maior = mais estrito)
const HASH_FLUSH_INTERVAL = 200; // a cada N novos hashes, persistir em disco

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
const globalQuizHashes = new Set<string>(); // hash de pergunta normalizada

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

async function safeParseJsonText<T = any>(text: string): Promise< T | null > {
  if (!text || !text.trim()) return null;
  const stripped = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    try {
      return JSON5.parse(stripped) as T;
    } catch {
      // tenta capturar o último bloco JSON válido (array/obj)
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
  const content = item.content.trim();
  const wc = wordCount(content);
  if (wc < 40 || wc > 90) return false; // ↑ leve flexibilidade

  if (!item.funFact || typeof item.funFact !== "string") return false;
  if (item.funFact.trim().length < 10) return false;

  if (item.hook && (typeof item.hook !== "string" || item.hook.trim().length < 6)) return false;
  if (
    item.curiosityLevel &&
    !(Number.isFinite(item.curiosityLevel) && item.curiosityLevel >= 1 && item.curiosityLevel <= 5)
  )
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

  // 1) Hash global rápido
  if (globalTitleHashes.has(tHash) || globalContentHashes.has(cHash)) return true;

  // 2) Exato no batch atual
  if (existingTitles.includes(title)) return true;

  // 3) Fuzzy por título
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

  // 2) Exato no batch atual
  if (existingQuestions.includes(question)) return true;

  // 3) Fuzzy por pergunta
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
  cp.__meta__ = { lastWriteAt: new Date().toISOString() } as any;
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

// ---------------- API + RETRIES ----------------
async function generateWithRetry(prompt: string, attempt = 1): Promise<string | null> {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    if (!text || !text.trim()) {
      log("warn", "API retornou texto vazio");
      return null;
    }
    return text;
  } catch (err: any) {
    const retriable = [429, 503, 504].includes(err?.status) || (!err?.status && attempt <= 2);
    if (attempt <= MAX_RETRIES && retriable) {
      const delay = Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 1000);
      log("warn", `API error (status=${err?.status ?? "?"}). Retry em ${delay}ms (tentativa ${attempt}/${MAX_RETRIES})`);
      await sleep(delay);
      return generateWithRetry(prompt, attempt + 1);
    }
    log("error", `Erro não-retryable ou máximo de tentativas: ${err?.message ?? err}`);
    return null;
  }
}

// ---------------- PROMPTS ----------------
function buildCuriosityPrompt(categoryName: string, count: number, bannedTitles: string[]) {
  const banned = bannedTitles.slice(-200);
  return `
Você é um gerador confiável. Gere exatamente ${count} curiosidades INÉDITAS e atraentes sobre "${categoryName}".
FORMATO DE SAÍDA: retorne APENAS um ARRAY JSON (sem texto fora do JSON), onde cada item tem:
  - "title": string (6–80 chars), intrigante, única.
  - "hook": string (6–30 chars) estilo "Você sabia que..." ou "Incrível:".
  - "content": parágrafo com 40–80 palavras, linguagem simples e cativante.
  - "funFact": uma frase extra surpreendente (obrigatório).
  - "curiosityLevel": número inteiro 1–5 (1 = comum, 5 = ultra-raro).

REGRAS:
  - NÃO repetir, reescrever ou reordenar títulos existentes: ${JSON.stringify(banned)}
  - Varie o vocabulário e a estrutura das frases.
  - Evite listas; use parágrafo corrido.
  - Não inclua disclaimers, formatação markdown, ou comentários.

Se não tiver certeza, crie fatos gerais, mas plausíveis e não específicos a datas mutáveis.
Retorne apenas o ARRAY JSON.
  `;
}

function buildQuizPrompt(categoryName: string, count: number, bannedQuestions: string[]) {
  const banned = bannedQuestions.slice(-200);
  return `
Gere exatamente ${count} perguntas de quiz ORIGINAIS sobre "${categoryName}".
FORMATO DE SAÍDA: retorne APENAS um ARRAY JSON (sem texto fora do JSON). Cada objeto deve ter:
  - "difficulty": 'easy' | 'medium' | 'hard'
  - "question": string (clara, única)
  - "options": array de 4 strings, plausíveis e distintas
  - "correctAnswer": string igual a uma das "options"
  - "explanation": texto curto dizendo por que a correta está certa E por que as outras 3 estão erradas; inclua 1 curiosidade extra.

REGRAS:
  - NÃO repetir perguntas existentes: ${JSON.stringify(banned)}
  - Varie dificuldade e estilo; evite começar sempre com o mesmo bigrama.
  - Evite números/datas muito específicos e controversos.
  - Não use formatação markdown, nem comentários fora do JSON.

Retorne apenas o ARRAY JSON.
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
    throw new Error(`Lockfile encontrado em ${lockPath}. Outra execução pode estar ativa.\nUse --force para sobrescrever.\nConteúdo: ${content}`);
  }
  const payload = { pid: process.pid, startedAt: new Date().toISOString(), model: MODEL };
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
  while (generatedCount < itemsToGenerate) {
    const batchGenSize = Math.min(itemsToGenerate - generatedCount, BATCH_SIZE);
    if (batchGenSize <= 0) break;

    const bannedContent = curiosityMode ? existingItems.map((i) => i.title) : existingItems.map((i) => i.question);

    const prompt = curiosityMode
      ? buildCuriosityPrompt(category.name, batchGenSize, bannedContent)
      : buildQuizPrompt(category.name, batchGenSize, bannedContent);

    const raw = await generateWithRetry(prompt);
    if (!raw) {
      await sleep(250); // pequena pausa antes de tentar próximo loop
      continue;
    }

    const parsed = await safeParseJsonText<any[]>(raw);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      log("warn", `[${category.id}] ${kind}: resposta não parseável/sem itens. Pulando batch.`);
      await sleep(150);
      continue;
    }

    const uniqueToAdd: any[] = [];

    for (const rawItem of parsed) {
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

      // atualiza checkpoints
      const key = category.id;
      const entry = (cp[key] = cp[key] || {});
      if (curiosityMode) {
        entry.curiositiesBatchesProcessed = (entry.curiositiesBatchesProcessed ?? 0) + 1;
      } else {
        entry.quizzesBatchesProcessed = (entry.quizzesBatchesProcessed ?? 0) + 1;
      }
      entry.lastRunAt = new Date().toISOString();
      await writeCheckpoints(cp);
      await flushGlobalHashesIfNeeded(false);
    }

    await sleep(API_CALL_DELAY_MS + Math.floor(Math.random() * 400));
  }

  bars.multibar.remove(progressBar);
  log("info", `[${category.id}] ${kind} finalizado. Total: ${existingItems.length}`);
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

async function main() {
  log("info", "=== Iniciando geração de conteúdo (robusta+) ===");
  if (DRY_RUN) log("info", ">>> DRY-RUN ativado. Nenhuma alteração será salva. <<<");
  if (ONLY_CATEGORY) log("info", `>>> Focando apenas na categoria: ${ONLY_CATEGORY} <<<`);
  if (CATEGORY_EXCLUDE.length) log("info", `>>> Excluindo categorias: ${CATEGORY_EXCLUDE.join(", ")} <<<`);
  log("info", `Modelo: ${MODEL} | Concurrency: ${CONCURRENCY} | Batch: ${BATCH_SIZE}`);

  await ensureDirExists(dataDir);
  await ensureDirExists(curiositiesDir);
  await ensureDirExists(quizzesDir);

  await acquireLock();

  const cp = await readCheckpoints();
  await readGlobalHashes();

  // Semear hashes com todo o conteúdo existente (além dos persistidos)
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

  // Execução
  if (EQUALIZE_ONLY) {
    log("info", "--- Rodando apenas a equalização ---");
    await equalizeCounts("curiosities", cp);
    await equalizeCounts("quizzes", cp);
    log("info", "=== Equalização finalizada! ===");
    await gracefulExit(cp);
    return;
  }

  const filteredCategories = categories.filter((c) => {
    if (ONLY_CATEGORY && c.id !== ONLY_CATEGORY) return false;
    if (CATEGORY_EXCLUDE.includes(c.id)) return false;
    return true;
  });

  log("info", "--- Iniciando geração por categoria ---");
  const multibar = new cliProgress.MultiBar(
    { clearOnComplete: false, hideCursor: true, format: "{bar} | {category} | {value}/{total} Itens" },
    cliProgress.Presets.shades_classic
  );
  const limit = pLimit(CONCURRENCY);

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
  // tenta encerrar com estado salvo
  const cp = await readCheckpoints();
  await gracefulExit(cp);
  process.exit(1);
});
