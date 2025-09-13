
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
const CURIOSITIES_TARGET_PER_CATEGORY = 5000;
const QUIZ_QUESTIONS_TARGET_PER_CATEGORY = 2500;
const BATCH_SIZE = 20; // Itens a serem gerados por chamada de API
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
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
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

// --- FUNÇÃO PRINCIPAL ---

async function main() {
  console.log("Iniciando a geração de conteúdo com IA...");

  const allCuriosities: Curiosity[] = await readJsonFile(allCuriositiesPath);
  const allQuizQuestions: QuizQuestion[] = await readJsonFile(allQuizzesPath);

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
          const uniqueNewCuriosities = newCuriosities.filter(c => !existingCuriosityTitles.includes(c.title));

          let maxId = allCuriosities.length > 0 ? Math.max(...allCuriosities.map(c => parseInt(c.id.split('-').pop() || '0')).filter(Number.isFinite)) : 0;
          const curiositiesToAdd = uniqueNewCuriosities.map((c: any) => {
            maxId++;
            return { ...c, id: `${category.id}-${maxId}`, categoryId: category.id };
          });

          allCuriosities.push(...curiositiesToAdd);
          existingCuriosityTitles.push(...curiositiesToAdd.map(c => c.title));
          await writeJsonFile(allCuriositiesPath, allCuriosities);
          console.log(`    > ${curiositiesToAdd.length} novas curiosidades salvas.`);

        } else {
          console.log(`  - Nenhuma curiosidade nova gerada neste lote.`);
        }
        neededCuriosities = CURIOSITIES_TARGET_PER_CATEGORY - existingCuriosityTitles.length;
        batchNumber++;
        await sleep(API_CALL_DELAY_MS);
      }
    }
    console.log(`Geração de curiosidades para ${category.name} concluída.`);


    // --- Geração de Perguntas de Quiz ---
    let existingQuestionStrings = allQuizQuestions
        .filter(q => q.categoryId === category.id)
        .map(q => q.question);
    let neededQuizzes = QUIZ_QUESTIONS_TARGET_PER_CATEGORY - existingQuestionStrings.length;

    console.log(`\nQuizzes: ${existingQuestionStrings.length}/${QUIZ_QUESTIONS_TARGET_PER_CATEGORY}`);
    if (neededQuizzes > 0) {
        let batchNumber = 1;
        while(neededQuizzes > 0) {
            const countToGenerate = Math.min(neededQuizzes, BATCH_SIZE);
            console.log(`  - Gerando lote ${batchNumber} de ${countToGenerate} quizzes...`);

            const newQuestions = await generateQuizQuestions(category.name, countToGenerate, existingQuestionStrings);

            if (newQuestions && Array.isArray(newQuestions) && newQuestions.length > 0) {
                const uniqueNewQuestions = newQuestions.filter(q => !existingQuestionStrings.includes(q.question));

                let maxId = allQuizQuestions.length > 0 ? Math.max(...allQuizQuestions.map(q => parseInt(q.id.split('-').pop() || '0')).filter(Number.isFinite)) : 0;
                const questionsToAdd = uniqueNewQuestions.map((q: any) => {
                    maxId++;
                    return { ...q, id: `quiz-${category.id}-${maxId}`, categoryId: category.id };
                });

                allQuizQuestions.push(...questionsToAdd);
                existingQuestionStrings.push(...questionsToAdd.map(q => q.question));
                await writeJsonFile(allQuizzesPath, allQuizQuestions);
                console.log(`    > ${questionsToAdd.length} novas perguntas de quiz salvas.`);

            } else {
                console.log(`  - Nenhum quiz novo gerado neste lote.`);
            }
            neededQuizzes = QUIZ_QUESTIONS_TARGET_PER_CATEGORY - existingQuestionStrings.length;
            batchNumber++;
            await sleep(API_CALL_DELAY_MS);
        }
    }
    console.log(`Geração de quizzes para ${category.name} concluída.`);
  }

  console.log("\n--- Resumo Final ---");
  console.log(`Total de curiosidades: ${allCuriosities.length}`);
  console.log(`Total de perguntas de quiz: ${allQuizQuestions.length}`);
  console.log("Processo de geração de conteúdo concluído!");
}

main().catch(console.error);


    