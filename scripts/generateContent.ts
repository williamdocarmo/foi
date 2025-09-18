
/**
 * Gerador de conteúdo robusto (curiosidades + quizzes) — versão anti-empacado + count-exato + CONTAGEM & PROMPT
 *
 * Novidades deste patch:
 * 1) CONTADOR por categoria: mostra quantas curiosidades e quizzes existem por categoria antes de gerar.
 * 2) PROMPT interativo: se você não passar --category, eu pergunto em qual categoria e tipo (curiosities/quizzes/ambos) você quer gerar mais.
 * 3) PERFORMANCE: menos I/O síncrono, flush de hashes por lote, escrita em buffer, menor backoff quando está “fluindo”,
 *    e melhores defaults de concorrência/batch (ajustáveis por flags).
 *
 * Observações:
 * - --count N continua significando "GERAR N ITENS NESTA EXECUÇÃO" (por categoria), não "meta".
 * - Use --no-ask para pular o prompt interativo (útil em CI).
 * - Para seleção automática da maior deficiência, use --auto-pick (se nenhuma categoria for passada).
 * - Para manter comportamento antigo, passe explicitamente --category <id> e/ou --only <curiosities|quizzes>.
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
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ✔️ nova sintaxe (sem 'assert' deprecado)
import categories from "../src/lib/data/categories.json" with { type: "json" };

import type { Curiosity, QuizQuestion } from "../src/lib/types";

config();

// ---------------- CONFIG & FLAGS ----------------
const argv = minimist(process.argv.slice(2));
const ARG_ONLY_CATEGORY: string | undefined = argv.category;
const CATEGORY_EXCLUDE: string[] = (argv["category-exclude"] ? String(argv["category-exclude"]) : "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DRY_RUN = !!argv["dry-run"];
const EQUALIZE_ONLY = !!argv["equalize-only"];
const FORCE = !!argv["force"];
const NO_ASK = !!argv["no-ask"];
const AUTO_PICK = !!argv["auto-pick"];

// NOVO: controlar tipos a gerar
type OnlyKind = "curiosities" | "quizzes" | "ambos" | undefined;
const ONLY_KIND_CLI: OnlyKind = argv.only ? (String(argv.only) as OnlyKind) : undefined;

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error("GEMINI_API_KEY is not defined in your .env file");

const PRIMARY_MODEL = String(argv.model || process.env.GEMINI_MODEL || "gemini-1.5-flash");
const FALLBACK_MODEL = String(process.env.GEMINI_MODEL_FALLBACK || "gemini-1.5-pro");

const genAI = new GoogleGenerativeAI(API_KEY);
let model = genAI.getGenerativeModel({ model: PRIMARY_MODEL });

// Metas globais (usadas só quando NÃO há --count)
const CURIOSITIES_TARGET_PER_CATEGORY = Number(process.env.CURIOSITIES_TARGET ?? 1000);
const QUIZ_QUESTIONS_TARGET_PER_CATEGORY = Number(process.env.QUIZ_TARGET ?? 500);

// NOVO: quando presente, é “gerar exatamente N nesta execução”
const REQUEST_COUNT_CLI: number | undefined =
  argv.count !== undefined ? Math.max(0, Number(argv.count)) : undefined;

// Batch & conc (melhores defaults; sempre passíveis de override por flag)
const DEFAULT_BATCH_SIZE = 40;
const BATCH_SIZE = Number(argv["batch-size"] ?? DEFAULT_BATCH_SIZE);

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 700;

// Quando está “fluindo” bem a validação e diversidade, baixamos o delay.
function apiDelayMs(zeroValidStreak: number) {
  if (zeroValidStreak === 0) return 180 + Math.floor(Math.random() * 160);
  if (zeroValidStreak < 3) return 260 + Math.floor(Math.random() * 220);
  return 350 + Math.floor(Math.random() * 300);
}

const DEFAULT_CONCURRENCY = 8;
const CONCURRENCY = Number(argv["concurrency"] ?? DEFAULT_CONCURRENCY);

// Dedup adaptativa
const SIMILARITY_THRESHOLD_STRICT = 0.75;
const HASH_FLUSH_INTERVAL = 250; // ↑, menos gravações
const HARD_WRITE_BUFFER = 50; // grava após N itens válidos adicionados
const DIVERSITY_STREAK_THRESHOLD = 3;
const RELAX_DEDUP_STREAK_THRESHOLD = 12;
const HARD_DIVERSITY_STREAK_THRESHOLD = 24;

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
function sample<T>(arr: T[], n: number): T[] {
  if (n <= 0 || arr.length === 0) return [];
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
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
  if (wc < 30 || wc > 110) return false; // elástico p/ destravar

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

// ---------------- DUPLICATES (adaptativo) ----------------
function isDupCuriosityAdaptive(
  title: string,
  content: string,
  existingTitles: string[],
  aggressive: boolean
) {
  const tNorm = normalizeText(title);
  const cNorm = normalizeText(content);
  if (!tNorm || !cNorm) return true;

  const tHash = sha1(tNorm);
  const cHash = sha1(cNorm);

  if (globalTitleHashes.has(tHash) || globalContentHashes.has(cHash)) return true;
  if (existingTitles.includes(title)) return true;

  if (!aggressive) return false;

  if (existingTitles.length > 0) {
    const best = stringSimilarity.findBestMatch(title, existingTitles);
    if (best?.bestMatch && best.bestMatch.rating >= SIMILARITY_THRESHOLD_STRICT) return true;
  }
  return false;
}

function isDupQuizAdaptive(question: string, existingQuestions: string[], aggressive: boolean) {
  const qNorm = normalizeText(question);
  if (!qNorm) return true;

  const qHash = sha1(qNorm);
  if (globalQuizHashes.has(qHash)) return true;
  if (existingQuestions.includes(question)) return true;

  if (!aggressive) return false;

  if (existingQuestions.length > 0) {
    const best = stringSimilarity.findBestMatch(question, existingQuestions);
    if (best?.bestMatch && best.bestMatch.rating >= SIMILARITY_THRESHOLD_STRICT) return true;
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
} as const;

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
} as const;

// ---------------- API + RETRIES ----------------
type GenMode = "curiosities" | "quizzes";

async function generateJsonArrayWithRetry(
  mode: GenMode,
  prompt: string,
  count: number,
  attempt = 1,
  currentModel = model,
  diversityLevel: "none" | "moderate" | "hard" = "none"
): Promise<any[] | null> {
  const isQuiz = mode === "quizzes";
  const schema = {
    type: "ARRAY",
    items: isQuiz ? quizItemSchema : curiosityItemSchema,
  } as any;

  const cfg =
    diversityLevel === "hard"
      ? { temperature: 1.0, topK: 80, topP: 0.95 }
      : diversityLevel === "moderate"
      ? { temperature: 0.85, topK: 60, topP: 0.92 }
      : { temperature: 0.7, topK: 40, topP: 0.9 };

  try {
    const result = await currentModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "ARRAY", items: isQuiz ? quizItemSchema : curiosityItemSchema } as any,
        maxOutputTokens: 4096,
        ...cfg,
      },
    });
    const txt = result.response.text();
    const parsed = await safeParseJsonText<any[]>(txt);
    if (Array.isArray(parsed) && parsed.length) return parsed;

    const repaired = await tryRepairArray(txt);
    if (Array.isArray(repaired) && repaired.length) return repaired;

    return null;
  } catch (err: any) {
    const status = err?.status;
    const retriable =
      [408, 409, 425, 429, 500, 502, 503, 504].includes(status) ||
      (!status && attempt <= Math.ceil(MAX_RETRIES / 2));

    if (attempt <= MAX_RETRIES && retriable) {
      const delay = Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 600);
      log("warn", `API error (status=${status ?? "?"}). Retry em ${delay}ms (tentativa ${attempt}/${MAX_RETRIES})`);
      await sleep(delay);

      if (attempt === Math.ceil(MAX_RETRIES / 2) && currentModel === model && FALLBACK_MODEL) {
        log("warn", `Alternando para modelo fallback: ${FALLBACK_MODEL}`);
        const fb = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
        return generateJsonArrayWithRetry(mode, prompt, count, attempt + 1, fb, diversityLevel);
      }

      return generateJsonArrayWithRetry(mode, prompt, count, attempt + 1, currentModel, diversityLevel);
    }

    log("error", `Erro não-retryable ou máximas tentativas: ${err?.message ?? err}`);
    return null;
  }
}

async function tryRepairArray(txt: string | null): Promise<any[] | null> {
  if (!txt) return null;
  const parsed = await safeParseJsonText<any[]>(txt);
  if (Array.isArray(parsed)) return parsed;

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
function buildCuriosityPrompt(
  categoryName: string,
  count: number,
  bannedTitles: string[],
  diversity: "none" | "moderate" | "hard" = "none"
) {
  const banned = sample(bannedTitles, 80); // amostra aleatória
  const hint =
    diversity === "hard"
      ? "Explore ângulos pouco usuais, jargões, exceções, contextos culturais e long-tail. Evite repetir construções."
      : diversity === "moderate"
      ? "Prefira subtemas variados e termos menos frequentes. Evite clichês e reformulações óbvias."
      : "";

  return `
Gere ${count} curiosidades INÉDITAS e atraentes sobre "${categoryName}".
Saída: APENAS um ARRAY JSON de objetos com chaves: "title", "hook", "content", "funFact", "curiosityLevel".
Restrições:
- title 6–80 chars, intrigante, única. Não repetir: ${JSON.stringify(banned)}
- content: 40–80 palavras, parágrafo corrido, linguagem simples.
- funFact: 1 frase extra surpreendente (obrigatório).
- curiosityLevel: inteiro 1–5.
${hint}
Sem markdown, sem comentários, sem textos fora do JSON.
`;
}

function buildQuizPrompt(
  categoryName: string,
  count: number,
  bannedQuestions: string[],
  diversity: "none" | "moderate" | "hard" = "none"
) {
  const banned = sample(bannedQuestions, 80); // amostra aleatória
  const hint =
    diversity === "hard"
      ? "Misture formatos: cenário, contraexemplo, lacuna, analogia. Foque exceções, armadilhas e usos reais."
      : diversity === "moderate"
      ? "Varie formatos (definição, cenário, contraexemplo) e escolha subtemas menos comuns."
      : "";

  return `
Gere ${count} perguntas de quiz ORIGINAIS sobre "${categoryName}".
Saída: APENAS um ARRAY JSON de objetos com:
- difficulty: "easy" | "medium" | "hard"
- question: string clara e única (não repetir: ${JSON.stringify(banned)})
- options: array com 4 alternativas plausíveis e distintas
- correctAnswer: string igual a uma das options
- explanation: curta, dizendo por que a correta está certa e as outras 3 não; inclua 1 curiosidade.
${hint}
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
  await ensureDirExists(curiositiesDir);
  await ensureDirExists(quizzesDir);
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

// ---------------- CONTAGEM ----------------
type Counts = { curiosities: number; quizzes: number };
async function getCategoryCounts(categoryId: string): Promise<Counts> {
  const curFile = path.join(curiositiesDir, `${categoryId}.json`);
  const curItems: any[] = await readCategoryJson(curFile);
  const quizFile = path.join(quizzesDir, `quiz-${categoryId}.json`);
  const quizItems: any[] = await readCategoryJson(quizFile);
  return { curiosities: curItems.length, quizzes: quizItems.length };
}

async function computeAllCounts() {
  const res: Record<string, Counts> = {};
  for (const c of categories) {
    res[c.id] = await getCategoryCounts(c.id);
  }
  return res;
}

function padRight(s: string, len: number) {
  return (s + " ".repeat(len)).slice(0, len);
}
function padLeft(n: number, len: number) {
  const s = String(n);
  return " ".repeat(Math.max(0, len - s.length)) + s;
}

function printCountsTable(counts: Record<string, Counts>) {
  const header = `\nResumo por categoria:\n${padRight("Categoria", 20)} | ${padRight("Curiosidades", 12)} | ${padRight("Quizzes", 8)} | ΔCurio | ΔQuiz`;
  log("info", header);
  for (const c of categories) {
    const ct = counts[c.id] ?? { curiosities: 0, quizzes: 0 };
    const dC = CURIOSITIES_TARGET_PER_CATEGORY - ct.curiosities;
    const dQ = QUIZ_QUESTIONS_TARGET_PER_CATEGORY - ct.quizzes;
    console.log(`${padRight(`${c.id}`, 20)} | ${padLeft(ct.curiosities, 12)} | ${padLeft(ct.quizzes, 8)} | ${padLeft(dC, 5)} | ${padLeft(dQ, 4)}`);
  }
  console.log("");
}

function pickLargestDeficit(counts: Record<string, Counts>): { id: string; kind: "curiosities" | "quizzes" } | null {
  let best: { id: string; kind: "curiosities" | "quizzes"; deficit: number } | null = null;
  for (const c of categories) {
    const ct = counts[c.id];
    if (!ct) continue;
    const dC = CURIOSITIES_TARGET_PER_CATEGORY - ct.curiosities;
    const dQ = QUIZ_QUESTIONS_TARGET_PER_CATEGORY - ct.quizzes;
    const pairs: Array<["curiosities"|"quizzes", number]> = [["curiosities", dC], ["quizzes", dQ]];
    for (const [kind, deficit] of pairs) {
      if (deficit > 0 && (!best || deficit > best.deficit)) {
        best = { id: c.id, kind, deficit };
      }
    }
  }
  return best ? { id: best.id, kind: best.kind } : null;
}

// ---------------- CORE GENERATION PIPELINE ----------------
type GenerateKind = "curiosities" | "quizzes";
let EQUALIZER_RUN = false;
let writeBufferCounter = 0;

function isCuriosity(kind: GenerateKind): kind is "curiosities" {
  return kind === "curiosities";
}

async function generateForCategory(
  category: (typeof categories)[0],
  kind: GenerateKind,
  totalToGenerate: number, // quando >0, força gerar exatamente N
  cp: CheckpointSchema,
  bars: { multibar: cliProgress.MultiBar }
) {
  const curiosityMode = isCuriosity(kind);
  const filePath = path.join(curiosityMode ? curiositiesDir : quizzesDir, `${curiosityMode ? "" : "quiz-"}${category.id}.json`);
  const targetCount = curiosityMode ? CURIOSITIES_TARGET_PER_CATEGORY : QUIZ_QUESTIONS_TARGET_PER_CATEGORY;

  const existingItems = await readCategoryJson<any[]>(filePath);

  // NOVO: prioridade ao totalToGenerate (da chamada) ou ao --count
  const desiredNow =
    totalToGenerate > 0
      ? totalToGenerate
      : REQUEST_COUNT_EFFECTIVE !== undefined
      ? REQUEST_COUNT_EFFECTIVE
      : Math.max(0, targetCount - existingItems.length);

  if (desiredNow === 0 && !EQUALIZER_RUN) {
    log(
      "info",
      `[${category.id}] ${kind}: ${existingItems.length}/${targetCount}. Nenhuma ação necessária (desiredNow=0).`
    );
    return;
  }

  log(
    "info",
    `[${category.id}] ${kind}: existentes=${existingItems.length} | gerar agora=${desiredNow} ${
      REQUEST_COUNT_EFFECTIVE !== undefined ? "(via --count/prompt)" : "(via meta)"
    }`
  );

  const progressBar = bars.multibar.create(desiredNow, 0, { category: `${category.id} ${kind}` });

  let generatedCount = 0;
  let dynamicBatch = Math.min(BATCH_SIZE, desiredNow);
  let consecutiveParseFails = 0;
  let zeroValidStreak = 0;

  while (generatedCount < desiredNow) {
    const remaining = desiredNow - generatedCount;
    const batchGenSize = Math.max(2, Math.min(remaining, dynamicBatch));
    if (batchGenSize <= 0) break;

    const bannedAll = curiosityMode ? existingItems.map((i) => i.title) : existingItems.map((i) => i.question);

    const diversityLevel =
      zeroValidStreak >= HARD_DIVERSITY_STREAK_THRESHOLD
        ? "hard"
        : zeroValidStreak >= DIVERSITY_STREAK_THRESHOLD
        ? "moderate"
        : "none";
    const aggressiveDedup = zeroValidStreak < RELAX_DEDUP_STREAK_THRESHOLD;

    const prompt = curiosityMode
      ? buildCuriosityPrompt(category.name, batchGenSize, bannedAll, diversityLevel)
      : buildQuizPrompt(category.name, batchGenSize, bannedAll, diversityLevel);

    const rawParsed = await generateJsonArrayWithRetry(
      curiosityMode ? "curiosities" : "quizzes",
      prompt,
      batchGenSize,
      1,
      model,
      diversityLevel
    );

    if (!rawParsed || !Array.isArray(rawParsed) || rawParsed.length === 0) {
      consecutiveParseFails++;
      log("warn", `[${category.id}] ${kind}: resposta não parseável/sem itens. Pulando batch.`);
      if (consecutiveParseFails >= 2) {
        dynamicBatch = nextLowerBatch(dynamicBatch);
        log("warn", `[${category.id}] ${kind}: reduzindo batch para ${dynamicBatch}`);
      }
      await sleep(apiDelayMs(zeroValidStreak));
      continue;
    }

    consecutiveParseFails = 0;

    const uniqueToAdd: any[] = [];
    for (const rawItem of rawParsed) {
      if (curiosityMode) {
        if (
          validateCuriosity(rawItem) &&
          !isDupCuriosityAdaptive(
            rawItem.title,
            rawItem.content,
            bannedAll.concat(uniqueToAdd.map((i) => i.title)),
            aggressiveDedup
          )
        ) {
          const newItem = normalizeCuriosityFields(rawItem as Curiosity);
          newItem.id = nextSequentialId(existingItems.concat(uniqueToAdd), category.id);
          newItem.categoryId = category.id;
          uniqueToAdd.push(newItem);
          globalTitleHashes.add(sha1(normalizeText(newItem.title)));
          globalContentHashes.add(sha1(normalizeText(newItem.content)));
          dirtyHashCount++; writeBufferCounter++;
        }
      } else {
        if (
          validateQuizStrict(rawItem) &&
          !isDupQuizAdaptive(
            rawItem.question,
            bannedAll.concat(uniqueToAdd.map((i) => i.question)),
            aggressiveDedup
          )
        ) {
          const newItem = rawItem as QuizQuestion;
          newItem.id = nextSequentialId(existingItems.concat(uniqueToAdd), `quiz-${category.id}`);
          newItem.categoryId = category.id;
          uniqueToAdd.push(newItem);
          globalQuizHashes.add(sha1(normalizeText(newItem.question)));
          dirtyHashCount++; writeBufferCounter++;
        }
      }
    }

    if (uniqueToAdd.length > 0) {
      zeroValidStreak = 0;
      existingItems.push(...uniqueToAdd);

      // Escrita menos frequente: somente quando buffer enche ou quando o loop finalizará
      const willFinish = (generatedCount + uniqueToAdd.length) >= desiredNow;
      if (writeBufferCounter >= HARD_WRITE_BUFFER || willFinish) {
        await writeCategoryJson(filePath, existingItems);
        writeBufferCounter = 0;
        await flushGlobalHashesIfNeeded(false);
      }

      generatedCount += uniqueToAdd.length;
      progressBar.increment(uniqueToAdd.length);

      const key = category.id;
      const entry = (cp[key] = cp[key] || {});
      if (curiosityMode) entry.curiositiesBatchesProcessed = (entry.curiositiesBatchesProcessed ?? 0) + 1;
      else entry.quizzesBatchesProcessed = (entry.quizzesBatchesProcessed ?? 0) + 1;
      entry.lastRunAt = new Date().toISOString();
      // checkpoints podem ser escritos com menor frequência também
      if (!DRY_RUN && (generatedCount % Math.max(5, Math.floor(desiredNow/4)) === 0 || willFinish)) {
        await writeCheckpoints(cp);
      }
    } else {
      zeroValidStreak++;
      dynamicBatch = nextLowerBatch(dynamicBatch);
      log(
        "warn",
        `[${category.id}] ${kind}: batch válido=0 após validação; novo batch=${dynamicBatch} (streak=${zeroValidStreak})`
      );
    }

    await sleep(apiDelayMs(zeroValidStreak));
  }

  bars.multibar.remove(progressBar);
  log("info", `[${category.id}] ${kind} finalizado. Gerados agora: ${generatedCount}/${desiredNow}. Total acumulado: ${existingItems.length}`);
}

function nextLowerBatch(current: number) {
  if (current > 60) return 40;
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
    if (SELECTED_CATEGORY && c.id !== SELECTED_CATEGORY) return false;
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

// ---------------- INTERATIVIDADE ----------------
let SELECTED_CATEGORY: string | undefined = ARG_ONLY_CATEGORY;
let ONLY_KIND: OnlyKind = ONLY_KIND_CLI;
let REQUEST_COUNT_EFFECTIVE: number | undefined = REQUEST_COUNT_CLI;

async function promptUserSelection(counts: Record<string, Counts>) {
  if (SELECTED_CATEGORY || NO_ASK) return;

  const rl = readline.createInterface({ input, output });
  try {
    console.log("");
    printCountsTable(counts);

    // se auto-pick, escolher maior déficit
    if (AUTO_PICK) {
      const pick = pickLargestDeficit(counts);
      if (pick) {
        SELECTED_CATEGORY = pick.id;
        ONLY_KIND = pick.kind;
        log("info", `Auto-pick: categoria=${SELECTED_CATEGORY}, tipo=${ONLY_KIND}`);
        return;
      }
    }

    const ids = categories.map((c) => c.id).join(", ");
    const cat = (await rl.question(`Qual categoria você quer priorizar? [enter=pular / opções: ${ids}] `)).trim();
    if (cat && categories.some((c) => c.id === cat)) {
      SELECTED_CATEGORY = cat;
    }

    if (!ONLY_KIND) {
      const kind = (await rl.question(`Gerar o quê? [curiosities|quizzes|ambos, default=ambos] `)).trim().toLowerCase();
      if (kind === "curiosities" || kind === "quizzes" || kind === "ambos") {
        ONLY_KIND = kind as OnlyKind;
      } else {
        ONLY_KIND = "ambos";
      }
    }

    if (REQUEST_COUNT_EFFECTIVE === undefined) {
      const cnt = (await rl.question(`Quantos itens por tipo nesta execução? [ex: 40, enter=usar meta] `)).trim();
      if (cnt) {
        const n = Number(cnt);
        if (Number.isFinite(n) && n > 0) REQUEST_COUNT_EFFECTIVE = n;
      }
    }
  } finally {
    rl.close();
  }
}

async function acquireLockAndDirs() {
  await ensureDirExists(dataDir);
  await ensureDirExists(curiositiesDir);
  await ensureDirExists(quizzesDir);
  await acquireLock();
}

async function main() {
  log("info", "=== Iniciando geração de conteúdo (anti-empacado + count-exato + contagem/prompt) ===");
  if (DRY_RUN) log("info", ">>> DRY-RUN ativado. Nenhuma alteração será salva. <<<");
  if (ARG_ONLY_CATEGORY) log("info", `>>> Apenas categoria (via flag): ${ARG_ONLY_CATEGORY} <<<`);
  if (CATEGORY_EXCLUDE.length) log("info", `>>> Excluindo: ${CATEGORY_EXCLUDE.join(", ")} <<<`);
  if (ONLY_KIND_CLI) log("info", `>>> Apenas tipo (via flag): ${ONLY_KIND_CLI} <<<`);
  if (REQUEST_COUNT_CLI !== undefined) log("info", `>>> Gerar exatamente ${REQUEST_COUNT_CLI} item(ns) nesta execução (via flag) <<<`);
  log(
    "info",
    `Modelos: primary=${PRIMARY_MODEL} | fallback=${FALLBACK_MODEL} | Concurrency=${CONCURRENCY} | Batch inicial=${BATCH_SIZE}`
  );

  await acquireLockAndDirs();

  const cp = await readCheckpoints();
  await readGlobalHashes();
  await seedExistingHashes();

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

  // 1) Mostrar contagens e (opcional) perguntar
  const counts = await computeAllCounts();
  printCountsTable(counts);
  await promptUserSelection(counts);

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
    if (SELECTED_CATEGORY && c.id !== SELECTED_CATEGORY) return false;
    if (CATEGORY_EXCLUDE.includes(c.id)) return false;
    return true;
  });

  const tasks: Array<Promise<void>> = [];
  for (const category of filteredCategories) {
    const both = !ONLY_KIND || ONLY_KIND === "ambos";
    if (both || ONLY_KIND === "curiosities") {
      tasks.push(limit(() => generateForCategory(category, "curiosities", REQUEST_COUNT_EFFECTIVE ?? 0, cp, { multibar })));
    }
    if (both || ONLY_KIND === "quizzes") {
      tasks.push(limit(() => generateForCategory(category, "quizzes", REQUEST_COUNT_EFFECTIVE ?? 0, cp, { multibar })));
    }
  }

  await Promise.all(tasks);
  multibar.stop();

  // Se o usuário pediu count exato, não roda equalize automático
  if (!SELECTED_CATEGORY && REQUEST_COUNT_EFFECTIVE === undefined) {
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