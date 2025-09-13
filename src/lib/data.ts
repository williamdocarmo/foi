// src/lib/data.ts
import type { Category, Curiosity, QuizQuestion } from './types';
import categoriesData from './data/categories.json';
import fs from 'fs';
import path from 'path';

// --- Nova Abordagem: Leitura de Arquivos com Node.js 'fs' ---
// Esta é uma solução mais robusta e padrão para o ambiente Next.js/Node.js,
// garantindo que os arquivos de dados sejam lidos de forma confiável.

const curiositiesDir = path.join(process.cwd(), 'data/curiosities');
const quizzesDir = path.join(process.cwd(), 'data/quiz-questions');

/**
 * Lê todos os arquivos JSON de um diretório e os combina em um único array.
 * @param directory O caminho para o diretório.
 * @returns Um array com o conteúdo de todos os arquivos JSON.
 */
function loadDataFromDirectory<T>(directory: string): T[] {
  try {
    const filenames = fs.readdirSync(directory);
    const jsonData = filenames
      .filter(filename => filename.endsWith('.json'))
      .map(filename => {
        const filePath = path.join(directory, filename);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        try {
            return JSON.parse(fileContent) as T[];
        } catch (e) {
            console.error(`Erro ao fazer parse do JSON no arquivo: ${filePath}`, e);
            return []; // Retorna array vazio se o JSON for inválido
        }
      });
      
    return jsonData.flat();
  } catch (error) {
    // Se o diretório não existir, retorna um array vazio.
    // Isso evita que o build quebre se a pasta ainda não foi criada.
    console.warn(`Aviso: Diretório não encontrado: ${directory}. Retornando array vazio.`);
    return [];
  }
}

const allCuriosities: Curiosity[] = loadDataFromDirectory<Curiosity>(curiositiesDir);
const allQuizQuestions: QuizQuestion[] = loadDataFromDirectory<QuizQuestion>(quizzesDir);

export const categories: Category[] = categoriesData;

/**
 * Finds a category by its ID.
 * @param id The ID of the category to find.
 * @returns The category object or undefined if not found.
 */
export function getCategoryById(id: string): Category | undefined {
  return categories.find(c => c.id === id);
}

/**
 * Retrieves all curiosities for a given category ID.
 * @param categoryId The ID of the category.
 * @returns An array of curiosities for that category.
 */
export function getCuriositiesByCategoryId(categoryId: string): Curiosity[] {
  return allCuriosities.filter(c => c.categoryId === categoryId);
}

/**
 * Retrieves all quiz questions for a given category ID.
 * @param categoryId The ID of the category.
 * @returns An array of quiz questions for that category.
 */
export function getQuizQuestionsByCategoryId(categoryId: string): QuizQuestion[] {
  return allQuizQuestions.filter(q => q.categoryId === categoryId);
}

/**
 * Retrieves all curiosidades from all categories.
 * This function is intended for server-side use only.
 * @returns An array of all curiosities.
 */
export function getAllCuriosities(): Curiosity[] {
  return allCuriosities;
}

/**
 * Retrieves all quiz questions from all categories.
 * This function is intended for server-side use only.
 * @returns An array of all quiz questions.
 */
export function getAllQuizQuestions(): QuizQuestion[] {
  return allQuizQuestions;
}
