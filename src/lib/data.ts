import type { Category, Curiosity, QuizQuestion } from './types';
import categoriesData from './data/categories.json';
import curiositiesData from './data/curiosities.json';
import quizQuestionsData from './data/quiz-questions.json';

export const categories: Category[] = categoriesData;
export const curiosities: Curiosity[] = curiositiesData;
export const quizQuestions: QuizQuestion[] = quizQuestionsData;

// Helper functions
export const getCategoryById = (id: string) => categories.find(c => c.id === id);
export const getCuriositiesByCategoryId = (categoryId: string) => curiosities.filter(c => c.categoryId === categoryId);
export const getQuizQuestionsByCategoryId = (categoryId: string) => quizQuestions.filter(q => q.categoryId === categoryId);
export const getRandomCuriosity = () => curiosities[Math.floor(Math.random() * curiosities.length)];
