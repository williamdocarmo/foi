"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameStats } from '@/lib/types';
import { isToday, isYesterday } from 'date-fns';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const LOCAL_GAME_STATS_KEY = 'idea-spark-stats';

const defaultStats: GameStats = {
  totalCuriositiesRead: 0,
  readCuriosities: [],
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedDate: null,
  quizScores: {},
  explorerStatus: 'Iniciante',
  combos: 0,
  lastReadCuriosity: null,
};

// Helper para processar a lógica de data e streak.
const processDateLogic = (statsToProcess: GameStats): GameStats => {
  const newStats = { ...statsToProcess };
  if (newStats.lastPlayedDate) {
    const lastPlayed = new Date(newStats.lastPlayedDate);
    // Se o último jogo não foi hoje nem ontem, reseta a sequência.
    if (!isToday(lastPlayed) && !isYesterday(lastPlayed)) {
      newStats.currentStreak = 0;
    }
  }
  return newStats;
};

// Helper para carregar os dados locais de forma segura.
const loadLocalStats = (): GameStats => {
  try {
    const storedStats = localStorage.getItem(LOCAL_GAME_STATS_KEY);
    if (storedStats) {
      const parsedStats = JSON.parse(storedStats);
      return processDateLogic({ ...defaultStats, ...parsedStats });
    }
  } catch (error) {
    console.error("Failed to load local game stats:", error);
  }
  return { ...defaultStats };
};


export function useGameStats() {
  const [stats, setStats] = useState<GameStats>(defaultStats);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Ref para o usuário para evitar dependências instáveis em callbacks.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Ref para o timer de debounce para salvar os dados.
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Efeito principal para lidar com autenticação e carregamento de dados.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authedUser) => {
      setUser(authedUser);
      setIsLoaded(false);

      try {
        if (authedUser) {
          // Usuário logado: busca dados do Firestore e mescla com os locais.
          const docRef = doc(db, 'userStats', authedUser.uid);
          const docSnap = await getDoc(docRef);
          
          let cloudStats: GameStats | null = null;
          if (docSnap.exists()) {
            cloudStats = docSnap.data() as GameStats;
          }

          const localStats = loadLocalStats();
          
          // Mescla os dados, dando prioridade para os mais recentes e unindo listas.
          const mergedStats: GameStats = {
            ...defaultStats,
            ...cloudStats,
            ...localStats,
            longestStreak: Math.max(localStats.longestStreak, cloudStats?.longestStreak || 0),
            quizScores: { ...(cloudStats?.quizScores || {}), ...(localStats.quizScores || {}) },
            readCuriosities: [...new Set([...(localStats.readCuriosities || []), ...(cloudStats?.readCuriosities || [])])],
            lastReadCuriosity: { ...(cloudStats?.lastReadCuriosity || {}), ...(localStats.lastReadCuriosity || {}) },
          };
          mergedStats.totalCuriositiesRead = mergedStats.readCuriosities.length;
          
          const finalStats = processDateLogic(mergedStats);
          setStats(finalStats);

          // Salva os dados mesclados de volta no Firestore e limpa o local storage.
          await setDoc(docRef, { 
            ...finalStats,
            displayName: authedUser.displayName || authedUser.email?.split('@')[0],
            photoURL: authedUser.photoURL
          }, { merge: true });
          localStorage.removeItem(LOCAL_GAME_STATS_KEY);

        } else {
          // Usuário deslogado: carrega apenas os dados locais.
          const localStats = loadLocalStats();
          setStats(localStats);
        }
      } catch (error) {
        console.error("Failed to load/sync game stats:", error);
        // Em caso de erro, recai para os dados locais como segurança.
        setStats(loadLocalStats());
      } finally {
        setIsLoaded(true);
      }
    });

    return () => unsubscribe();
  }, []); // Roda apenas uma vez.

  // EFEITO DE PERSISTÊNCIA (DEBOUNCED)
  // Este é o coração da nova arquitetura. Ele observa o estado `stats` e o salva automaticamente.
  useEffect(() => {
    // Só salva se os dados já estiverem carregados para evitar escritas prematuras.
    if (!isLoaded) return;
    
    // Se já existe um timer, cancela para agendar um novo.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Agenda o salvamento para daqui a 500ms.
    debounceTimerRef.current = setTimeout(() => {
      const dataToSave = stats;
      try {
        if (userRef.current) {
          const userDocRef = doc(db, 'userStats', userRef.current.uid);
          setDoc(userDocRef, dataToSave, { merge: true });
        } else {
          localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(dataToSave));
        }
      } catch (error) {
        console.error("Failed to save game stats:", error);
      }
    }, 500);

    // Limpeza: cancela o timer se o componente for desmontado.
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [stats, isLoaded]); // Este efeito depende de `stats` e `isLoaded`.

  // FUNÇÕES DE ATUALIZAÇÃO DE ESTADO (SIMPLIFICADAS)
  // Elas apenas chamam `setStats`. A persistência é tratada pelo useEffect acima.

  const markCuriosityAsRead = useCallback((curiosityId: string, categoryId: string) => {
    setStats(prevStats => {
      // Condição de guarda para evitar atualizações desnecessárias.
      if (prevStats.readCuriosities.includes(curiosityId)) {
        return prevStats;
      }

      const newReadCuriosities = [...prevStats.readCuriosities, curiosityId];
      const newTotalRead = newReadCuriosities.length;
      const today = new Date();
      
      let newCurrentStreak = prevStats.currentStreak;
      const lastPlayed = prevStats.lastPlayedDate ? new Date(prevStats.lastPlayedDate) : null;
      
      if (!lastPlayed || !isToday(lastPlayed)) {
        if (lastPlayed && isYesterday(lastPlayed)) {
          newCurrentStreak += 1;
        } else {
          newCurrentStreak = 1;
        }
      }

      const newLongestStreak = Math.max(prevStats.longestStreak, newCurrentStreak);
      
      let newExplorerStatus: GameStats['explorerStatus'] = 'Iniciante';
      if (newTotalRead >= 50) newExplorerStatus = 'Expert';
      else if (newTotalRead >= 10) newExplorerStatus = 'Explorador';

      const combosEarned = Math.floor(newTotalRead / 5) - Math.floor(prevStats.totalCuriositiesRead / 5);
      const newCombos = prevStats.combos + combosEarned;

      return {
          ...prevStats,
          totalCuriositiesRead: newTotalRead,
          readCuriosities: newReadCuriosities,
          currentStreak: newCurrentStreak,
          longestStreak: newLongestStreak,
          lastPlayedDate: today.toISOString(),
          explorerStatus: newExplorerStatus,
          combos: newCombos,
          lastReadCuriosity: { ...(prevStats.lastReadCuriosity || {}), [categoryId]: curiosityId },
      };
    });
  }, []);
  
  const addQuizResult = useCallback((categoryId: string, score: number) => {
    setStats(prevStats => {
      const newScores = { ...prevStats.quizScores };
      if (!newScores[categoryId]) {
          newScores[categoryId] = [];
      }
      newScores[categoryId].push({ score, date: new Date().toISOString() });
      return { ...prevStats, quizScores: newScores };
    });
  }, []);

  const updateStats = useCallback((newStats: Partial<GameStats>) => {
    setStats(prevStats => ({ ...prevStats, ...newStats }));
  }, []);

  return { stats, isLoaded, markCuriosityAsRead, addQuizResult, user, updateStats };
}
