// scripts/generateContent.ts
/**
 * Versão refatorada e robusta do gerador de conteúdo.
 * - Checkpoint por categoria (data/.checkpoints.json)
 * - Parser tolerante (JSON.parse -> JSON5 fallback)
 * - Validação estrita dos itens gerados
 * - Deduplicação semântica (string-similarity) e por hash
 * - Exponential backoff + jitter
 * - Escrita incremental segura (temp -> atomic rename)
 * - Progress bar por categoria
 *
 * Requer:
 *  - @google/generative-ai
 *  - json5
 *  - p-limit
 *  - cli-progress
 *  - string-similarity
 *  - uuid
 *  - fs-extra
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
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { fileURLToPath } from "url";

import categories from "../src/lib/data/categories.json" assert { type: "json" };
import type { Curiosity, QuizQuestion } from "../src/lib/types";

config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is not defined in your .env file");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ---------------- CONFIG ----------------
const CURIOSITIES_TARGET_PER_CATEGORY = 1000;
const QUIZ_QUESTIONS_TARGET_PER_CATEGORY = 500;
const BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000; // base for exponential backoff
const API_CALL_DELAY_MS = 1200; // polite pacing
const CONCURRENCY = 3;
const SIMILARITY_THRESHOLD = 0.82; // 0.0 - 1.0, higher = stricter (avoid near-duplicates)

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(__filename), "..");
const dataDir = path.join(ROOT, "data");
const curiositiesDir = path.join(dataDir, "curiosities");
const quizzesDir = path.join(dataDir, "quiz-questions");
const checkpointPath = path.join(dataDir, ".checkpoints.json");


// ---------------- DEDUPLICATION State ----------------
const globalTitleHashes = new Set<string>();
const globalContentHashes = new Set<string>();
const globalQuestionHashes = new Set<string>();


// ---------------- UTIL ----------------
async function ensureDirExists(dirPath: string) {
  await fsExtra.ensureDir(dirPath);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms + Math.floor(Math.random() * 400)));
}

async function atomicWriteJson(filePath: string, data: any) {
  const tmp = filePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, filePath);
}

async function safeReadJson<T = any>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const txt = await fs.readFile(filePath, "utf-8");
    return txt ? JSON.parse(txt) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

async function safeParseJsonText<T = any>(text: string): Promise<T | null> {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    try {
      return JSON5.parse(text) as T;
    } catch (e2) {
      const match = text.match(/(\[[\s\S]*?\]|\{[\s\S]*?\})/);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch {
          try {
            return JSON5.parse(match[0]) as T;
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

function isDuplicateCuriosity(title: string, content: string, existingTitles: string[]): boolean {
  const tNorm = normalizeText(title);
  const cNorm = normalizeText(content);
  if (!tNorm || !cNorm) return true;

  const tHash = sha1(tNorm);
  const cHash = sha1(cNorm);

  if (globalTitleHashes.has(tHash) || globalContentHashes.has(cHash)) return true;
  if (existingTitles.includes(title)) return true;

  const best = stringSimilarity.findBestMatch(title, existingTitles);
  return !!best?.bestMatch && best.bestMatch.rating >= SIMILARITY_THRESHOLD;
}

function isDuplicateQuiz(question: string, existingQuestions: string[]): boolean {
    const qNorm = normalizeText(question);
    if (!qNorm) return true;

    const qHash = sha1(qNorm);
    if(globalQuestionHashes.has(qHash)) return true;
    if(existingQuestions.includes(question)) return true;

    const best = stringSimilarity.findBestMatch(question, existingQuestions);
    return !!best?.bestMatch && best.bestMatch.rating >= SIMILARITY_THRESHOLD;
}

function nextSequentialId(existing: {id?: string}[], prefix: string) {
  let max = 0;
  for (const it of existing) {
    const suf = (it.id ?? "").split("-").pop() ?? "0";
    const n = Number.parseInt(suf, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${max + 1}`;
}


// ---------------- VALIDATION ----------------
function wordCount(s: string) {
  return s ? s.trim().split(/\s+/).length : 0;
}

function validateCuriosity(item: any): item is Curiosity {
  if (!item || typeof item !== "object") return false;
  if (!item.title || typeof item.title !== "string" || item.title.length < 6 || item.title.length > 120) return false;
  if (!item.content || typeof item.content !== "string") return false;
  const wc = wordCount(item.content);
  if (wc < 40 || wc > 80) return false;
  if (!item.funFact || typeof item.funFact !== "string" || item.funFact.length < 10) return false;
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

  const uniqueNorm = new Set(optsTrim.map(o => normalizeText(o)));
  if (uniqueNorm.size !== 4) return false;

  const ca = String(item.correctAnswer ?? "").trim();
  if (!ca) return false;
  if (!optsTrim.some(o => normalizeText(o) === normalizeText(ca))) return false;

  const exp = String(item.explanation ?? "").trim();
  if (exp.length < 12) return false;

  return true;
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
    const retriable = [429, 503, 504].includes(err?.status) || (!err?.status && attempt <= 2);
    if (attempt <= MAX_RETRIES && retriable) {
      const delay = Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1) + (Math.random() * 1000));
      console.warn(`  [WARN] API error (status=${err?.status}). Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
      await sleep(delay);
      return generateWithRetry(prompt, attempt + 1);
    }
    console.error("  [ERROR] Non-retriable or max retries reached:", err?.message ?? err);
    return null;
  }
}

// ---------------- PROMPTS ----------------
function buildCuriosityPrompt(categoryName: string, count: number, bannedTitles: string[]) {
  const banned = bannedTitles.slice(-200);
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
    const aId = typeof a.id === "string" ? parseInt(a.id.split("-").pop() || "0") : 0;
    const bId = typeof b.id === "string" ? parseInt(b.id.split("-").pop() || "0") : 0;
    return aId - bId;
  });
  await atomicWriteJson(filePath, sorted);
}

// ---------------- MAIN PROCESS ----------------
async function processCategory(category: typeof categories[0]) {
  console.log(`\n=== [${category.id}] ${category.name} ===`);
  const curiosityFilePath = path.join(curiositiesDir, `${category.id}.json`);
  const quizFilePath = path.join(quizzesDir, `${category.id}.json`);

  const existingCuriosities: Curiosity[] = await readCategoryJson(curiosityFilePath);
  const existingCuriosityTitles = existingCuriosities.map((c) => c.title || "");
  
  const existingQuizzes: QuizQuestion[] = await readCategoryJson(quizFilePath);
  const existingQuizQuestions = existingQuizzes.map((q) => q.question || "");

  const checkpoints = await readCheckpoints();
  const cp = checkpoints[category.id] ?? { curiositiesBatchesProcessed: 0, quizzesBatchesProcessed: 0 };

  // CURIOSITIES
  const needCur = Math.max(0, CURIOSITIES_TARGET_PER_CATEGORY - existingCuriosities.length);
  console.log(`Curiosidades existentes: ${existingCuriosities.length}. Necessário: ${needCur}`);

  if (needCur > 0) {
    const totalBatches = Math.ceil(needCur / BATCH_SIZE);
    const multibar = new cliProgress.MultiBar({
        clearOnComplete: false,
        hideCursor: true,
        format: '{bar} | {category} | {value}/{total} Lotes'
    }, cliProgress.Presets.shades_classic);

    const curiositiesBar = multibar.create(totalBatches, cp.curiositiesBatchesProcessed || 0, { category: `${category.id} Curiosidades` });

    for (let batchIndex = cp.curiositiesBatchesProcessed || 0; batchIndex < totalBatches; batchIndex++) {
      const toGen = Math.min(BATCH_SIZE, CURIOSITIES_TARGET_PER_CATEGORY - existingCuriosities.length);
      if (toGen <= 0) break;
      
      const prompt = buildCuriosityPrompt(category.name, toGen, existingCuriosityTitles);
      const raw = await generateWithRetry(prompt);
      if (!raw) continue;

      const cleanedText = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = await safeParseJsonText<any[]>(cleanedText);
      if (!parsed || !Array.isArray(parsed)) continue;

      const uniqueToAdd: Curiosity[] = [];
      for (const rawItem of parsed) {
        if (validateCuriosity(rawItem) && !isDuplicateCuriosity(rawItem.title, content, existingCuriosityTitles.concat(uniqueToAdd.map(i => i.title)))) {
          const id = nextSequentialId(existingCuriosities.concat(uniqueToAdd), category.id);
          const newItem = { id, categoryId: category.id, ...rawItem };
          uniqueToAdd.push(newItem);
          globalTitleHashes.add(sha1(normalizeText(newItem.title)));
          globalContentHashes.add(sha1(normalizeText(newItem.content)));
        }
      }
      
      if (uniqueToAdd.length > 0) {
        existingCuriosities.push(...uniqueToAdd);
        existingCuriosityTitles.push(...uniqueToAdd.map(c => c.title));
        await writeCategoryJson(curiosityFilePath, existingCuriosities);
      }

      cp.curiositiesBatchesProcessed = batchIndex + 1;
      checkpoints[category.id] = cp;
      await writeCheckpoints(checkpoints);
      curiositiesBar.increment();
      await sleep(API_CALL_DELAY_MS);
    }
    multibar.stop();
  }

  // QUIZZES
  const needQuiz = Math.max(0, QUIZ_QUESTIONS_TARGET_PER_CATEGORY - existingQuizzes.length);
  console.log(`Quizzes existentes: ${existingQuizzes.length}. Necessário: ${needQuiz}`);

  if (needQuiz > 0) {
    const totalBatches = Math.ceil(needQuiz / BATCH_SIZE);
     const multibar = new cliProgress.MultiBar({
        clearOnComplete: false,
        hideCursor: true,
        format: '{bar} | {category} | {value}/{total} Lotes'
    }, cliProgress.Presets.shades_classic);
    const quizzesBar = multibar.create(totalBatches, cp.quizzesBatchesProcessed || 0, { category: `${category.id} Quizzes` });

    for (let batchIndex = cp.quizzesBatchesProcessed || 0; batchIndex < totalBatches; batchIndex++) {
      const toGen = Math.min(BATCH_SIZE, QUIZ_QUESTIONS_TARGET_PER_CATEGORY - existingQuizzes.length);
      if (toGen <= 0) break;

      const prompt = buildQuizPrompt(category.name, toGen, existingQuizQuestions);
      const raw = await generateWithRetry(prompt);
      if (!raw) continue;

      const cleanedText = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = await safeParseJsonText<any[]>(cleanedText);
      if (!parsed || !Array.isArray(parsed)) continue;

      const uniqueToAdd: QuizQuestion[] = [];
      for (const rawItem of parsed) {
        if (validateQuizStrict(rawItem) && !isDuplicateQuiz(rawItem.question, existingQuizQuestions.concat(uniqueToAdd.map(q => q.question)))) {
          const id = nextSequentialId(existingQuizzes.concat(uniqueToAdd), `quiz-${category.id}`);
          const newItem = { id, categoryId: category.id, ...rawItem };
          uniqueToAdd.push(newItem);
          globalQuestionHashes.add(sha1(normalizeText(newItem.question)));
        }
      }

      if (uniqueToAdd.length > 0) {
        existingQuizzes.push(...uniqueToAdd);
        existingQuizQuestions.push(...uniqueToAdd.map(q => q.question));
        await writeCategoryJson(quizFilePath, existingQuizzes);
      }

      cp.quizzesBatchesProcessed = batchIndex + 1;
      checkpoints[category.id] = cp;
      await writeCheckpoints(checkpoints);
      quizzesBar.increment();
      await sleep(API_CALL_DELAY_MS);
    }
    multibar.stop();
  }

  const finalCuriosities = (await readCategoryJson<Curiosity[]>(curiosityFilePath)).length;
  const finalQuizzes = (await readCategoryJson<QuizQuestion[]>(quizFilePath)).length;
  console.log(`\n[${category.id}] Final: Curiosidades=${finalCuriosities}, Quizzes=${finalQuizzes}`);
}


// ---------------- CLEANUP ORPHANS ----------------
async function cleanupOrphanFiles() {
  console.log("\n--- Limpando arquivos órfãos ---");
  const categoryIds = new Set(categories.map(c => c.id));
  const curiosityFiles = await fs.readdir(curiositiesDir);
  for (const file of curiosityFiles) {
    const categoryId = path.basename(file, ".json");
    if (!categoryIds.has(categoryId)) {
      console.log(`  Removendo curiosidade órfã: ${file}`);
      await fs.unlink(path.join(curiositiesDir, file));
    }
  }
  const quizFiles = await fs.readdir(quizzesDir);
  for (const file of quizFiles) {
    // Correctly parse quiz category ID from filename like `quiz-historia.json`
    const quizCategoryId = path.basename(file, ".json").replace('quiz-', '');
    if (!categoryIds.has(quizCategoryId)) {
      console.log(`  Removendo quiz órfão: ${file}`);
      await fs.unlink(path.join(quizzesDir, file));
    }
  }
  console.log("--- Concluído ---\n");
}

// ---------------- SEED HASHES ----------------
async function seedGlobalHashes() {
    console.log("\n--- Semeando hashes de conteúdo existente ---");
    for (const c of categories) {
        // Curiosities
        const curFile = path.join(curiositiesDir, `${c.id}.json`);
        const curItems: Curiosity[] = await readCategoryJson(curFile);
        for (const it of curItems) {
            if (it.title) globalTitleHashes.add(sha1(normalizeText(it.title)));
            if (it.content) globalContentHashes.add(sha1(normalizeText(it.content)));
        }
        // Quizzes
        const quizFile = path.join(quizzesDir, `${c.id}.json`);
        const quizItems: QuizQuestion[] = await readCategoryJson(quizFile);
        for (const it of quizItems) {
            if (it.question) globalQuestionHashes.add(sha1(normalizeText(it.question)));
        }
    }
    console.log(`--- Hashes semeados: ${globalTitleHashes.size} títulos, ${globalContentHashes.size} conteúdos, ${globalQuestionHashes.size} perguntas ---`);
}

// ---------------- BALANCE COUNTS ----------------
async function equalizeCounts(kind: "curiosities" | "quizzes") {
  const dir = kind === "curiosities" ? curiositiesDir : quizzesDir;
  const target = kind === "curiosities" ? CURIOSITIES_TARGET_PER_CATEGORY : QUIZ_QUESTIONS_TARGET_PER_CATEGORY;
  const filePrefix = kind === 'quizzes' ? 'quiz-' : '';

  console.log(`\n=== Balanceando contagem de ${kind} para o alvo de ${target} ===`);
  
  for (const category of categories) {
    const filePath = path.join(dir, `${filePrefix}${category.id}.json`);
    const existingItems = await readCategoryJson<any[]>(filePath);
    let itemsToAdd = target - existingItems.length;

    if (itemsToAdd <= 0) {
      console.log(`  [${category.id}] ${kind}: ${existingItems.length}/${target}. Nenhuma ação necessária.`);
      continue;
    }

    console.log(`  [${category.id}] ${kind}: ${existingItems.length}/${target}. Gerando ${itemsToAdd} novos itens...`);

    const multibar = new cliProgress.MultiBar({
        clearOnComplete: false,
        hideCursor: true,
        format: '{bar} | {category} | {value}/{total} Itens'
    }, cliProgress.Presets.shades_classic);

    const progressBar = multibar.create(itemsToAdd, 0, { category: `${category.id} ${kind}` });

    while(itemsToAdd > 0) {
        const batchGenSize = Math.min(itemsToAdd, BATCH_SIZE);
        let prompt, existingContent, validator, isDup, idPrefix, hashSet;

        if (kind === 'curiosities') {
            existingContent = existingItems.map(i => i.title);
            prompt = buildCuriosityPrompt(category.name, batchGenSize, existingContent);
            validator = validateCuriosity;
            isDup = (item: any) => isDuplicateCuriosity(item.title, item.content, existingContent.concat(uniqueToAdd.map(i => i.title)));
            idPrefix = category.id;
            hashSet = { titles: globalTitleHashes, contents: globalContentHashes };
        } else { // quizzes
            existingContent = existingItems.map(i => i.question);
            prompt = buildQuizPrompt(category.name, batchGenSize, existingContent);
            validator = validateQuizStrict;
            isDup = (item: any) => isDuplicateQuiz(item.question, existingContent.concat(uniqueToAdd.map(i => i.question)));
            idPrefix = `quiz-${category.id}`;
            hashSet = { questions: globalQuestionHashes };
        }

        const raw = await generateWithRetry(prompt);
        if (!raw) continue;

        const cleanedText = raw.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = await safeParseJsonText<any[]>(cleanedText);
        if (!parsed || !Array.isArray(parsed)) continue;

        const uniqueToAdd: any[] = [];
        for (const rawItem of parsed) {
            if (validator(rawItem) && !isDup(rawItem)) {
              const id = nextSequentialId(existingItems.concat(uniqueToAdd), idPrefix);
              const newItem = { id, categoryId: category.id, ...rawItem };
              uniqueToAdd.push(newItem);

              if (kind === 'curiosities') {
                hashSet.titles.add(sha1(normalizeText(newItem.title)));
                hashSet.contents.add(sha1(normalizeText(newItem.content)));
              } else {
                hashSet.questions.add(sha1(normalizeText(newItem.question)));
              }
            }
        }

        if (uniqueToAdd.length > 0) {
            existingItems.push(...uniqueToAdd);
            await writeCategoryJson(filePath, existingItems);
            itemsToAdd -= uniqueToAdd.length;
            progressBar.increment(uniqueToAdd.length);
        }
        
        await sleep(API_CALL_DELAY_MS);
    }
    multibar.stop();
  }
}


// ---------------- MAIN ----------------
async function main() {
  console.log("=== Iniciando geração de conteúdo (robusta) ===");
  await ensureDirExists(dataDir);
  await ensureDirExists(curiositiesDir);
  await ensureDirExists(quizzesDir);

  const existingCheckpoints = await readCheckpoints();
  await writeCheckpoints(existingCheckpoints);

  await cleanupOrphanFiles();
  await seedGlobalHashes();

  const limit = pLimit(CONCURRENCY);
  const tasks = categories.map((category) => limit(() => processCategory(category)));
  await Promise.all(tasks);
  
  await equalizeCounts("curiosities");
  await equalizeCounts("quizzes");

  console.log("\n=== Geração finalizada com sucesso! ===");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
