
import type { Category, Curiosity, QuizQuestion } from './types';
import categoriesData from './data/categories.json';
import curiositiesData from './data/curiosities.json';
import quizQuestionsData from './data/quiz-questions.json';

export const categories: Category[] = categoriesData;

// Type guard to ensure data is treated as Curiosity[]
const allCuriosities: Curiosity[] = curiositiesData as Curiosity[];
const allQuizQuestions: QuizQuestion[] = quizQuestionsData as QuizQuestion[];

export const getCategoryById = (id: string): Category | undefined => {
  return categories.find(c => c.id === id);
}

export async function getCuriositiesByCategoryId(categoryId: string): Promise<Curiosity[]> {
  // We use a Promise to keep the async signature, even though it resolves immediately.
  // This makes it consistent with potential future data-fetching strategies.
  return Promise.resolve(
    allCuriosities.filter(c => c.categoryId === categoryId)
  );
}

export async function getQuizQuestionsByCategoryId(categoryId: string): Promise<QuizQuestion[]> {
  return Promise.resolve(
    allQuizQuestions.filter(q => q.categoryId === categoryId)
  );
}

export async function getAllCuriosities(): Promise<Curiosity[]> {
  return Promise.resolve(allCuriosities);
}

export async function getAllQuizQuestions(): Promise<QuizQuestion[]> {
    return Promise.resolve(allQuizQuestions);
}
