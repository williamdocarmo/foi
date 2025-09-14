// scripts/generateContent.ts
/**
 * Gerador de conteúdo robusto (curiosidades + quizzes)
 * - Checkpoint por categoria (data/.checkpoints.json)
 * - Parser tolerante (JSON.parse -> JSON5 -> regex com lazy)
 * - Validação estrita (curiosidades + quizzes)
 * - Deduplicação forte (normalização + hash global + fuzzy fallback)
 * - Exponential backoff + jitter
 * - Escrita incremental segura (temp -> atomic rename)
 * - Progress bar por categoria
 * - Equalização de quantidades (todas as categorias com a mesma contagem)
 * - Flags CLI: --category=<id>, --dry-run, --equalize-only
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

// ---------------- CONFIG ----------------
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is not defined in your .env file");
}
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const argv = minimist(process.argv.slice(2));
const ONLY_CATEGORY: string | undefined = argv.category;
const DRY_RUN = !!argv["dry-run"];
const EQUALIZE_ONLY = !!argv["equalize-only"];

const CURIOSITIES_TARGET_PER_CATEGORY = 1000;
const QUIZ_QUESTIONS_TARGET_PER_CATEGORY = 500;
const BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;
const API_CALL_DELAY_MS = 1200; // base + jitter
const CONCURRENCY = 3;
const SIMILARITY_THRESHOLD = 0.82; // 0-1 (maior = mais estrito)

// ESM-safe ROOT
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), "..");
const dataDir = path.join(ROOT, "data");
const curiositiesDir = path.join(dataDir, "curiosities");
const quizzesDir = path.join(dataDir, "quiz-questions");
const checkpointPath = path.join(dataDir, ".checkpoints.json");

// ---------------- GLOBAL DEDUPE STATE ----------------
const globalTitleHashes = new Set<string>();
const globalContentHashes = new Set<string>();
const globalQuizHashes = new Set<string>(); // hash de pergunta normalizada

// ---------------- UTIL ----------------
async function ensureDirExists(dirPath: string) {
  await fsExtra.ensureDir(dirPath);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function atomicWriteJson(filePath: string, data: any) {
  if (DRY_RUN) {
    console.log(`[dry-run] write -> ${filePath} (${Array.isArray(data) ? data.length : "obj"})`);
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
  try {
    return JSON.parse(text) as T;
  } catch {
    try {
      return JSON5.parse(text) as T;
    } catch {
      // regex menos gulosa
      const match = text.match(/(\[[\s\S]*?\]|\{[\s\S]*?\})/);
      if (match) {
        const block = match[0];
        try {
          return JSON.parse(block) as T;
        } catch {
          try {
            return JSON5.parse(block) as T;
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
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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
  if (wc < 40 || wc > 80) return false;

  if (!item.funFact || typeof item.funFact !== "string") return false;
  if (item.funFact.trim().length < 10) return false;

  // hook e curiosityLevel são desejáveis (não obrigatórios aqui),
  // mas se existirem, validamos suavemente:
  if (item.hook && (typeof item.hook !== "string" || item.hook.trim().length < 6)) return false;
  if (item.curiosityLevel && !(Number.isFinite(item.curiosityLevel) && item.curiosityLevel >= 1 && item.curiosityLevel <= 5)) return false;

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
  if (!optsTrim.some(o => norm(o) === norm(ca))) return false;

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

  // 3) Fuzzy por título (fallback se a lista não for vazia)
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

  // 3) Fuzzy por pergunta (fallback se a lista não for vazia)
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
  await atomicWriteJson(checkpointPath, cp);
}

// ---------------- API + RETRIES ----------------
async function generateWithRetry(prompt: string, attempt = 1): Promise<string | null> {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    if (!text || !text.trim()) {
      console.warn("  [WARN] API returned empty text");
      return null;
    }
    return text;
  } catch (err: any) {
    const retriable =
      [429, 503, 504].includes(err?.status) ||
      (!err?.status && attempt <= 2); // se status ausente, tente 2x

    if (attempt <= MAX_RETRIES && retriable) {
      const delay = Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 1000);
      console.warn(`  [WARN] API error (status=${err?.status ?? "?"}). Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
      await sleep(delay);
      return generateWithRetry(prompt, attempt + 1);
    }
    console.error("  [ERROR] Non-retriable or max retries reached:", err?.message ?? err);
    return null;
  }
}

// ---------------- PROMPTS ----------------
function buildCuriosityPrompt(categoryName: string, count: number, bannedTitles: string[]) {
  const banned = bannedTitles.slice(0, 200);
  return `
Gere ${count} curiosidades INÉDITAS e atraentes sobre o tema "${categoryName}".
Saída: um ARRAY JSON de objetos.
Cada objeto deve ter:
- "title": título curto e intrigante (6-80 chars).
- "hook": frase curta (6-30 chars) que prenda a atenção, estilo "Você sabia que..." ou "Incrível:".
- "content": parágrafo entre 40 e 80 palavras, linguagem simples e cativante.
- "funFact": uma frase extra surpreendente (OBRIGATÓRIO).
- "curiosityLevel": número de 1 a 5 (1 = comum, 5 = ultra-raro).
Regras:
- NÃO repita, reescreva ou reordene títulos já existentes: ${banned.join(" ; ")}
- Priorize variações, fatos pouco óbvios, histórias curtas e sensação de surpresa.
- Varie o vocabulário e evite começar frases com as mesmas palavras.
Retorne APENAS o array JSON, sem comentários extras.
`;
}

function buildQuizPrompt(categoryName: string, count: number, bannedQuestions: string[]) {
  const banned = bannedQuestions.slice(-200);
  return `
Gere ${count} perguntas de quiz originais sobre "${categoryName}".
Saída: um ARRAY JSON de objetos.
Cada objeto deve ter:
- "difficulty": 'easy' | 'medium' | 'hard'
- "question": string (curta e clara)
- "options": array de 4 strings, todas plausíveis mas apenas uma correta.
- "correctAnswer": uma das strings em "options"
- "explanation": texto curto explicando por que a resposta correta está certa E por que as outras 3 estão erradas, e adicione 1 curiosidade extra.
Regras:
- NÃO repita perguntas já existentes: ${banned.join(" ; ")}
- Varie dificuldade e estilo (múltipla escolha, perguntas surpreendentes).
- Varie o vocabulário; evite começar perguntas com o mesmo bigrama.
- Evite datas/valores inconsistentes ou não verificáveis.
Retorne APENAS o array JSON.
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
  } catch (e) {
    return [] as unknown as T;
  }
}

async function writeCategoryJson(filePath: string, arr: any[]) {
  const sorted = [...arr].sort((a, b) => {
    const aIdNum = a.id ? parseInt(String(a.id).split('-').pop() || '0', 10) : 0;
    const bIdNum = b.id ? parseInt(String(b.id).split('-').pop() || '0', 10) : 0;
    return aIdNum - bIdNum;
  });
  await atomicWriteJson(filePath, sorted);
}

// ---------------- CORE GENERATION PIPELINE ----------------
type GenerateKind = "curiosities" | "quizzes";

async function generateForCategory(category: typeof categories[0], kind: GenerateKind, totalToGenerate: number) {
  const isCuriosity = kind === "curiosities";
  const filePath = path.join(
    isCuriosity ? curiositiesDir : quizzesDir, 
    `${isCuriosity ? '' : 'quiz-'}${category.id}.json`
  );
  const targetCount = isCuriosity ? CURIOSITIES_TARGET_PER_CATEGORY : QUIZ_QUESTIONS_TARGET_PER_CATEGORY;
  
  const existingItems = await readCategoryJson<any[]>(filePath);
  const itemsToGenerate = totalToGenerate > 0 ? totalToGenerate : Math.max(0, targetCount - existingItems.length);

  if (itemsToGenerate === 0 && !EQUALIZER_RUN) {
    console.log(`  [${category.id}] ${kind}: ${existingItems.length}/${targetCount}. Nenhuma ação necessária.`);
    return;
  }
  
  console.log(`  [${category.id}] ${kind}: ${existingItems.length}/${targetCount}. Gerando ${itemsToGenerate} novos itens...`);

  const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: '{bar} | {category} | {value}/{total} Itens'
  }, cliProgress.Presets.shades_classic);

  const progressBar = multibar.create(itemsToGenerate, 0, { category: `${category.id} ${kind}` });
  
  let generatedCount = 0;
  while (generatedCount < itemsToGenerate) {
    const batchGenSize = Math.min(itemsToGenerate - generatedCount, BATCH_SIZE);
    if (batchGenSize <= 0) break;

    const bannedContent = isCuriosity 
      ? existingItems.map(i => i.title)
      : existingItems.map(i => i.question);
    
    const prompt = isCuriosity 
      ? buildCuriosityPrompt(category.name, batchGenSize, bannedContent)
      : buildQuizPrompt(category.name, batchGenSize, bannedContent);

    const raw = await generateWithRetry(prompt);
    if (!raw) continue;

    const cleanedText = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = await safeParseJsonText<any[]>(cleanedText);
    if (!parsed || !Array.isArray(parsed)) continue;

    const uniqueToAdd: any[] = [];

    for (const rawItem of parsed) {
      if (isCuriosity) {
        if (validateCuriosity(rawItem) && !isDuplicateCuriosity(rawItem.title, rawItem.content, bannedContent.concat(uniqueToAdd.map(i => i.title)))) {
          const newItem = normalizeCuriosityFields(rawItem as Curiosity);
          newItem.id = nextSequentialId(existingItems.concat(uniqueToAdd), category.id);
          newItem.categoryId = category.id;
          uniqueToAdd.push(newItem);
          globalTitleHashes.add(sha1(normalizeText(newItem.title)));
          globalContentHashes.add(sha1(normalizeText(newItem.content)));
        }
      } else { // Quizzes
        if (validateQuizStrict(rawItem) && !isDuplicateQuizQuestion(rawItem.question, bannedContent.concat(uniqueToAdd.map(i => i.question)))) {
          const newItem = rawItem as QuizQuestion;
          newItem.id = nextSequentialId(existingItems.concat(uniqueToAdd), `quiz-${category.id}`);
          newItem.categoryId = category.id;
          uniqueToAdd.push(newItem);
          globalQuizHashes.add(sha1(normalizeText(newItem.question)));
        }
      }
    }
    
    if (uniqueToAdd.length > 0) {
      existingItems.push(...uniqueToAdd);
      await writeCategoryJson(filePath, existingItems);
      generatedCount += uniqueToAdd.length;
      progressBar.increment(uniqueToAdd.length);
    }
    
    await sleep(API_CALL_DELAY_MS + Math.floor(Math.random() * 400));
  }

  multibar.stop();
  console.log(`  [${category.id}] ${kind} finalizado. Total: ${existingItems.length}`);
}

let EQUALIZER_RUN = false;

async function equalizeCounts(kind: GenerateKind) {
  EQUALIZER_RUN = true;
  const target = isCuriosity(kind) ? CURIOSITIES_TARGET_PER_CATEGORY : QUIZ_QUESTIONS_TARGET_PER_CATEGORY;
  
  console.log(`\n=== Balanceando contagem de ${kind} para o alvo de ${target} ===`);
  
  for (const category of categories) {
    if (ONLY_CATEGORY && category.id !== ONLY_CATEGORY) continue;

    const filePath = path.join(isCuriosity(kind) ? curiositiesDir : quizzesDir, `${isCuriosity(kind) ? '' : 'quiz-'}${category.id}.json`);
    const existingItems = await readCategoryJson<any[]>(filePath);
    const need = target - existingItems.length;

    if (need > 0) {
      await generateForCategory(category, kind, need);
    }
  }
}

function isCuriosity(kind: GenerateKind): kind is "curiosities" {
  return kind === "curiosities";
}

// ---------------- MAIN ----------------
async function main() {
  console.log("=== Iniciando geração de conteúdo (robusta) ===");
  if (DRY_RUN) console.log(">>> Rodando em modo DRY-RUN. Nenhuma alteração será salva. <<<");
  if (ONLY_CATEGORY) console.log(`>>> Focando apenas na categoria: ${ONLY_CATEGORY} <<<`);

  await ensureDirExists(dataDir);
  await ensureDirExists(curiositiesDir);
  await ensureDirExists(quizzesDir);

  // Semear hashes com todo o conteúdo existente
  console.log("\n--- Semeando hashes de conteúdo existente ---");
  for (const c of categories) {
    const curFile = path.join(curiositiesDir, `${c.id}.json`);
    const curItems: Curiosity[] = await readCategoryJson(curFile);
    curItems.forEach(it => {
      if (it.title) globalTitleHashes.add(sha1(normalizeText(it.title)));
      if (it.content) globalContentHashes.add(sha1(normalizeText(it.content)));
    });
    
    const quizFile = path.join(quizzesDir, `quiz-${c.id}.json`);
    const quizItems: QuizQuestion[] = await readCategoryJson(quizFile);
    quizItems.forEach(it => {
      if (it.question) globalQuizHashes.add(sha1(normalizeText(it.question)));
    });
  }
  console.log(`--- Hashes semeados: ${globalTitleHashes.size} títulos, ${globalContentHashes.size} conteúdos, ${globalQuizHashes.size} perguntas ---`);
  
  if (EQUALIZE_ONLY) {
    console.log("\n--- Rodando apenas a equalização ---");
    await equalizeCounts("curiosities");
    await equalizeCounts("quizzes");
    console.log("\n=== Equalização finalizada! ===");
    return;
  }

  const filteredCategories = ONLY_CATEGORY 
    ? categories.filter(c => c.id === ONLY_CATEGORY) 
    : categories;

  console.log("\n--- Iniciando geração por categoria ---");
  const limit = pLimit(CONCURRENCY);
  const tasks = filteredCategories.flatMap((category) => [
    limit(() => generateForCategory(category, "curiosities", 0)),
    limit(() => generateForCategory(category, "quizzes", 0))
  ]);
  await Promise.all(tasks);
  
  if (!ONLY_CATEGORY) {
    await equalizeCounts("curiosities");
    await equalizeCounts("quizzes");
  }

  console.log("\n=== Geração finalizada com sucesso! ===");
}

main().catch((err) => {
  console.error("\nErro fatal:", err);
  process.exit(1);
});
