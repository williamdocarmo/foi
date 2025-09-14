"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameStats } from '@/lib/types';
import { isToday, isYesterday } from 'date-fns';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocFromCache } from 'firebase/firestore';

const LOCAL_GAME_STATS_KEY = 'idea-spark-stats';

// Define o estado inicial padrão, uma única fonte da verdade.
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

// Helper para carregar os dados locais de forma segura.
const loadLocalStats = (): GameStats => {
  try {
    const storedStats = localStorage.getItem(LOCAL_GAME_STATS_KEY);
    if (storedStats) {
      const parsedStats = JSON.parse(storedStats);
      return { ...defaultStats, ...parsedStats };
    }
  } catch (error) {
    console.error("Failed to load local game stats:", error);
  }
  return { ...defaultStats };
};

// Helper para processar a lógica de data e streak. É uma função pura.
const processDateLogic = (statsToProcess: GameStats): GameStats => {
    const newStats = { ...statsToProcess };
    if (newStats.lastPlayedDate) {
        const lastPlayed = new Date(newStats.lastPlayedDate);
        if (!isToday(lastPlayed) && !isYesterday(lastPlayed)) {
            newStats.currentStreak = 0;
        }
    }
    return newStats;
};


export function useGameStats() {
  const [stats, setStats] = useState<GameStats>(defaultStats);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // EFEITO DE INICIALIZAÇÃO E SINCRONIZAÇÃO (RODA APENAS UMA VEZ)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authedUser) => {
        setUser(authedUser);
        const localStats = loadLocalStats();

        if (authedUser) {
            let cloudStats: GameStats | null = null;
            try {
                const docRef = doc(db, 'userStats', authedUser.uid);
                let docSnap;
                try {
                    docSnap = await getDoc(docRef);
                } catch (error) {
                    console.warn("Firestore fetch failed (offline?), trying cache.", error);
                    try {
                        docSnap = await getDocFromCache(docRef);
                    } catch (cacheError) {
                        console.error("Cache fetch failed, using local data as fallback.", cacheError);
                        docSnap = null;
                    }
                }
                
                if (docSnap && docSnap.exists()) {
                    cloudStats = docSnap.data() as GameStats;
                }

                // Mescla os dados, dando prioridade para os mais recentes e unindo listas.
                const mergedStats: GameStats = {
                    ...defaultStats,
                    ...cloudStats,
                    ...localStats,
                    longestStreak: Math.max(localStats.longestStreak, cloudStats?.longestStreak || 0),
                    quizScores: { ...(cloudStats?.quizScores || {}), ...(localStats.quizScores || {}) },
                    readCuriosities: [...new Set([...(localStats.readCuriosities || []), ...(cloudStats?.readCuriosities || [])])],
                };
                mergedStats.totalCuriositiesRead = mergedStats.readCuriosities.length;
                
                const finalStats = processDateLogic(mergedStats);
                setStats(finalStats);

                // Limpa o local storage após a mesclagem bem-sucedida.
                localStorage.removeItem(LOCAL_GAME_STATS_KEY);

            } catch (error) {
                console.error("Failed to sync game stats, using local data as fallback:", error);
                setStats(processDateLogic(localStats));
            }
        } else {
            setStats(processDateLogic(localStats));
        }

        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  // EFEITO DE PERSISTÊNCIA (DEBOUNCED)
  useEffect(() => {
    if (!isLoaded) return;
    
    const timer = setTimeout(() => {
      try {
        if (userRef.current) {
          const userDocRef = doc(db, 'userStats', userRef.current.uid);
          setDoc(userDocRef, {
            ...stats,
            displayName: userRef.current.displayName || userRef.current.email?.split('@')[0],
            photoURL: userRef.current.photoURL
          }, { merge: true });
        } else {
          localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(stats));
        }
      } catch (error) {
        console.error("Failed to save game stats:", error);
      }
    }, 1000); // Atraso de 1s para salvar

    return () => {
      clearTimeout(timer);
    };
  }, [stats, isLoaded]);

  const markCuriosityAsRead = useCallback((curiosityId: string, categoryId: string) => {
    setStats(prevStats => {
      // Condição de guarda: se já leu, não faz nada. Essencial para quebrar loops.
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

      // Retorna o novo estado. A persistência será cuidada pelo useEffect separado.
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
