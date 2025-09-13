// src/lib/data.ts
import type { Category, Curiosity, QuizQuestion } from './types';
import categoriesData from './data/categories.json';
import fs from 'fs';
import path from 'path';

// --- Abordagem Otimizada: Pré-processamento de Dados ---
// Os dados são lidos uma vez no início e organizados em mapas para acesso rápido.
// Isso evita a necessidade de filtrar arrays grandes repetidamente.

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
    console.warn(`Aviso: Diretório não encontrado: ${directory}. Retornando array vazio.`);
    return [];
  }
}

// Carrega todos os dados uma vez.
const allCuriosities: Curiosity[] = loadDataFromDirectory<Curiosity>(curiositiesDir);
const allQuizQuestions: QuizQuestion[] = loadDataFromDirectory<QuizQuestion>(quizzesDir);

/**
 * Otimização: Cria um mapa de curiosidades por ID da categoria para acesso O(1).
 * Este mapa é gerado apenas uma vez quando o módulo é carregado.
 */
export const curiositiesByCategory = allCuriosities.reduce<Record<string, Curiosity[]>>((acc, cur) => {
  if (!acc[cur.categoryId]) {
    acc[cur.categoryId] = [];
  }
  acc[cur.categoryId].push(cur);
  return acc;
}, {});

/**
 * Otimização: Cria um mapa de quizzes por ID da categoria para acesso O(1).
 */
export const quizzesByCategory = allQuizQuestions.reduce<Record<string, QuizQuestion[]>>((acc, quiz) => {
    if (!acc[quiz.categoryId]) {
        acc[quiz.categoryId] = [];
    }
    acc[quiz.categoryId].push(quiz);
    return acc;
}, {});


export const categories: Category[] = categoriesData;

/**
 * Encontra uma categoria pelo seu ID.
 * @param id O ID da categoria a ser encontrada.
 * @returns O objeto da categoria ou undefined se não for encontrado.
 */
export function getCategoryById(id: string): Category | undefined {
  return categories.find(c => c.id === id);
}

/**
 * Recupera todas as curiosidades de um determinado ID de categoria usando o mapa pré-processado.
 * @param categoryId O ID da categoria.
 * @returns Um array de curiosidades para essa categoria.
 */
export function getCuriositiesByCategoryId(categoryId: string): Curiosity[] {
  return curiositiesByCategory[categoryId] || [];
}

/**
 * Recupera todas as perguntas do quiz para um determinado ID de categoria usando o mapa pré-processado.
 * @param categoryId O ID da categoria.
 * @returns Um array de perguntas do quiz para essa categoria.
 */
export function getQuizQuestionsByCategoryId(categoryId: string): QuizQuestion[] {
  return quizzesByCategory[categoryId] || [];
}

/**
 * Recupera todas as curiosidades de todas as categorias.
 * @returns Um array de todas as curiosidades.
 */
export function getAllCuriosities(): Curiosity[] {
  return allCuriosities;
}

/**
 * Recupera todas as perguntas do quiz de todas as categorias.
 * @returns Um array de todas as perguntas do quiz.
 */
export function getAllQuizQuestions(): QuizQuestion[] {
  return allQuizQuestions;
}
