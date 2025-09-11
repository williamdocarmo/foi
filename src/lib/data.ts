import type { Category, Curiosity, QuizQuestion } from './types';
import categoriesData from './data/categories.json';
import curiositiesData from './data/curiosities.json';
import quizQuestionsData from './data/quiz-questions.json';

export const categories: Category[] = categoriesData;

const allCuriosities: Curiosity[] = curiositiesData as Curiosity[];
const allQuizQuestions: QuizQuestion[] = quizQuestionsData as QuizQuestion[];

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
 * Retrieves all curiosities from the data source.
 * @returns An array of all curiosities.
 */
export function getAllCuriosities(): Curiosity[] {
  return allCuriosities;
}

/**
 * Retrieves all quiz questions from the data source.
 * @returns An array of all quiz questions.
 */
export function getAllQuizQuestions(): QuizQuestion[] {
  return allQuizQuestions;
}
