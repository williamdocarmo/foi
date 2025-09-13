
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import fs from "fs/promises";
import path from "path";
import categories from "../src/lib/data/categories.json";
import type { Curiosity, QuizQuestion } from "@/lib/types";

// One-time migration script.
// This script is designed to be run once to migrate data from the old monolithic
// JSON files to the new per-category file structure. It also cleans up old files afterwards.

config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is not defined in your .env file");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- CONFIGURAÇÕES ---
const CURIOSITIES_TARGET_PER_CATEGORY = 2000;
const QUIZ_QUESTIONS_TARGET_PER_CATEGORY = 1000;
const BATCH_SIZE = 50; 
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 3;
const API_CALL_DELAY_MS = 2000; 

const curiositiesDir = path.join(__dirname, "../data/curiosities");
const quizzesDir = path.join(__dirname, "../data/quiz-questions");

// --- Old File Paths for Migration ---
const oldCuriositiesPath = path.join(__dirname, "../src/lib/data/curiosities.json");
const oldQuizzesPath = path.join(__dirname, "../src/lib/data/quiz-questions.json");
const otherOldFiles = [
    path.join(__dirname, "../data/curiosities-autoajuda.json"),
    path.join(__dirname, "../data/curiosities-bem-estar.json"),
    path.join(__dirname, "../data/curiosities-ciencia.json"),
    path.join(__dirname, "../data/curiosities-cultura.json"),
    path.join(__dirname, "../data/curiosities-dinheiro.json"),
    path.join(__dirname, "../data/curiosities-entretenimento.json"),
    path.join(__dirname, "../data/curiosities-futuro.json"),
    path.join(__dirname, "../data/curiosities-habilidades.json"),
    path.join(__dirname, "../data/curiosities-hacks.json"),
    path.join(__dirname, "../data/curiosities-historia.json"),
    path.join(__dirname, "../data/curiosities-lugares.json"),
    path.join(__dirname, "../data/curiosities-misterios.json"),
    path.join(__dirname, "../data/curiosities-musica.json"),
    path.join(__dirname, "../data/curiosities-natureza-e-animais.json"),
    path.join(__dirname, "../data/curiosities-psicologia.json"),
    path.join(__dirname, "../data/curiosities-relacionamentos.json"),
    path.join(__dirname, "../data/curiosities-religiao.json"),
    path.join(__dirname, "../data/curiosities-saude.json"),
    path.join(__dirname, "../data/curiosities-universo-e-astronomia.json"),
    path.join(__dirname, "../data/curiosities-viagens.json"),
    path.join(__dirname, "../data/quiz-questions-autoajuda.json"),
    path.join(__dirname, "../data/quiz-questions-bem-estar.json"),
    path.join(__dirname, "../data/quiz-questions-ciencia.json"),
    path.join(__dirname, "../data/quiz-questions-cultura.json"),
    path.join(__dirname, "../data/quiz-questions-dinheiro.json"),
    path.join(__dirname, "../data/quiz-questions-entretenimento.json"),
    path.join(__dirname, "../data/quiz-questions-futuro.json"),
    path.join(__dirname, "../data/quiz-questions-habilidades.json"),
    path.join(__dirname, "../data/quiz-questions-historia.json"),
    path.join(__dirname, "../data/quiz-questions-misterios.json"),
    path.join(__dirname, "../data/quiz-questions-psicologia.json"),
    path.join(__dirname, "../data/quiz-questions-relacionamentos.json"),
    path.join(__dirname, "../data/quiz-questions-religiao.json"),
    path.join(__dirname, "../data/quiz-questions-saude.json"),
    path.join(__dirname, "../data/quiz-questions-tecnologia.json"),
];

// --- FUNÇÕES AUXILIARES ---

async function ensureDirExists(dirPath: string) {
  try {
    await fs.access(dirPath);
  } catch (e) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJsonFile<T>(filePath: string): Promise<T[]> {
  try {
    await fs.access(filePath);
    const fileContent = await fs.readFile(filePath, "utf-8");
    return fileContent ? JSON.parse(fileContent) : [];
  } catch (e) {
    return [];
  }
}

async function writeJsonFile(filePath: string, data: any[]): Promise<void> {
    const sortedData = data.sort((a, b) => {
        const idA = parseInt(a.id.split('-').pop() || '0');
        const idB = parseInt(b.id.split('-').pop() || '0');
        return idA - idB;
    });
    await fs.writeFile(filePath, JSON.stringify(sortedData, null, 2));
}

async function deleteFileIfExists(filePath: string) {
    try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        console.log(`  [MIGRAÇÃO] Arquivo antigo deletado: ${path.basename(filePath)}`);
    } catch (error) {
        // File doesn't exist, which is fine
    }
}


async function migrateAndCleanOldFiles() {
    console.log('\n--- Iniciando Migração de Dados Antigos ---');
    
    const allOldCuriosities: Curiosity[] = await readJsonFile(oldCuriositiesPath);
    const allOldQuizzes: QuizQuestion[] = await readJsonFile(oldQuizzesPath);

    if (allOldCuriosities.length === 0 && allOldQuizzes.length === 0) {
        console.log('Nenhum dado antigo encontrado para migrar.');
    } else {
        const curiositiesByCategory = allOldCuriosities.reduce((acc, cur) => {
            (acc[cur.categoryId] = acc[cur.categoryId] || []).push(cur);
            return acc;
        }, {} as Record<string, Curiosity[]>);

        const quizzesByCategory = allOldQuizzes.reduce((acc, quiz) => {
            (acc[quiz.categoryId] = acc[quiz.categoryId] || []).push(quiz);
            return acc;
        }, {} as Record<string, QuizQuestion[]>);

        for (const categoryId in curiositiesByCategory) {
            const filePath = path.join(curiositiesDir, `${categoryId}.json`);
            await writeJsonFile(filePath, curiositiesByCategory[categoryId]);
            console.log(`  - Migradas ${curiositiesByCategory[categoryId].length} curiosidades para ${categoryId}.json`);
        }

        for (const categoryId in quizzesByCategory) {
            const filePath = path.join(quizzesDir, `${categoryId}.json`);
            await writeJsonFile(filePath, quizzesByCategory[categoryId]);
            console.log(`  - Migrados ${quizzesByCategory[categoryId].length} quizzes para ${categoryId}.json`);
        }

        console.log('--- Migração Concluída ---');
    }

    console.log('\n--- Limpando Arquivos Antigos ---');
    await deleteFileIfExists(oldCuriositiesPath);
    await deleteFileIfExists(oldQuizzesPath);
    for (const oldFile of otherOldFiles) {
        await deleteFileIfExists(oldFile);
    }
    console.log('--- Limpeza Concluída ---');
}


async function generateWithRetry(prompt: string, attempt = 1): Promise<any[]> {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    if (!cleanedText) {
      console.warn("  [AVISO] Resposta vazia da API. Tentando novamente...");
      return [];
    }
    return JSON.parse(cleanedText);
  } catch (error: any) {
    if (attempt <= MAX_RETRIES && (error?.status === 503 || error?.status === 429 || error.message.includes('503') || error.message.includes('429'))) {
      console.warn(`  [AVISO] API sobrecarregada. Tentando novamente em ${RETRY_DELAY_MS / 1000}s... (Tentativa ${attempt}/${MAX_RETRIES})`);
      await sleep(RETRY_DELAY_MS);
      return generateWithRetry(prompt, attempt + 1);
    }
    if (error instanceof SyntaxError) {
      console.error("  [ERRO] Falha ao analisar JSON da resposta da API. A resposta pode estar malformada ou vazia.");
      console.error("Resposta recebida:", error);
      return [];
    }
    console.error("  [ERRO] Erro inesperado da API:", error);
    return [];
  }
}

async function generateCuriosities(categoryName: string, count: number, existingTitles: Set<string>) {
  const prompt = `Gere ${count} curiosidades sobre o tema "${categoryName}".
  O formato de saída deve ser um array de objetos JSON.
  Cada objeto deve ter os campos: "title" (string), "content" (string, com 40 a 60 palavras), e "funFact" (string).
  O conteúdo deve ser interessante, direto e de fácil leitura. O "funFact" é OBRIGATÓRIO.
  IMPORTANTE: NÃO REPITA os seguintes títulos de curiosidades já existentes: ${Array.from(existingTitles).join(', ')}. Gere tópicos novos e variados.
  Exemplo: [{ "title": "O Coração Humano", "content": "O coração humano é uma bomba muscular incrível que bate cerca de 100.000 vezes por dia, impulsionando sangue rico em oxigênio para todo o corpo. Este órgão vital trabalha incansavelmente desde antes do nascimento até o último momento da vida, garantindo que cada célula receba o que precisa para funcionar adequadamente.", "funFact": "O coração de uma baleia azul é tão grande que um ser humano poderia nadar através de suas artérias." }]
  Retorne APENAS o array JSON, sem nenhum texto ou formatação adicional.`;

  return generateWithRetry(prompt);
}

async function generateQuizQuestions(categoryName: string, count: number, existingQuestions: Set<string>) {
  const prompt = `Gere ${count} perguntas de quiz sobre o tema "${categoryName}".
  O formato de saída deve ser um array de objetos JSON.
  Cada objeto deve ter os campos: "difficulty" ('easy', 'medium', ou 'hard'), "question" (string), "options" (array de 4 strings), "correctAnswer" (string), "explanation" (string).
  As opções devem ser variadas e a resposta correta deve estar entre elas.
  IMPORTANTE: NÃO REPITA as seguintes perguntas já existentes: ${Array.from(existingQuestions).join('; ')}. Gere perguntas novas e diversificadas.
  Exemplo: [{ "difficulty": "easy", "question": "Qual a cor do céu?", "options": ["Verde", "Azul", "Vermelho", "Amarelo"], "correctAnswer": "Azul", "explanation": "O céu é azul devido à dispersão da luz solar." }]
  Retorne APENAS o array JSON, sem nenhum texto ou formatação adicional.`;

  return generateWithRetry(prompt);
}

async function processCategory(category: typeof categories[0]) {
    console.log(`\n--- Processando categoria: ${category.name} ---`);
    
    const curiosityFilePath = path.join(curiositiesDir, `${category.id}.json`);
    const quizFilePath = path.join(quizzesDir, `${category.id}.json`);

    // --- Geração de Curiosidades ---
    const categoryCuriosities: Curiosity[] = await readJsonFile(curiosityFilePath);
    const existingCuriosityTitles = new Set(categoryCuriosities.map(c => c.title));
    let neededCuriosities = CURIOSITIES_TARGET_PER_CATEGORY - categoryCuriosities.length;
    
    console.log(`Curiosidades: ${categoryCuriosities.length}/${CURIOSITIES_TARGET_PER_CATEGORY}`);
    if (neededCuriosities > 0) {
        for (let i = 0; i < neededCuriosities; i += BATCH_SIZE) {
            const countToGenerate = Math.min(neededCuriosities - i, BATCH_SIZE);
            console.log(`  - Gerando lote de ${countToGenerate} curiosidades...`);
            
            const newItems = await generateCuriosities(category.name, countToGenerate, existingCuriosityTitles);

            if (newItems && Array.isArray(newItems) && newItems.length > 0) {
                const uniqueNewItems = newItems.filter(c => c.title && !existingCuriosityTitles.has(c.title));

                let maxId = categoryCuriosities.length > 0 ? Math.max(...categoryCuriosities.map(c => parseInt(c.id.split('-').pop() || '0')).filter(Number.isFinite)) : 0;
                
                const itemsToAdd = uniqueNewItems.map((c: any) => {
                    maxId++;
                    return { ...c, id: `${category.id}-${maxId}`, categoryId: category.id };
                });

                categoryCuriosities.push(...itemsToAdd);
                itemsToAdd.forEach(c => existingCuriosityTitles.add(c.title));

                await writeJsonFile(curiosityFilePath, categoryCuriosities);
            } else {
                console.log(`  - Nenhuma curiosidade nova gerada neste lote.`);
            }
            await sleep(API_CALL_DELAY_MS);
        }
    } else {
      console.log(`  - Meta de curiosidades já atingida.`);
    }

    // --- Geração de Perguntas de Quiz ---
    const categoryQuizzes: QuizQuestion[] = await readJsonFile(quizFilePath);
    const existingQuestionStrings = new Set(categoryQuizzes.map(q => q.question));
    let neededQuizzes = QUIZ_QUESTIONS_TARGET_PER_CATEGORY - categoryQuizzes.length;
    
    console.log(`Quizzes: ${categoryQuizzes.length}/${QUIZ_QUESTIONS_TARGET_PER_CATEGORY}`);
    if (neededQuizzes > 0) {
        for (let i = 0; i < neededQuizzes; i += BATCH_SIZE) {
            const countToGenerate = Math.min(neededQuizzes - i, BATCH_SIZE);
            console.log(`  - Gerando lote de ${countToGenerate} quizzes...`);

            const newItems = await generateQuizQuestions(category.name, countToGenerate, existingQuestionStrings);
            
            if (newItems && Array.isArray(newItems) && newItems.length > 0) {
                const uniqueNewItems = newItems.filter(q => q.question && !existingQuestionStrings.has(q.question));

                let maxId = categoryQuizzes.length > 0 ? Math.max(...categoryQuizzes.map(q => parseInt(q.id.split('-').pop() || '0')).filter(Number.isFinite)) : 0;

                const itemsToAdd = uniqueNewItems.map((q: any) => {
                    maxId++;
                    return { ...q, id: `quiz-${category.id}-${maxId}`, categoryId: category.id };
                });

                categoryQuizzes.push(...itemsToAdd);
                itemsToAdd.forEach(q => existingQuestionStrings.add(q.question));

                await writeJsonFile(quizFilePath, categoryQuizzes);
            } else {
                console.log(`  - Nenhum quiz novo gerado neste lote.`);
            }
            await sleep(API_CALL_DELAY_MS);
        }
    } else {
        console.log(`  - Meta de quizzes já atingida.`);
    }
}

// --- FUNÇÃO PRINCIPAL ---

async function main() {
  console.log("Iniciando a geração de conteúdo...");

  await ensureDirExists(curiositiesDir);
  await ensureDirExists(quizzesDir);

  await migrateAndCleanOldFiles();

  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(3); // Processa até 3 categorias em paralelo

  const tasks = categories.map(category => limit(() => processCategory(category)));
  
  await Promise.all(tasks);

  console.log("\nProcesso de geração de conteúdo concluído!");
}

main().catch(console.error);
