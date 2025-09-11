import type { Category, Curiosity, QuizQuestion } from './types';
import categoriesData from './data/categories.json';

// Import all curiosities and quiz questions dynamically
// This is a placeholder as we can't use dynamic imports easily in a way that satisfies bundling for all environments.
// The data loading logic is now more of a conceptual guide for how to structure the data.
// In a real-world scenario, you would fetch this data from an API or use a more sophisticated loading mechanism.

export const categories: Category[] = categoriesData;

// Helper functions now dynamically import data based on category ID
export const getCategoryById = (id: string) => categories.find(c => c.id === id);

export async function getCuriositiesByCategoryId(categoryId: string): Promise<Curiosity[]> {
  try {
    const curiosities = await import(`./data/curiosities-${categoryId}.json`);
    return curiosities.default;
  } catch (error) {
    console.warn(`No curiosities found for category ${categoryId}`);
    return [];
  }
}

export async function getQuizQuestionsByCategoryId(categoryId: string): Promise<QuizQuestion[]> {
  try {
    const questions = await import(`./data/quiz-questions-${categoryId}.json`);
    return questions.default;
  } catch (error) {
    console.warn(`No quiz questions found for category ${categoryId}`);
    return [];
  }
}

export async function getAllCuriosities(): Promise<Curiosity[]> {
    let allCuriosities: Curiosity[] = [];
    for (const category of categories) {
        const curiosities = await getCuriositiesByCategoryId(category.id);
        allCuriosities = [...allCuriosities, ...curiosities];
    }
    return allCuriosities;
}
