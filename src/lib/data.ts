
import type { Category, Curiosity, QuizQuestion } from './types';
import categoriesData from './data/categories.json';
import fs from 'fs/promises';
import path from 'path';

export const categories: Category[] = categoriesData;

// Helper functions now dynamically import data based on category ID
export const getCategoryById = (id: string) => categories.find(c => c.id === id);

// Use a simple cache to avoid re-reading files from disk on every request in development
const dataCache = new Map<string, any>();

async function readJsonFile<T>(filePath: string): Promise<T[]> {
  if (process.env.NODE_ENV === 'development' && dataCache.has(filePath)) {
    return dataCache.get(filePath) as T[];
  }

  try {
    const fullPath = path.join(process.cwd(), filePath);
    const fileContent = await fs.readFile(fullPath, 'utf-8');
    const data = JSON.parse(fileContent);
    
    if (process.env.NODE_ENV === 'development') {
      dataCache.set(filePath, data);
    }
    
    return data;
  } catch (error) {
    // console.error(`Error reading file ${filePath}:`, error);
    return []; // Return empty array if file doesn't exist or is invalid
  }
}

export async function getCuriositiesByCategoryId(categoryId: string): Promise<Curiosity[]> {
  const curiosities = await readJsonFile<Curiosity>(`data/curiosities-${categoryId}.json`);
  return curiosities;
}

export async function getQuizQuestionsByCategoryId(categoryId: string): Promise<QuizQuestion[]> {
  const questions = await readJsonFile<QuizQuestion>(`data/quiz-questions-${categoryId}.json`);
  return questions;
}

export async function getAllCuriosities(): Promise<Curiosity[]> {
    let allCuriosities: Curiosity[] = [];
    for (const category of categories) {
        const curiosities = await getCuriositiesByCategoryId(category.id);
        allCuriosities = [...allCuriosities, ...curiosities];
    }
    return allCuriosities;
}
