import type { LucideIcon } from "lucide-react";

export type Category = {
  id: string;
  name: string;
  icon: keyof typeof import('lucide-react');
  emoji: string;
  description: string;
  color: string;
};

export type Curiosity = {
  id: string;
  categoryId: string;
  title: string;
  content: string;
  funFact?: string;
  isNew?: boolean;
};

export type QuizQuestion = {
  id: 'easy' | 'medium' | 'hard';
  categoryId: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export type GameStats = {
  totalCuriositiesRead: number;
  readCuriosities: string[];
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
  quizScores: { [categoryId: string]: { score: number; date: string }[] };
  explorerStatus: 'Iniciante' | 'Explorador' | 'Expert';
  combos: number;
  lastReadCuriosity: { [categoryId: string]: string } | null;
};
