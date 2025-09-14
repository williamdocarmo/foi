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
  // Guard clause para rodar apenas no client-side
  if (typeof window === 'undefined') {
    return defaultStats;
  }
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
  const [stats, setStats] = useState<GameStats>(defaultStats);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Efeito principal para carregar dados e sincronizar. Roda apenas no cliente.
  useEffect(() => {
    const initialLocalStats = loadLocalStats();
    setStats(processDateLogic(initialLocalStats));

    const unsubscribe = onAuthStateChanged(auth, async (authedUser) => {
      setUser(authedUser);
      const localStats = loadLocalStats(); // Recarregar caso tenha mudado

      if (authedUser) {
        let cloudStats: GameStats | null = null;
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

          if (docSnap?.exists()) {
            cloudStats = docSnap.data() as GameStats;
          }
          
          const mergedStats: GameStats = {
            ...defaultStats,
            ...localStats,
            ...cloudStats,
            longestStreak: Math.max(localStats.longestStreak, cloudStats?.longestStreak || 0),
            quizScores: { ...(cloudStats?.quizScores || {}), ...(localStats.quizScores || {}) },
            readCuriosities: [...new Set([...(localStats.readCuriosities || []), ...(cloudStats?.readCuriosities || [])])],
          };
          mergedStats.totalCuriositiesRead = mergedStats.readCuriosities.length;

          const finalStats = processDateLogic(mergedStats);
          setStats(finalStats);
          localStorage.removeItem(LOCAL_GAME_STATS_KEY);
        } catch (error) {
          console.error("Failed to sync stats, using local fallback:", error);
          setStats(processDateLogic(localStats));
        }
      } else {
        // Se não houver usuário, apenas garanta que o estado local está processado
        setStats(processDateLogic(localStats));
      }

      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []); // Array vazio garante que o efeito rode apenas uma vez no cliente.

  // Persistência (debounced)
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