
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameStats } from '@/lib/types';
import { isToday, isYesterday } from 'date-fns';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocFromCache } from 'firebase/firestore';

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

const loadLocalStats = (): GameStats => {
  try {
    const storedStats = localStorage.getItem(LOCAL_GAME_STATS_KEY);
    if (storedStats) {
      return { ...defaultStats, ...JSON.parse(storedStats) };
    }
  } catch (error) {
    console.error("Failed to load local game stats:", error);
  }
  return { ...defaultStats };
};

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
  const [stats, setStats] = useState<GameStats>(() => processDateLogic(loadLocalStats()));
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef(user);

  useEffect(() => {
      userRef.current = user;
  }, [user]);

  // Efeito para sincronização com Firebase. Roda apenas uma vez.
  useEffect(() => {
    // A UI já renderizou com dados locais, agora sincronizamos em segundo plano.
    const unsubscribe = onAuthStateChanged(auth, async (authedUser) => {
        setUser(authedUser);
        const localStats = loadLocalStats();

        if (authedUser) {
            try {
                const docRef = doc(db, 'userStats', authedUser.uid);
                let docSnap;
                try {
                    docSnap = await getDoc(docRef);
                } catch {
                    try {
                        docSnap = await getDocFromCache(docRef);
                    } catch {
                        docSnap = null;
                    }
                }

                const cloudStats = docSnap?.exists() ? docSnap.data() as GameStats : null;

                // Mescla os dados da nuvem com os locais, dando prioridade para a nuvem onde for relevante
                setStats(prev => {
                    const mergedStats: GameStats = {
                        ...defaultStats,
                        ...prev, // Mantém o estado local como base
                        ...(cloudStats || {}), // Sobrescreve com dados da nuvem
                        readCuriosities: [...new Set([...(localStats.readCuriosities || []), ...(cloudStats?.readCuriosities || [])])],
                        quizScores: { ...(localStats.quizScores || {}), ...(cloudStats?.quizScores || {}) },
                        longestStreak: Math.max(localStats.longestStreak || 0, cloudStats?.longestStreak || 0),
                    };
                    mergedStats.totalCuriositiesRead = mergedStats.readCuriosities.length;
                    
                    const finalStats = processDateLogic(mergedStats);
                    
                    // Limpa o local storage após a mesclagem bem-sucedida para evitar dados conflitantes
                    localStorage.removeItem(LOCAL_GAME_STATS_KEY);
                    
                    return finalStats;
                });
            } catch (error) {
                console.error("Firebase sync failed:", error);
                // Em caso de erro na sincronização, já estamos usando os dados locais, então o app continua funcional.
            }
        } else {
             // Se o usuário deslogou, recarregamos os dados locais.
            setStats(processDateLogic(loadLocalStats()));
        }
        // Sinaliza que o carregamento (inicial + sincronização) terminou.
        if (!isLoaded) setIsLoaded(true);
    });

    // Se não houver usuário após um tempo, consideramos carregado.
    const timer = setTimeout(() => {
        if (!isLoaded) setIsLoaded(true);
    }, 1500);

    return () => {
        unsubscribe();
        clearTimeout(timer);
    };
  }, []); // Roda apenas uma vez

  // Efeito para persistência debotada (debounced)
  useEffect(() => {
    // Não salva até que a carga inicial e sincronização estejam completas.
    if (!isLoaded) return;

    const timer = setTimeout(() => {
      try {
        const statsToSave = { ...stats };
        if (userRef.current) {
          const userDocRef = doc(db, 'userStats', userRef.current.uid);
          setDoc(userDocRef, {
            ...statsToSave,
            displayName: userRef.current.displayName || userRef.current.email?.split('@')[0],
            photoURL: userRef.current.photoURL
          }, { merge: true });
        } else {
          localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(statsToSave));
        }
      } catch (error) {
        console.error("Failed to save stats:", error);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [stats, isLoaded]);

  const markCuriosityAsRead = useCallback((curiosityId: string, categoryId: string) => {
    setStats(prev => {
      if (prev.readCuriosities.includes(curiosityId)) return prev;

      const newRead = [...prev.readCuriosities, curiosityId];
      const today = new Date();
      let newStreak = prev.currentStreak;

      const lastPlayed = prev.lastPlayedDate ? new Date(prev.lastPlayedDate) : null;
      if (!lastPlayed || !isToday(lastPlayed)) {
        newStreak = lastPlayed && isYesterday(lastPlayed) ? newStreak + 1 : 1;
      }

      const newLongest = Math.max(prev.longestStreak, newStreak);
      const newTotalRead = newRead.length;
      const combosEarned = Math.floor(newTotalRead / 5) - Math.floor(prev.totalCuriositiesRead / 5);
      const newCombos = prev.combos + combosEarned;

      let explorerStatus: GameStats['explorerStatus'] = 'Iniciante';
      if (newTotalRead >= 50) explorerStatus = 'Expert';
      else if (newTotalRead >= 10) explorerStatus = 'Explorador';

      return {
        ...prev,
        readCuriosities: newRead,
        totalCuriositiesRead: newTotalRead,
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastPlayedDate: today.toISOString(),
        explorerStatus,
        combos: newCombos,
        lastReadCuriosity: { ...(prev.lastReadCuriosity || {}), [categoryId]: curiosityId }
      };
    });
  }, []);

  const addQuizResult = useCallback((categoryId: string, score: number) => {
    setStats(prev => {
      const newScores = { ...prev.quizScores };
      if (!newScores[categoryId]) newScores[categoryId] = [];
      newScores[categoryId].push({ score, date: new Date().toISOString() });
      return { ...prev, quizScores: newScores };
    });
  }, []);

  const updateStats = useCallback((newStats: Partial<GameStats>) => {
    setStats(prev => ({ ...prev, ...newStats }));
  }, []);

  return { stats, isLoaded, markCuriosityAsRead, addQuizResult, user, updateStats };
}
