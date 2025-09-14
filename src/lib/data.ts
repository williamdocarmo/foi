// src/lib/data.ts
import type { Category, Curiosity, QuizQuestion } from './types';
import categoriesData from './data/categories.json';

// --- Abordagem Otimizada com Importações Estáticas ---
// Em vez de usar 'fs' para ler o sistema de arquivos em tempo de execução,
// importamos os arquivos JSON diretamente. Isso garante que o Next.js e a Vercel
// incluam esses arquivos no bundle de produção, evitando erros de "arquivo não encontrado".

import autoajudaCuriosities from '../../data/curiosities/autoajuda.json';
import bemEstarCuriosities from '../../data/curiosities/bem-estar.json';
import cienciaCuriosities from '../../data/curiosities/ciencia.json';
import culturaCuriosities from '../../data/curiosities/cultura.json';
import dinheiroCuriosities from '../../data/curiosities/dinheiro.json';
import entretenimentoCuriosities from '../../data/curiosities/entretenimento.json';
import futuroCuriosities from '../../data/curiosities/futuro.json';
import hacksCuriosities from '../../data/curiosities/hacks.json';
import habilidadesCuriosities from '../../data/curiosities/habilidades.json';
import historiaCuriosities from '../../data/curiosities/historia.json';
import lugaresCuriosities from '../../data/curiosities/lugares.json';
import misteriosCuriosities from '../../data/curiosities/misterios.json';
import musicaCuriosities from '../../data/curiosities/musica.json';
import naturezaEAnimaisCuriosities from '../../data/curiosities/natureza-e-animais.json';
import psicologiaCuriosities from '../../data/curiosities/psicologia.json';
import relacionamentosCuriosities from '../../data/curiosities/relacionamentos.json';
import religiaoCuriosities from '../../data/curiosities/religiao.json';
import saudeCuriosities from '../../data/curiosities/saude.json';
import tecnologiaCuriosities from '../../data/curiosities/tecnologia.json';
import universoEAstronomiaCuriosities from '../../data/curiosities/universo-e-astronomia.json';
import viagensCuriosities from '../../data/curiosities/viagens.json';
import inglesCuriosities from '../../data/curiosities/ingles.json';

import autoajudaQuizzes from '../../data/quiz-questions/autoajuda.json';
import bemEstarQuizzes from '../../data/quiz-questions/bem-estar.json';
import cienciaQuizzes from '../../data/quiz-questions/ciencia.json';
import culturaQuizzes from '../../data/quiz-questions/cultura.json';
import dinheiroQuizzes from '../../data/quiz-questions/dinheiro.json';
import entretenimentoQuizzes from '../../data/quiz-questions/entretenimento.json';
import futuroQuizzes from '../../data/quiz-questions/futuro.json';
import hacksQuizzes from '../../data/quiz-questions/hacks.json';
import habilidadesQuizzes from '../../data/quiz-questions/habilidades.json';
import historiaQuizzes from '../../data/quiz-questions/historia.json';
import lugaresQuizzes from '../../data/quiz-questions/lugares.json';
import misteriosQuizzes from '../../data/quiz-questions/misterios.json';
import musicaQuizzes from '../../data/quiz-questions/musica.json';
import naturezaEAnimaisQuizzes from '../../data/quiz-questions/natureza-e-animais.json';
import psicologiaQuizzes from '../../data/quiz-questions/psicologia.json';
import relacionamentosQuizzes from '../../data/quiz-questions/relacionamentos.json';
import religiaoQuizzes from '../../data/quiz-questions/religiao.json';
import saudeQuizzes from '../../data/quiz-questions/saude.json';
import tecnologiaQuizzes from '../../data/quiz-questions/tecnologia.json';
import universoEAstronomiaQuizzes from '../../data/quiz-questions/universo-e-astronomia.json';
import viagensQuizzes from '../../data/quiz-questions/viagens.json';
import inglesQuizzes from '../../data/quiz-questions/ingles.json';

// Carrega todos os dados uma vez.
const allCuriosities: Curiosity[] = [
    ...autoajudaCuriosities,
    ...bemEstarCuriosities,
    ...cienciaCuriosities,
    ...culturaCuriosities,
    ...dinheiroCuriosities,
    ...entretenimentoCuriosities,
    ...futuroCuriosities,
    ...hacksCuriosities,
    ...habilidadesCuriosities,
    ...historiaCuriosities,
    ...lugaresCuriosities,
    ...misteriosCuriosities,
    ...musicaCuriosities,
    ...naturezaEAnimaisCuriosities,
    ...psicologiaCuriosities,
    ...relacionamentosCuriosities,
    ...religiaoCuriosities,
    ...saudeCuriosities,
    ...tecnologiaCuriosities,
    ...universoEAstronomiaCuriosities,
    ...viagensCuriosities,
    ...inglesCuriosities
].flat();

const allQuizQuestions: QuizQuestion[] = [
    ...autoajudaQuizzes,
    ...bemEstarQuizzes,
    ...cienciaQuizzes,
    ...culturaQuizzes,
    ...dinheiroQuizzes,
    ...entretenimentoQuizzes,
    ...futuroQuizzes,
    ...hacksQuizzes,
    ...habilidadesQuizzes,
    ...historiaQuizzes,
    ...lugaresQuizzes,
    ...misteriosQuizzes,
    ...musicaQuizzes,
    ...naturezaEAnimaisQuizzes,
    ...psicologiaQuizzes,
    ...relacionamentosQuizzes,
    ...religiaoQuizzes,
    ...saudeQuizzes,
    ...tecnologiaQuizzes,
    ...universoEAstronomiaQuizzes,
    ...viagensQuizzes,
    ...inglesQuizzes
].flat();


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
