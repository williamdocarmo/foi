// src/lib/data.ts
import type { Category, Curiosity, QuizQuestion } from './types';
import categoriesData from './data/categories.json';

// IMPORTANT: This file has been refactored to dynamically load all data from the 
// `data/curiosities` and `data/quiz-questions` directories. This approach avoids 
// "Module not found" errors when a category is added or removed, as the build 
// process no longer depends on static imports for these files.

// Helper function to dynamically import JSON files from a directory
function importAll<T>(r: __WebpackModuleApi.RequireContext): T[] {
  const allFiles = r.keys().map(r);
  // The imported files might be modules with a `default` export
  const content = allFiles.map((file: any) => file.default || file);
  return content.flat();
}

// Dynamically import all curiosity and quiz question files
const allCuriosities: Curiosity[] = importAll(require.context('../../data/curiosities', false, /\.json$/));
const allQuizQuestions: QuizQuestion[] = importAll(require.context('../../data/quiz-questions', false, /\.json$/));

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
 * @returns An array of all curiosities.
 */
export function getAllCuriosities(): Curiosity[] {
  return allCuriosities;
}

/**
 * Retrieves all quiz questions from all categories.
 * @returns An array of all quiz questions.
 */
export function getAllQuizQuestions(): QuizQuestion[] {
  return allQuizQuestions;
}
