"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { GameStats } from '@/lib/types';
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

const processDateLogic = (statsToProcess: GameStats): GameStats => {
  const today = new Date();
  const newStats = {...statsToProcess};
  if (newStats.lastPlayedDate) {
    const lastPlayed = new Date(newStats.lastPlayedDate);
    if (!isToday(lastPlayed) && !isYesterday(lastPlayed)) {
      newStats.currentStreak = 0; // Reset streak if played more than a day ago
    }
  }
  return newStats;
};

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

  // Refs para o debounce
  const pendingStatsRef = useRef<GameStats | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Função para salvar os dados (chamada pelo debounce)
  const flushSave = useCallback(async (currentUser: User | null, dataToSave: GameStats) => {
    try {
      if (currentUser) {
        const userRef = doc(db, 'userStats', currentUser.uid);
        await setDoc(userRef, dataToSave, { merge: true });
      } else {
        localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(dataToSave));
      }
    } catch (error) {
      console.error("Failed to save game stats:", error);
      // Fallback para localStorage se o Firestore falhar (ex: offline sem persistência)
      if (!currentUser) {
        localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(dataToSave));
      }
    }
  }, []);

  // Função otimizada com debounce
  const updateAndSaveStats = useCallback((newStats: Partial<GameStats>, currentUser: User | null) => {
    setStats(prevStats => {
      const updated = { ...prevStats, ...newStats };
      pendingStatsRef.current = updated;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        if (pendingStatsRef.current) {
          flushSave(currentUser, pendingStatsRef.current);
        }
      }, 400); // Atraso de 400ms para agrupar gravações

      return updated;
    });
  }, [flushSave]);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authedUser) => {
      setUser(authedUser);
      setIsLoaded(false);

      try {
        if (authedUser) {
          const docRef = doc(db, 'userStats', authedUser.uid);
          let docSnap = await getDoc(docRef, { source: 'cache' }).catch(() => null);
          
          if (!docSnap || !docSnap.exists()) {
            docSnap = await getDoc(docRef);
          }
          
          let cloudStats: GameStats | null = null;
          if (docSnap.exists()) {
            cloudStats = docSnap.data() as GameStats;
          }

          const localStats = loadLocalStats();
          
          const mergedStats: GameStats = {
            ...defaultStats,
            ...cloudStats,
            ...localStats,
            longestStreak: Math.max(localStats.longestStreak, cloudStats?.longestStreak || 0),
            quizScores: {...(cloudStats?.quizScores || {}), ...(localStats.quizScores || {})},
            readCuriosities: [...new Set([...(cloudStats?.readCuriosities || []), ...localStats.readCuriosities])],
            lastReadCuriosity: { ...(cloudStats?.lastReadCuriosity || {}), ...(localStats.lastReadCuriosity || {}) },
          };
          mergedStats.totalCuriositiesRead = mergedStats.readCuriosities.length;
          
          const finalStats = processDateLogic(mergedStats);
          setStats(finalStats);

          await setDoc(docRef, { 
            ...finalStats,
            displayName: authedUser.displayName || authedUser.email?.split('@')[0],
            photoURL: authedUser.photoURL
          }, { merge: true });
          localStorage.removeItem(LOCAL_GAME_STATS_KEY);

        } else {
          const localStats = loadLocalStats();
          setStats(localStats);
        }
      } catch (error) {
        console.error("Failed to load/sync game stats:", error);
        setStats(loadLocalStats());
      } finally {
        setIsLoaded(true);
      }
    });

    return () => unsubscribe();
  }, []);


  const markCuriosityAsRead = useCallback((curiosityId: string, categoryId: string, onlyUpdateLastRead = false) => {
    setStats(prevStats => {
        const newLastRead = { ...(prevStats.lastReadCuriosity || {}), [categoryId]: curiosityId };
        
        if (onlyUpdateLastRead) {
            // Apenas atualiza a última lida, sem recalcular streak etc.
            const updatedStats = { ...prevStats, lastReadCuriosity: newLastRead };
            if (prevStats.lastReadCuriosity?.[categoryId] !== curiosityId) {
                updateAndSaveStats(updatedStats, user);
            }
            return updatedStats;
        }

        const isAlreadyRead = prevStats.readCuriosities.includes(curiosityId);
        if (isAlreadyRead) {
             // Se já foi lida, apenas atualiza a última lida e retorna o estado atual.
             const updatedStats = { ...prevStats, lastReadCuriosity: newLastRead };
             if (prevStats.lastReadCuriosity?.[categoryId] !== curiosityId) {
                 updateAndSaveStats(updatedStats, user);
             }
             return updatedStats;
        }

        // Se não foi lida, prossiga com todos os cálculos.
        const newReadCuriosities = [...prevStats.readCuriosities, curiosityId];
        const newTotalRead = newReadCuriosities.length;
        const today = new Date();
        
        let newCurrentStreak = prevStats.currentStreak;
        let newLastPlayed = prevStats.lastPlayedDate ? new Date(prevStats.lastPlayedDate) : null;
        
        if (!newLastPlayed || !isToday(newLastPlayed)) {
            if (newLastPlayed && isYesterday(newLastPlayed)) {
                newCurrentStreak += 1;
            } else {
                newCurrentStreak = 1;
            }
        }

        const newLongestStreak = Math.max(prevStats.longestStreak, newCurrentStreak);
        
        let newExplorerStatus: GameStats['explorerStatus'] = 'Iniciante';
        if (newTotalRead >= 50) newExplorerStatus = 'Expert';
        else if (newTotalRead >= 10) newExplorerStatus = 'Explorador';

        const newCombos = Math.floor(newTotalRead / 5) - Math.floor(prevStats.totalCuriositiesRead / 5) + prevStats.combos;

        const finalUpdatedStats = {
            ...prevStats,
            totalCuriositiesRead: newTotalRead,
            readCuriosities: newReadCuriosities,
            currentStreak: newCurrentStreak,
            longestStreak: newLongestStreak,
            lastPlayedDate: today.toISOString(),
            explorerStatus: newExplorerStatus,
            combos: newCombos,
            lastReadCuriosity: newLastRead,
        };

        updateAndSaveStats(finalUpdatedStats, user);
        return finalUpdatedStats;
    });
  }, [updateAndSaveStats, user]);
  
  const addQuizResult = useCallback((categoryId: string, score: number) => {
    setStats(prevStats => {
      const newScores = { ...prevStats.quizScores };
      if (!newScores[categoryId]) {
          newScores[categoryId] = [];
      }
      newScores[categoryId].push({ score, date: new Date().toISOString() });
      const updatedStats = { ...prevStats, quizScores: newScores };
      updateAndSaveStats(updatedStats, user);
      return updatedStats;
    });
  }, [updateAndSaveStats, user]);

  const updateStats = useCallback((newStats: Partial<GameStats>) => {
    updateAndSaveStats(newStats, user);
  }, [updateAndSaveStats, user]);


  return { stats, isLoaded, markCuriosityAsRead, addQuizResult, user, updateStats };
}
    