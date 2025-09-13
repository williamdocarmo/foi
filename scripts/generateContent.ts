// scripts/generateContent-refactor.ts
/**
 * Versão refatorada e robusta do gerador de conteúdo.
 * - Checkpoint por categoria (data/.checkpoints.json)
 * - Parser tolerante (JSON.parse -> JSON5 fallback)
 * - Validação estrita dos itens gerados
 * - Deduplicação semântica (string-similarity)
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
const CURIOSITIES_TARGET_PER_CATEGORY = 500;
const QUIZ_QUESTIONS_TARGET_PER_CATEGORY = 250;
const BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000; // base for exponential backoff
const API_CALL_DELAY_MS = 1200; // polite pacing
const CONCURRENCY = 3;
const SIMILARITY_THRESHOLD = 0.82; // 0.0 - 1.0, higher = stricter (avoid near-duplicates)

const ROOT = path.join(path.dirname(import.meta.url.replace('file://', '')), "..");
const dataDir = path.join(ROOT, "data");
const curiositiesDir = path.join(dataDir, "curiosities");
const quizzesDir = path.join(dataDir, "quiz-questions");
const checkpointPath = path.join(dataDir, ".checkpoints.json");

// ---------------- UTIL ----------------
async function ensureDirExists(dirPath: string) {
  await fsExtra.ensureDir(dirPath);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    // fallback to JSON5 tolerant parser
    try {
      return JSON5.parse(text) as T;
    } catch (e2) {
      // try to extract JSON block with regex { ... } or [ ... ]
      const match = text.match(/(\[.*\]|\{.*\})/s);
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

function isLikelyDuplicate(title: string, existingTitles: string[]): boolean {
  // Ensure title is a non-empty string
  if (typeof title !== 'string' || !title.trim()) {
    return true; // Treat invalid titles as duplicates to be safe
  }
  
  // Ensure existingTitles is a valid array of strings
  const validExistingTitles = Array.isArray(existingTitles) 
    ? existingTitles.filter(t => typeof t === 'string' && t.length > 0)
    : [];

  if (validExistingTitles.length === 0) {
    return false;
  }

  // Quick exact check first
  if (validExistingTitles.includes(title)) {
    return true;
  }

  // Semantic similarity check
  const best = stringSimilarity.findBestMatch(title, validExistingTitles);
  
  // Protect against null bestMatch if validExistingTitles is empty after filter
  if (best && best.bestMatch && best.bestMatch.rating >= SIMILARITY_THRESHOLD) {
    return true;
  }
  
  return false;
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
  if (wc < 40 || wc > 80) return false; // slightly relaxed upper bound
  if (!item.funFact || typeof item.funFact !== "string" || item.funFact.length < 10) return false;
  return true;
}

function validateQuiz(item: any): item is QuizQuestion {
  if (!item || typeof item !== "object") return false;
  if (!["easy", "medium", "hard"].includes(item.difficulty)) return false;
  if (!item.question || typeof item.question !== "string" || item.question.length < 10) return false;
  if (!Array.isArray(item.options) || item.options.length !== 4) return false;
  if (!item.correctAnswer || typeof item.correctAnswer !== "string") return false;
  if (!item.options.includes(item.correctAnswer)) return false;
  if (!item.explanation || typeof item.explanation !== "string") return false;
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
  // exponential backoff with jitter
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
    const retriable = [
      429, 503, 504
    ].includes(err?.status);
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
  const banned = bannedTitles.slice(0, 200); // don't explode prompt size
  return `
Gere ${count} curiosidades INÉDITAS e atraentes sobre o tema "${categoryName}".
Saída: um ARRAY JSON de objetos.
Cada objeto deve ter:
- "title": título curto e intrigante (6-80 chars).
- "hook": frase curta (6-30 chars) que prenda a atenção, estilo \"Você sabia que ...\" ou \"Incrível:\".
- "content": parágrafo entre 40 e 80 palavras, linguagem simples e cativante.
- "funFact": uma frase extra surpreendente (OBRIGATÓRIO).
- "curiosityLevel": número de 1 a 5 (1 = comum, 5 = ultra-raro).
Regras:
- NÃO repita, reescreva ou reordene títulos já existentes: ${banned.join(" ; ")}
- Priorize variações, fatos pouco óbvios, histórias curtas e sensação de surpresa.
Retorne APENAS o array JSON, sem comentários extras.
`;
}

function buildQuizPrompt(categoryName: string, count: number, bannedQuestions: string[]) {
  const banned = bannedQuestions.slice(0, 200);
  return `
Gere ${count} perguntas de quiz originais sobre "${categoryName}".
Saída: um ARRAY JSON de objetos.
Cada objeto deve ter:
- "difficulty": 'easy' | 'medium' | 'hard'
- "question": string (curta e clara)
- "options": array de 4 strings
- "correctAnswer": uma das strings em "options"
- "explanation": texto curto explicando a resposta e adicionando uma curiosidade extra
Regras:
- NÃO repita perguntas já existentes: ${banned.join(" ; ")}
- Varie dificuldade e estilo (múltipla escolha, perguntas surpreendentes).
Retorne APENAS o array JSON.
`;
}

// ---------------- I/O helpers ----------------
async function readCategoryJson<T = any[]>(filePath: string): Promise<T> {
  try {
    await fs.access(filePath);
    const txt = await fs.readFile(filePath, "utf-8");
    if (!txt || !txt.trim()) return [] as unknown as T;
    // Parse tolerant
    const parsed = await safeParseJsonText<T>(txt);
    return (parsed ?? []) as T;
  } catch (e) {
    return [] as unknown as T;
  }
}

async function writeCategoryJson(filePath: string, arr: any[]) {
  // ensure deterministic ordering by id numeric suffix when possible
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

  // read existing
  const existingCuriosities: Curiosity[] = await readCategoryJson(curiosityFilePath);
  const existingCuriosityTitles = existingCuriosities.map((c) => c.title || "");
  const existingQuizzes: QuizQuestion[] = await readCategoryJson(quizFilePath);
  const existingQuizQuestions = existingQuizzes.map((q) => q.question || "");

  // checkpoint read
  const checkpoints = await readCheckpoints();
  const cp = checkpoints[category.id] ?? { curiositiesBatchesProcessed: 0, quizzesBatchesProcessed: 0 };

  // CURIOUSITIES
  const needCur = Math.max(0, CURIOSITIES_TARGET_PER_CATEGORY - existingCuriosities.length);
  console.log(`Curiosidades existentes: ${existingCuriosities.length}. Necessário: ${needCur}`);

  if (needCur > 0) {
    const totalBatches = Math.ceil(needCur / BATCH_SIZE);
    const progressBar = new cliProgress.SingleBar({
      format: `${category.id} Curiosidades |{bar}| {value}/{total} batches`
    }, cliProgress.Presets.shades_classic);
    progressBar.start(totalBatches, cp.curiositiesBatchesProcessed || 0);

    for (let batchIndex = cp.curiositiesBatchesProcessed || 0; batchIndex < totalBatches; batchIndex++) {
      const toGen = Math.min(BATCH_SIZE, needCur - batchIndex * BATCH_SIZE);
      console.log(`  [${category.id}] Gerando lote ${batchIndex + 1}/${totalBatches} (${toGen}) curiosidades...`);

      const prompt = buildCuriosityPrompt(category.name, toGen, existingCuriosityTitles);
      const raw = await generateWithRetry(prompt);
      if (!raw) {
        console.warn(`  [${category.id}] Resposta nula do gerador. Pulando lote.`);
        // Save checkpoint to avoid infinite loop; we can try later rerun
        cp.curiositiesBatchesProcessed = batchIndex + 1;
        cp.lastRunAt = new Date().toISOString();
        checkpoints[category.id] = cp;
        await writeCheckpoints(checkpoints);
        continue;
      }

      const cleanedText = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = await safeParseJsonText<any[]>(cleanedText);
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        console.warn(`  [${category.id}] Não foi possível parsear JSON do lote. Conteúdo recebido será ignorado.`);
        cp.curiositiesBatchesProcessed = batchIndex + 1;
        checkpoints[category.id] = cp;
        await writeCheckpoints(checkpoints);
        continue;
      }

      // validate + dedupe semântico
      const uniqueToAdd: Curiosity[] = [];
      let maxIdNum = existingCuriosities.length > 0 ? Math.max(...existingCuriosities.map(c => parseInt((c.id || "0").split("-").pop() || "0")).filter(Number.isFinite)) : 0;

      for (const rawItem of parsed) {
        if (!validateCuriosity(rawItem)) {
          // try to salvage: trim fields
          rawItem.title = typeof rawItem.title === "string" ? rawItem.title.trim() : rawItem.title;
          rawItem.content = typeof rawItem.content === "string" ? rawItem.content.trim() : rawItem.content;
          rawItem.funFact = typeof rawItem.funFact === "string" ? rawItem.funFact.trim() : rawItem.funFact;
        }
        if (!validateCuriosity(rawItem)) {
          // discard
          continue;
        }
        if (isLikelyDuplicate(rawItem.title, existingCuriosityTitles.concat(uniqueToAdd.map(i => i.title)))) {
          continue;
        }
        maxIdNum++;
        const id = `${category.id}-${maxIdNum}`;
        uniqueToAdd.push({ id, categoryId: category.id, ...rawItem });
      }

      if (uniqueToAdd.length > 0) {
        // append and save
        existingCuriosities.push(...uniqueToAdd);
        uniqueToAdd.forEach(u => existingCuriosityTitles.push(u.title));
        await writeCategoryJson(curiosityFilePath, existingCuriosities);
        console.log(`  [${category.id}] ✅ ${uniqueToAdd.length} curiosidades válidas adicionadas.`);
      } else {
        console.log(`  [${category.id}] - Nenhuma curiosidade válida/única neste lote.`);
      }

      // checkpoint update
      cp.curiositiesBatchesProcessed = batchIndex + 1;
      cp.lastRunAt = new Date().toISOString();
      checkpoints[category.id] = cp;
      await writeCheckpoints(checkpoints);

      progressBar.increment();
      await sleep(API_CALL_DELAY_MS);
    }

    progressBar.stop();
  }

  // QUIZ
  const needQuiz = Math.max(0, QUIZ_QUESTIONS_TARGET_PER_CATEGORY - existingQuizzes.length);
  console.log(`Quizzes existentes: ${existingQuizzes.length}. Necessário: ${needQuiz}`);

  if (needQuiz > 0) {
    const totalBatches = Math.ceil(needQuiz / BATCH_SIZE);
    const progressBar = new cliProgress.SingleBar({
      format: `${category.id} Quizzes    |{bar}| {value}/{total} batches`
    }, cliProgress.Presets.shades_classic);
    progressBar.start(totalBatches, cp.quizzesBatchesProcessed || 0);

    for (let batchIndex = cp.quizzesBatchesProcessed || 0; batchIndex < totalBatches; batchIndex++) {
      const toGen = Math.min(BATCH_SIZE, needQuiz - batchIndex * BATCH_SIZE);
      console.log(`  [${category.id}] Gerando lote ${batchIndex + 1}/${totalBatches} (${toGen}) quizzes...`);

      const prompt = buildQuizPrompt(category.name, toGen, existingQuizQuestions);
      const raw = await generateWithRetry(prompt);
      if (!raw) {
        console.warn(`  [${category.id}] Resposta nula do gerador (quiz). Pulando lote.`);
        cp.quizzesBatchesProcessed = batchIndex + 1;
        cp.lastRunAt = new Date().toISOString();
        checkpoints[category.id] = cp;
        await writeCheckpoints(checkpoints);
        continue;
      }

      const cleanedText = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = await safeParseJsonText<any[]>(cleanedText);
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        console.warn(`  [${category.id}] Não foi possível parsear JSON do lote de quizzes. Ignorando.`);
        cp.quizzesBatchesProcessed = batchIndex + 1;
        checkpoints[category.id] = cp;
        await writeCheckpoints(checkpoints);
        continue;
      }

      // validate + dedupe
      const uniqueToAdd: QuizQuestion[] = [];
      let maxIdNum = existingQuizzes.length > 0 ? Math.max(...existingQuizzes.map(q => {
        const parts = String(q.id || "").split("-");
        return parseInt(parts[parts.length - 1] || "0");
      }).filter(Number.isFinite)) : 0;

      for (const rawItem of parsed) {
        if (!validateQuiz(rawItem)) {
          // attempt to normalize: ensure options array, correctAnswer inclusion etc.
          if (Array.isArray(rawItem.options) && rawItem.options.length === 4 && typeof rawItem.correctAnswer === "string") {
            // proceed to further checks
          } else {
            continue; // discard irreparable
          }
        }
        // dedupe by exact + semantic on question string
        if (isLikelyDuplicate(rawItem.question, existingQuizQuestions.concat(uniqueToAdd.map(i => i.question)))) {
          continue;
        }
        maxIdNum++;
        const id = `quiz-${category.id}-${maxIdNum}`;
        uniqueToAdd.push({ id, categoryId: category.id, ...rawItem });
      }

      if (uniqueToAdd.length > 0) {
        existingQuizzes.push(...uniqueToAdd);
        uniqueToAdd.forEach(q => existingQuizQuestions.push(q.question));
        await writeCategoryJson(quizFilePath, existingQuizzes);
        console.log(`  [${category.id}] ✅ ${uniqueToAdd.length} quizzes válidos adicionados.`);
      } else {
        console.log(`  [${category.id}] - Nenhum quiz válido/único neste lote.`);
      }

      // checkpoint update
      cp.quizzesBatchesProcessed = batchIndex + 1;
      cp.lastRunAt = new Date().toISOString();
      checkpoints[category.id] = cp;
      await writeCheckpoints(checkpoints);

      progressBar.increment();
      await sleep(API_CALL_DELAY_MS);
    }

    progressBar.stop();
  }

  // final summary per category
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
    const categoryId = path.basename(file, ".json");
    if (!categoryIds.has(categoryId)) {
      console.log(`  Removendo quiz órfão: ${file}`);
      await fs.unlink(path.join(quizzesDir, file));
    }
  }
  console.log("--- Concluído ---\n");
}

// ---------------- MAIN ----------------
async function main() {
  console.log("=== Iniciando geração de conteúdo (refactor) ===");
  await ensureDirExists(dataDir);
  await ensureDirExists(curiositiesDir);
  await ensureDirExists(quizzesDir);

  // Initial checkpoint file ensure
  const existingCheckpoints = await readCheckpoints();
  await writeCheckpoints(existingCheckpoints);

  // remove orphan files if any
  await cleanupOrphanFiles();

  const limit = pLimit(CONCURRENCY);

  const tasks = categories.map((category) => limit(() => processCategory(category)));

  await Promise.all(tasks);

  console.log("\n=== Geração finalizada ===");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
