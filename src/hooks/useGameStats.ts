"use client";

import { useState, useEffect, useCallback } from 'react';
import { GameStats } from '@/lib/types';
import { isToday, isYesterday } from 'date-fns';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
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
};

export function useGameStats() {
  const [stats, setStats] = useState<GameStats>(defaultStats);
  const [isLoaded, setIsLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const loadStats = useCallback(async (uid: string | null) => {
    try {
      if (uid) {
        // User is logged in, load from Firestore
        const docRef = doc(db, 'userStats', uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const cloudStats = docSnap.data() as GameStats;
          setStats(processDateLogic(cloudStats));
        } else {
          // No stats in Firestore, check local storage and migrate
          const localStats = loadLocalStats();
          const migratedStats = { ...localStats, currentStreak: 1, lastPlayedDate: new Date().toISOString() };
          setStats(migratedStats);
          await setDoc(docRef, migratedStats);
        }
      } else {
        // User is not logged in, load from local storage
        setStats(loadLocalStats());
      }
    } catch (error) {
      console.error("Failed to load game stats:", error);
      setStats(loadLocalStats());
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const newUserId = user ? user.uid : null;
      setUserId(newUserId);
      loadStats(newUserId);
    });
    return () => unsubscribe();
  }, [loadStats]);

  const processDateLogic = (statsToProcess: GameStats): GameStats => {
    const today = new Date();
    if (statsToProcess.lastPlayedDate) {
      const lastPlayed = new Date(statsToProcess.lastPlayedDate);
      if (!isToday(lastPlayed) && !isYesterday(lastPlayed)) {
        statsToProcess.currentStreak = 0; // Reset streak
      }
    }
    return statsToProcess;
  };

  const loadLocalStats = (): GameStats => {
    try {
      const storedStats = localStorage.getItem(LOCAL_GAME_STATS_KEY);
      if (storedStats) {
        return processDateLogic(JSON.parse(storedStats));
      }
    } catch (error) {
      console.error("Failed to load local game stats:", error);
    }
    return { ...defaultStats, currentStreak: 1, lastPlayedDate: new Date().toISOString() };
  };

  const updateStats = useCallback(async (newStats: Partial<GameStats>) => {
    const updated = { ...stats, ...newStats };
    setStats(updated);

    try {
      if (userId) {
        await setDoc(doc(db, 'userStats', userId), updated, { merge: true });
      } else {
        localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(updated));
      }
    } catch (error) {
      console.error("Failed to save game stats:", error);
    }
  }, [stats, userId]);

  const markCuriosityAsRead = useCallback((curiosityId: string) => {
    if (stats.readCuriosities.includes(curiosityId)) {
      return;
    }
    
    const newReadCuriosities = [...stats.readCuriosities, curiosityId];
    const newTotalRead = newReadCuriosities.length;
    
    const today = new Date();
    let newCurrentStreak = stats.currentStreak;
    if (!stats.lastPlayedDate || !isToday(new Date(stats.lastPlayedDate))) {
      if (stats.lastPlayedDate && isYesterday(new Date(stats.lastPlayedDate))) {
        newCurrentStreak += 1;
      } else {
        newCurrentStreak = 1;
      }
    }

    const newLongestStreak = Math.max(stats.longestStreak, newCurrentStreak);
    
    let newExplorerStatus: GameStats['explorerStatus'] = 'Iniciante';
    if (newTotalRead > 50) newExplorerStatus = 'Expert';
    else if (newTotalRead > 10) newExplorerStatus = 'Explorador';

    const newCombos = Math.floor(newTotalRead / 5);

    updateStats({
      totalCuriositiesRead: newTotalRead,
      readCuriosities: newReadCuriosities,
      currentStreak: newCurrentStreak,
      longestStreak: newLongestStreak,
      lastPlayedDate: today.toISOString(),
      explorerStatus: newExplorerStatus,
      combos: newCombos
    });
  }, [stats, updateStats]);
  
  const addQuizResult = useCallback((categoryId: string, score: number) => {
    const newScores = { ...stats.quizScores };
    if (!newScores[categoryId]) {
        newScores[categoryId] = [];
    }
    newScores[categoryId].push({ score, date: new Date().toISOString() });
    updateStats({ quizScores: newScores });
  }, [stats.quizScores, updateStats]);

  return { stats, isLoaded, markCuriosityAsRead, addQuizResult, user: auth.currentUser };
}
