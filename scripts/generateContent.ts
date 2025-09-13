
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import fs from "fs/promises";
import path from "path";
import categories from "../src/lib/data/categories.json";
import { Curiosity, QuizQuestion } from "@/lib/types";

config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is not defined in your .env file");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const CURIOSITIES_PER_CATEGORY = 5000;
const QUIZ_QUESTIONS_PER_CATEGORY = 2500;
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 3;
const API_CALL_DELAY_MS = 2000;

const dataDir = path.join(__dirname, "../src/lib/data");
const allCuriositiesPath = path.join(dataDir, 'curiosities.json');
const allQuizzesPath = path.join(dataDir, 'quiz-questions.json');


function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJsonFile<T>(filePath: string): Promise<T[]> {
    try {
        await fs.access(filePath);
        const fileContent = await fs.readFile(filePath, "utf-8");
        const parsedContent = JSON.parse(fileContent);
        return Array.isArray(parsedContent) ? parsedContent : [];
    } catch (e) {
        // Arquivo não existe ou está vazio, retorna array vazio.
        return [];
    }
}


async function generateWithRetry(prompt: string, attempt = 1): Promise<any> {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    if (!cleanedText) {
      console.warn("  [WARN] Received empty response from API.");
      return [];
    }
    return JSON.parse(cleanedText);
  } catch (error: any) {
    if (attempt <= MAX_RETRIES && (error?.status === 503 || error?.status === 429)) {
      console.warn(`  [WARN] API Overloaded. Retrying in ${RETRY_DELAY_MS / 1000}s... (Attempt ${attempt}/${MAX_RETRIES})`);
      await sleep(RETRY_DELAY_MS);
      return generateWithRetry(prompt, attempt + 1);
    }
     if (error instanceof SyntaxError) {
      console.error("  [ERROR] Failed to parse JSON from API response. The response might be malformed or empty.");
      console.log("Malformed response:", error);
      return [];
    }
    throw error;
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

  try {
    return await generateWithRetry(prompt);
  } catch (error) {
    console.error(`Erro ao gerar curiosidades para ${categoryName}:`, error);
    return [];
  }
}

async function generateQuizQuestions(categoryName: string, count: number, existingQuestions: string[]) {
  const prompt = `Gere ${count} perguntas de quiz sobre o tema "${categoryName}".
  O formato de saída deve ser um array de objetos JSON.
  Cada objeto deve ter os campos: "difficulty" ('easy', 'medium', ou 'hard'), "question" (string), "options" (array de 4 strings), "correctAnswer" (string), "explanation" (string).
  As opções devem ser variadas e a resposta correta deve estar entre elas.
  IMPORTANTE: NÃO REPITA as seguintes perguntas já existentes: ${existingQuestions.join('; ')}
  Exemplo: [{ "difficulty": "easy", "question": "Qual a cor do céu?", "options": ["Verde", "Azul", "Vermelho", "Amarelo"], "correctAnswer": "Azul", "explanation": "O céu é azul devido à dispersão da luz solar." }]
  Retorne APENAS o array JSON, sem nenhum texto ou formatação adicional.`;

  try {
    return await generateWithRetry(prompt);
  } catch (error) {
    console.error(`Erro ao gerar quiz para ${categoryName}:`, error);
    return [];
  }
}

async function main() {
  console.log("Iniciando a geração de conteúdo com IA...");

  const allCuriosities: Curiosity[] = await readJsonFile(allCuriositiesPath);
  const allQuizQuestions: QuizQuestion[] = await readJsonFile(allQuizzesPath);

  let newCuriositiesCount = 0;
  let newQuizzesCount = 0;

  for (const category of categories) {
    console.log(`\nProcessando categoria: ${category.name}`);

    // --- Geração de Curiosidades ---
    const existingCuriosityTitles = allCuriosities
        .filter(c => c.categoryId === category.id)
        .map(c => c.title);

    const neededCuriosities = CURIOSITIES_PER_CATEGORY - existingCuriosityTitles.length;

    if (neededCuriosities > 0) {
        const newCuriosities = await generateCuriosities(category.name, neededCuriosities, existingCuriosityTitles);
        
        if (newCuriosities && Array.isArray(newCuriosities) && newCuriosities.length > 0) {
            let maxId = allCuriosities.length > 0 ? Math.max(...allCuriosities.map(c => parseInt(c.id.split('-').pop() || '0')).filter(Number.isFinite)) : 0;
            const curiositiesToAdd = newCuriosities.map((c: any) => {
                maxId++;
                return {
                    ...c,
                    id: `${category.id}-${maxId}`, // Unique ID
                    categoryId: category.id,
                };
            });
            allCuriosities.push(...curiositiesToAdd);
            newCuriositiesCount += curiositiesToAdd.length;
            console.log(`- ${curiositiesToAdd.length} novas curiosidades para ${category.name}`);
        } else {
            console.log(`- Nenhuma curiosidade nova gerada para ${category.name}`);
        }
    } else {
        console.log(`- Categoria ${category.name} já possui ${existingCuriosityTitles.length} curiosidades. Nenhuma geração necessária.`);
    }

    await sleep(API_CALL_DELAY_MS); // Pause between API calls

    // --- Geração de Perguntas de Quiz ---
    const existingQuestionStrings = allQuizQuestions
        .filter(q => q.categoryId === category.id)
        .map(q => q.question);

    const neededQuizzes = QUIZ_QUESTIONS_PER_CATEGORY - existingQuestionStrings.length;
    
    if (neededQuizzes > 0) {
        const newQuestions = await generateQuizQuestions(category.name, neededQuizzes, existingQuestionStrings);
        
        if (newQuestions && Array.isArray(newQuestions) && newQuestions.length > 0) {
            let maxId = allQuizQuestions.length > 0 ? Math.max(...allQuizQuestions.map(q => parseInt(q.id.split('-').pop() || '0')).filter(Number.isFinite)) : 0;
            const questionsToAdd = newQuestions.map((q: any) => {
                maxId++;
                return {
                    ...q,
                    id: `quiz-${category.id}-${maxId}`, // Unique ID
                    categoryId: category.id,
                };
            });
          allQuizQuestions.push(...questionsToAdd);
          newQuizzesCount += questionsToAdd.length;
          console.log(`- ${questionsToAdd.length} novas perguntas de quiz para ${category.name}`);
        } else {
            console.log(`- Nenhum quiz novo gerado para ${category.name}`);
        }
    } else {
         console.log(`- Categoria ${category.name} já possui ${existingQuestionStrings.length} perguntas de quiz. Nenhuma geração necessária.`);
    }


    await sleep(API_CALL_DELAY_MS); // Pause before the next category
  }

  // Save all changes at the end
  if (newCuriositiesCount > 0) {
    await fs.writeFile(allCuriositiesPath, JSON.stringify(allCuriosities, null, 2));
    console.log(`\nTotal de ${allCuriosities.length} curiosidades salvas em ${allCuriositiesPath}`);
  }
  
  if (newQuizzesCount > 0) {
    await fs.writeFile(allQuizzesPath, JSON.stringify(allQuizQuestions, null, 2));
    console.log(`Total de ${allQuizQuestions.length} perguntas de quiz salvas em ${allQuizzesPath}`);
  }

  if (newCuriositiesCount === 0 && newQuizzesCount === 0) {
    console.log("\nNenhum conteúdo novo foi gerado nesta execução.");
  }

  console.log("\nProcesso de geração de conteúdo concluído!");
}

main();
