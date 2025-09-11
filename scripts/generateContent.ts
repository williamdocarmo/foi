
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import fs from "fs/promises";
import path from "path";
import categories from "../src/lib/data/categories.json";

config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is not defined in your .env file");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const CURIOSITIES_PER_CATEGORY = 5; // Change this to generate more or less
const QUIZ_QUESTIONS_PER_CATEGORY = 5; // Change this to generate more or less
const RETRY_DELAY_MS = 5000; // 5 seconds delay between retries
const MAX_RETRIES = 3;
const API_CALL_DELAY_MS = 1000; // 1 second delay between API calls

const dataDir = path.join(__dirname, "../src/lib/data");

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateWithRetry(prompt: string, attempt = 1): Promise<any> {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    // Remove markdown code block fences and trim whitespace
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanedText);
  } catch (error: any) {
    if (attempt <= MAX_RETRIES && (error.status === 503 || error.status === 429)) {
      console.warn(`  [WARN] API Overloaded. Retrying in ${RETRY_DELAY_MS / 1000}s... (Attempt ${attempt}/${MAX_RETRIES})`);
      await sleep(RETRY_DELAY_MS);
      return generateWithRetry(prompt, attempt + 1);
    }
    throw error;
  }
}

async function generateCuriosities(categoryName: string, count: number) {
  const prompt = `Gere ${count} curiosidades sobre o tema "${categoryName}".
  O formato de saída deve ser um array de objetos JSON.
  Cada objeto deve ter os campos: "title" (string), "content" (string), e "funFact" (string, opcional).
  O conteúdo deve ser interessante, direto e de fácil leitura.
  Exemplo: [{ "title": "O Coração Humano", "content": "O coração humano bate cerca de 100.000 vezes por dia.", "funFact": "O coração de uma baleia azul é enorme." }]
  Retorne APENAS o array JSON, sem nenhum texto ou formatação adicional.`;

  try {
    return await generateWithRetry(prompt);
  } catch (error) {
    console.error(`Erro ao gerar curiosidades para ${categoryName}:`, error);
    return [];
  }
}

async function generateQuizQuestions(categoryName: string, count: number) {
  const prompt = `Gere ${count} perguntas de quiz sobre o tema "${categoryName}".
  O formato de saída deve ser um array de objetos JSON.
  Cada objeto deve ter os campos: "difficulty" ('easy', 'medium', ou 'hard'), "question" (string), "options" (array de 4 strings), "correctAnswer" (string), "explanation" (string).
  As opções devem ser variadas e a resposta correta deve estar entre elas.
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

  for (const category of categories) {
    console.log(`\nGerando conteúdo para a categoria: ${category.name}`);

    // --- Geração de Curiosidades ---
    const newCuriosities = await generateCuriosities(category.name, CURIOSITIES_PER_CATEGORY);
    if (newCuriosities.length > 0) {
      const curiosityFilePath = path.join(dataDir, `curiosities-${category.id}.json`);
      const existingCuriosities = [];
      try {
        const fileContent = await fs.readFile(curiosityFilePath, "utf-8");
        // Ensure existing content is a valid array
        const parsedContent = JSON.parse(fileContent);
        if (Array.isArray(parsedContent)) {
          existingCuriosities.push(...parsedContent);
        }
      } catch (e) {
        // Arquivo não existe ou está mal formatado, será criado/sobrescrito
      }

      const allCuriosities = [...existingCuriosities, ...newCuriosities.map((c: any, index: number) => ({
        ...c,
        id: `${category.id}-${existingCuriosities.length + index + 1}`,
        categoryId: category.id,
      }))];
      
      await fs.writeFile(curiosityFilePath, JSON.stringify(allCuriosities, null, 2));
      console.log(`- ${newCuriosities.length} novas curiosidades salvas em ${curiosityFilePath}`);
    }

    await sleep(API_CALL_DELAY_MS); // Pause between API calls

    // --- Geração de Perguntas de Quiz ---
    const newQuestions = await generateQuizQuestions(category.name, QUIZ_QUESTIONS_PER_CATEGORY);
    if (newQuestions.length > 0) {
      const quizFilePath = path.join(dataDir, `quiz-questions-${category.id}.json`);
      const existingQuestions = [];
      try {
        const fileContent = await fs.readFile(quizFilePath, "utf-8");
        // Ensure existing content is a valid array
        const parsedContent = JSON.parse(fileContent);
        if (Array.isArray(parsedContent)) {
          existingQuestions.push(...parsedContent);
        }
      } catch (e) {
        // Arquivo não existe ou está mal formatado, será criado/sobrescrito
      }
      
      const allQuestions = [...existingQuestions, ...newQuestions.map((q: any, index: number) => ({
        ...q,
        id: `quiz-${category.id}-${existingQuestions.length + index + 1}`,
        categoryId: category.id,
      }))];

      await fs.writeFile(quizFilePath, JSON.stringify(allQuestions, null, 2));
      console.log(`- ${newQuestions.length} novas perguntas de quiz salvas em ${quizFilePath}`);
    }
     await sleep(API_CALL_DELAY_MS); // Pause before the next category
  }

  console.log("\nProcesso de geração de conteúdo concluído!");
}

main();
