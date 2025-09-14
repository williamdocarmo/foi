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
      // Ensure new fields exist on old local storage data
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

  const updateAndSaveStats = useCallback((newStats: Partial<GameStats>, currentUser: User | null) => {
    setStats(prevStats => {
      const updated = { ...prevStats, ...newStats };
      
      // Save stats asynchronously
      (async () => {
        try {
          if (currentUser) {
            const userRef = doc(db, 'userStats', currentUser.uid);
            const dataToSave = {
              ...updated,
              displayName: currentUser.displayName || currentUser.email?.split('@')[0],
              photoURL: currentUser.photoURL
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
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authedUser) => {
      setUser(authedUser);
      setIsLoaded(false);

      try {
        if (authedUser) {
          // User is logged in
          const docRef = doc(db, 'userStats', authedUser.uid);
          const docSnap = await getDoc(docRef);
          
          let cloudStats: GameStats | null = null;
          if (docSnap.exists()) {
            cloudStats = docSnap.data() as GameStats;
          }

          // Merge with local stats, if any
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

          // Save the merged result back to Firestore and clear local storage
          await setDoc(docRef, finalStats, { merge: true });
          localStorage.removeItem(LOCAL_GAME_STATS_KEY);

        } else {
          // User is not logged in, load from local storage
          const localStats = loadLocalStats();
          setStats(localStats);
        }
      } catch (error) {
        console.error("Failed to load/sync game stats:", error);
        // Fallback to local stats in case of any error
        setStats(loadLocalStats());
      } finally {
        setIsLoaded(true);
      }
    });

    return () => unsubscribe();
  }, []);


  const markCuriosityAsRead = useCallback((curiosityId: string, categoryId: string, onlyUpdateLastRead = false) => {
    const newLastRead = { ...(stats.lastReadCuriosity || {}), [categoryId]: curiosityId };

    if (onlyUpdateLastRead) {
        if (stats.lastReadCuriosity?.[categoryId] !== curiosityId) {
            updateAndSaveStats({ lastReadCuriosity: newLastRead }, user);
        }
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

    updateAndSaveStats({
      totalCuriositiesRead: newTotalRead,
      readCuriosities: newReadCuriosities,
      currentStreak: newCurrentStreak,
      longestStreak: newLongestStreak,
      lastPlayedDate: today.toISOString(),
      explorerStatus: newExplorerStatus,
      combos: newCombos,
      lastReadCuriosity: newLastRead,
    }, user);
  }, [stats, updateAndSaveStats, user]);
  
  const addQuizResult = useCallback((categoryId: string, score: number) => {
    const newScores = { ...stats.quizScores };
    if (!newScores[categoryId]) {
        newScores[categoryId] = [];
    }
    newScores[categoryId].push({ score, date: new Date().toISOString() });
    updateAndSaveStats({ quizScores: newScores }, user);
  }, [stats.quizScores, updateAndSaveStats, user]);

  const updateStats = useCallback((newStats: Partial<GameStats>) => {
    updateAndSaveStats(newStats, user);
  }, [updateAndSaveStats, user]);


  return { stats, isLoaded, markCuriosityAsRead, addQuizResult, user, updateStats };
}
    