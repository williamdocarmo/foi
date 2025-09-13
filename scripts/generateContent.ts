
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import fs from "fs/promises";
import path from "path";
import categories from "../src/lib/data/categories.json";
import type { Curiosity, QuizQuestion } from "@/lib/types";

config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is not defined in your .env file");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- CONFIGURAÇÕES ---
const CURIOSITIES_TARGET_PER_CATEGORY = 40;
const QUIZ_QUESTIONS_TARGET_PER_CATEGORY = 25;
const BATCH_SIZE = 15; // Itens a serem gerados por chamada de API
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 3;
const API_CALL_DELAY_MS = 2000; // Pausa entre chamadas para não sobrecarregar a API

const dataDir = path.join(__dirname, "../src/lib/data");
const allCuriositiesPath = path.join(dataDir, 'curiosities.json');
const allQuizzesPath = path.join(dataDir, 'quiz-questions.json');

// --- FUNÇÕES AUXILIARES ---

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJsonFile<T>(filePath: string): Promise<T[]> {
  try {
    await fs.access(filePath);
    const fileContent = await fs.readFile(filePath, "utf-8");
    if (!fileContent) return [];
    const parsedContent = JSON.parse(fileContent);
    return Array.isArray(parsedContent) ? parsedContent : [];
  } catch (e) {
    return [];
  }
}

async function writeJsonFile(filePath: string, data: any[]): Promise<void> {
  const sortedData = data.sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(filePath, JSON.stringify(sortedData, null, 2));
  console.log(`   > ${data.length} itens salvos em ${path.basename(filePath)}`);
}

async function generateWithRetry(prompt: string, attempt = 1): Promise<any[]> {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
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
      return []; // Retorna array vazio para não quebrar o script
    }
    console.error("  [ERRO] Erro inesperado da API:", error);
    return []; // Retorna array vazio em caso de outros erros
  }
}

async function generateCuriosities(categoryName: string, count: number, existingTitles: string[]) {
  const prompt = `Gere ${count} curiosidades sobre o tema "${categoryName}".
  O formato de saída deve ser um array de objetos JSON.
  Cada objeto deve ter os campos: "title" (string), "content" (string), e "funFact" (string, opcional).
  O conteúdo deve ser interessante, direto e de fácil leitura.
  IMPORTANTE: NÃO REPITA os seguintes títulos de curiosidades já existentes: ${existingTitles.join(', ')}. Gere tópicos novos.
  Exemplo: [{ "title": "O Coração Humano", "content": "O coração humano bate cerca de 100.000 vezes por dia.", "funFact": "O coração de uma baleia azul é enorme." }]
  Retorne APENAS o array JSON, sem nenhum texto ou formatação adicional.`;

  return generateWithRetry(prompt);
}

async function generateQuizQuestions(categoryName: string, count: number, existingQuestions: string[]) {
  const prompt = `Gere ${count} perguntas de quiz sobre o tema "${categoryName}".
  O formato de saída deve ser um array de objetos JSON.
  Cada objeto deve ter os campos: "difficulty" ('easy', 'medium', ou 'hard'), "question" (string), "options" (array de 4 strings), "correctAnswer" (string), "explanation" (string).
  As opções devem ser variadas e a resposta correta deve estar entre elas.
  IMPORTANTE: NÃO REPITA as seguintes perguntas já existentes: ${existingQuestions.join('; ')}
  Exemplo: [{ "difficulty": "easy", "question": "Qual a cor do céu?", "options": ["Verde", "Azul", "Vermelho", "Amarelo"], "correctAnswer": "Azul", "explanation": "O céu é azul devido à dispersão da luz solar." }]
  Retorne APENAS o array JSON, sem nenhum texto ou formatação adicional.`;

  return generateWithRetry(prompt);
}


async function validateAndCleanData(
    allCuriosities: Curiosity[], 
    allQuizQuestions: QuizQuestion[],
    validCategoryIds: Set<string>
  ): Promise<{ curiosities: Curiosity[], quizzes: QuizQuestion[] }> {
    
    const initialCuriosityCount = allCuriosities.length;
    const initialQuizCount = allQuizQuestions.length;

    const cleanedCuriosities = allCuriosities.filter(c => validCategoryIds.has(c.categoryId));
    const cleanedQuizzes = allQuizQuestions.filter(q => validCategoryIds.has(q.categoryId));

    const curiositiesRemoved = initialCuriosityCount - cleanedCuriosities.length;
    const quizzesRemoved = initialQuizCount - cleanedQuizzes.length;

    if (curiositiesRemoved > 0) {
      console.log(`[LIMPEZA] Removidas ${curiositiesRemoved} curiosidades de categorias inexistentes.`);
      await writeJsonFile(allCuriositiesPath, cleanedCuriosities);
    }
    if (quizzesRemoved > 0) {
      console.log(`[LIMPEZA] Removidas ${quizzesRemoved} perguntas de quiz de categorias inexistentes.`);
      await writeJsonFile(allQuizzesPath, cleanedQuizzes);
    }

    if (curiositiesRemoved === 0 && quizzesRemoved === 0) {
      console.log("[VALIDAÇÃO] Todos os dados estão consistentes com as categorias atuais.");
    }
    
    return { curiosities: cleanedCuriosities, quizzes: cleanedQuizzes };
}


// --- FUNÇÃO PRINCIPAL ---

async function main() {
  console.log("Iniciando a verificação e geração de conteúdo...");

  let allCuriosities: Curiosity[] = await readJsonFile(allCuriositiesPath);
  let allQuizQuestions: QuizQuestion[] = await readJsonFile(allQuizzesPath);
  
  const validCategoryIds = new Set(categories.map(c => c.id));
  
  // --- Passo 1: Validar e Limpar Dados Órfãos ---
  const cleanedData = await validateAndCleanData(allCuriosities, allQuizQuestions, validCategoryIds);
  allCuriosities = cleanedData.curiosities;
  allQuizQuestions = cleanedData.quizzes;


  // --- Passo 2: Geração de Conteúdo para cada Categoria ---
  for (const category of categories) {
    console.log(`\n--- Processando categoria: ${category.name} ---`);

    // --- Geração de Curiosidades ---
    let existingCuriosityTitles = allCuriosities
      .filter(c => c.categoryId === category.id)
      .map(c => c.title);
    let neededCuriosities = CURIOSITIES_TARGET_PER_CATEGORY - existingCuriosityTitles.length;

    console.log(`Curiosidades: ${existingCuriosityTitles.length}/${CURIOSITIES_TARGET_PER_CATEGORY}`);
    if (neededCuriosities > 0) {
      let batchNumber = 1;
      while (neededCuriosities > 0) {
        const countToGenerate = Math.min(neededCuriosities, BATCH_SIZE);
        console.log(`  - Gerando lote ${batchNumber} de ${countToGenerate} curiosidades...`);
        
        const newCuriosities = await generateCuriosities(category.name, countToGenerate, existingCuriosityTitles);
        
        if (newCuriosities && Array.isArray(newCuriosities) && newCuriosities.length > 0) {
          const uniqueNewCuriosities = newCuriosities.filter(c => c.title && !existingCuriosityTitles.includes(c.title));

          let maxId = allCuriosities.length > 0 ? Math.max(...allCuriosities.map(c => parseInt(c.id.split('-').pop() || '0')).filter(Number.isFinite)) : 0;
          const curiositiesToAdd = uniqueNewCuriosities.map((c: any) => {
            maxId++;
            return { ...c, id: `${category.id}-${maxId}`, categoryId: category.id };
          });

          allCuriosities.push(...curiositiesToAdd);
          existingCuriosityTitles.push(...curiositiesToAdd.map(c => c.title));
          await writeJsonFile(allCuriositiesPath, allCuriosities);
        } else {
          console.log(`  - Nenhuma curiosidade nova gerada neste lote.`);
        }
        neededCuriosities = CURIOSITIES_TARGET_PER_CATEGORY - existingCuriosityTitles.length;
        batchNumber++;
        await sleep(API_CALL_DELAY_MS);
      }
    } else {
      console.log(`  - Meta de curiosidades já atingida.`);
    }

    // --- Geração de Perguntas de Quiz ---
    let existingQuestionStrings = allQuizQuestions
        .filter(q => q.categoryId === category.id)
        .map(q => q.question);
    let neededQuizzes = QUIZ_QUESTIONS_TARGET_PER_CATEGORY - existingQuestionStrings.length;

    console.log(`Quizzes: ${existingQuestionStrings.length}/${QUIZ_QUESTIONS_TARGET_PER_CATEGORY}`);
    if (neededQuizzes > 0) {
        let batchNumber = 1;
        while(neededQuizzes > 0) {
            const countToGenerate = Math.min(neededQuizzes, BATCH_SIZE);
            console.log(`  - Gerando lote ${batchNumber} de ${countToGenerate} quizzes...`);

            const newQuestions = await generateQuizQuestions(category.name, countToGenerate, existingQuestionStrings);

            if (newQuestions && Array.isArray(newQuestions) && newQuestions.length > 0) {
                const uniqueNewQuestions = newQuestions.filter(q => q.question && !existingQuestionStrings.includes(q.question));

                let maxId = allQuizQuestions.length > 0 ? Math.max(...allQuizQuestions.map(q => parseInt(q.id.split('-').pop() || '0')).filter(Number.isFinite)) : 0;
                const questionsToAdd = uniqueNewQuestions.map((q: any) => {
                    maxId++;
                    return { ...q, id: `quiz-${category.id}-${maxId}`, categoryId: category.id };
                });

                allQuizQuestions.push(...questionsToAdd);
                existingQuestionStrings.push(...questionsToAdd.map(q => q.question));
                await writeJsonFile(allQuizzesPath, allQuizQuestions);

            } else {
                console.log(`  - Nenhum quiz novo gerado neste lote.`);
            }
            neededQuizzes = QUIZ_QUESTIONS_TARGET_PER_CATEGORY - existingQuestionStrings.length;
            batchNumber++;
            await sleep(API_CALL_DELAY_MS);
        }
    } else {
      console.log(`  - Meta de quizzes já atingida.`);
    }
    console.log(`Processamento para ${category.name} concluído.`);
  }

  console.log("\n--- Resumo Final ---");
  console.log(`Total de curiosidades: ${allCuriosities.length}`);
  console.log(`Total de perguntas de quiz: ${allQuizQuestions.length}`);
  console.log("Processo de geração de conteúdo concluído!");
}

main().catch(console.error);
