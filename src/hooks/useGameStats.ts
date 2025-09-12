"use client";

import { useState, useEffect, useCallback } from 'react';
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
};

export function useGameStats() {
  const [stats, setStats] = useState<GameStats>(defaultStats);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const syncStats = useCallback(async (uid: string, localStats: GameStats) => {
    const docRef = doc(db, 'userStats', uid);
    const docSnap = await getDoc(docRef);
    let cloudStats: GameStats | null = null;
  
    if (docSnap.exists()) {
      cloudStats = docSnap.data() as GameStats;
    }
  
    // Merge logic: Local stats are usually more up-to-date.
    // We prioritize local stats but take the longest streak from cloud if it's higher.
    const mergedStats: GameStats = {
      ...defaultStats, // ensure all keys are present
      ...cloudStats,
      ...localStats,
      longestStreak: Math.max(localStats.longestStreak, cloudStats?.longestStreak || 0),
      // Simple merge for quiz scores - could be more sophisticated
      quizScores: {...(cloudStats?.quizScores || {}), ...(localStats.quizScores || {})},
      // Ensure readCuriosities is a merged, unique list
      readCuriosities: [...new Set([...(cloudStats?.readCuriosities || []), ...localStats.readCuriosities])]
    };

    mergedStats.totalCuriositiesRead = mergedStats.readCuriosities.length;
  
    await setDoc(docRef, mergedStats, { merge: true });
    return mergedStats;
  }, []);

  const loadStats = useCallback(async (authedUser: User | null) => {
    setIsLoaded(false);
    try {
      const localStats = loadLocalStats();
      if (authedUser) {
        const finalStats = await syncStats(authedUser.uid, localStats);
        setStats(processDateLogic(finalStats));
        localStorage.removeItem(LOCAL_GAME_STATS_KEY); // Clear local after migrating
      } else {
        setStats(localStats);
      }
    } catch (error) {
      console.error("Failed to load game stats:", error);
      setStats(loadLocalStats()); // Fallback to local
    } finally {
      setIsLoaded(true);
    }
  }, [syncStats]);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authedUser) => {
      setUser(authedUser);
      loadStats(authedUser);
    });
    return () => unsubscribe();
  }, [loadStats]);

  const processDateLogic = (statsToProcess: GameStats): GameStats => {
    const today = new Date();
    const newStats = {...statsToProcess};
    if (newStats.lastPlayedDate) {
      const lastPlayed = new Date(newStats.lastPlayedDate);
      if (!isToday(lastPlayed) && !isYesterday(lastPlayed)) {
        newStats.currentStreak = 0; // Reset streak
      }
    }
    return newStats;
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
    // Initialize first-time players with a streak and last played date
    return { ...defaultStats, currentStreak: 0, lastPlayedDate: null };
  };

  const updateStats = useCallback(async (newStats: Partial<GameStats>) => {
    setStats(prevStats => {
      const updated = { ...prevStats, ...newStats };
      
      // Save stats
      (async () => {
        try {
          if (user) {
            const userRef = doc(db, 'userStats', user.uid);
            // Also save user's display name and photo for the ranking
            const dataToSave = {
              ...updated,
              displayName: user.displayName || user.email?.split('@')[0],
              photoURL: user.photoURL
            };
            await setDoc(userRef, dataToSave, { merge: true });
          } else {
            localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(updated));
          }
        } catch (error) {
          console.error("Failed to save game stats:", error);
        }
      })();

      return updated;
    });
  }, [user]);

  const markCuriosityAsRead = useCallback((curiosityId: string) => {
    if (stats.readCuriosities.includes(curiosityId)) {
      return;
    }
    
    const newReadCuriosities = [...stats.readCuriosities, curiosityId];
    const newTotalRead = newReadCuriosities.length;
    
    const today = new Date();
    let newCurrentStreak = stats.currentStreak;
    let newLastPlayed = stats.lastPlayedDate ? new Date(stats.lastPlayedDate) : null;
    
    if (!newLastPlayed || !isToday(newLastPlayed)) {
       if (newLastPlayed && isYesterday(newLastPlayed)) {
         newCurrentStreak += 1;
       } else {
         newCurrentStreak = 1;
       }
    }

    const newLongestStreak = Math.max(stats.longestStreak, newCurrentStreak);
    
    let newExplorerStatus: GameStats['explorerStatus'] = 'Iniciante';
    if (newTotalRead >= 50) newExplorerStatus = 'Expert';
    else if (newTotalRead >= 10) newExplorerStatus = 'Explorador';

    const newCombos = Math.floor(newTotalRead / 5) - Math.floor(stats.totalCuriositiesRead / 5) + stats.combos;

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

  return { stats, isLoaded, markCuriosityAsRead, addQuizResult, user, updateStats };
}
