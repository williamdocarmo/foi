"use client";

import { useState, useEffect, useCallback } from 'react';
import { GameStats } from '@/lib/types';
import { isToday, isYesterday } from 'date-fns';

const GAME_STATS_KEY = 'idea-spark-stats';

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

  useEffect(() => {
    try {
      const storedStats = localStorage.getItem(GAME_STATS_KEY);
      if (storedStats) {
        const parsedStats: GameStats = JSON.parse(storedStats);

        // Date-based logic (streaks)
        const today = new Date();
        if (parsedStats.lastPlayedDate) {
          const lastPlayed = new Date(parsedStats.lastPlayedDate);
          if (!isToday(lastPlayed) && !isYesterday(lastPlayed)) {
            parsedStats.currentStreak = 0; // Reset streak if not played yesterday or today
          }
        }
        
        setStats(parsedStats);
      } else {
        // First time playing, set streak to 1 and last played to today
        const newStats = { ...defaultStats, currentStreak: 1, lastPlayedDate: new Date().toISOString() };
        setStats(newStats);
        localStorage.setItem(GAME_STATS_KEY, JSON.stringify(newStats));
      }
    } catch (error) {
      console.error("Failed to load game stats:", error);
      setStats(defaultStats);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const updateStats = useCallback((newStats: Partial<GameStats>) => {
    setStats(prevStats => {
      const updated = { ...prevStats, ...newStats };
      try {
        localStorage.setItem(GAME_STATS_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to save game stats:", error);
      }
      return updated;
    });
  }, []);

  const markCuriosityAsRead = useCallback((curiosityId: string) => {
    if (stats.readCuriosities.includes(curiosityId)) {
      return; // Already read
    }

    const newReadCuriosities = [...stats.readCuriosities, curiosityId];
    const newTotalRead = newReadCuriosities.length;

    // Streaks
    const today = new Date();
    let newCurrentStreak = stats.currentStreak;
    if (!stats.lastPlayedDate || !isToday(new Date(stats.lastPlayedDate))) {
        if (stats.lastPlayedDate && isYesterday(new Date(stats.lastPlayedDate))) {
            newCurrentStreak += 1; // Continue streak
        } else {
            newCurrentStreak = 1; // New or broken streak
        }
    }
    
    const newLongestStreak = Math.max(stats.longestStreak, newCurrentStreak);
    
    // Explorer Status
    let newExplorerStatus: GameStats['explorerStatus'] = 'Iniciante';
    if (newTotalRead > 50) newExplorerStatus = 'Expert';
    else if (newTotalRead > 10) newExplorerStatus = 'Explorador';

    // Combos
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


  return { stats, markCuriosityAsRead, addQuizResult, isLoaded };
}
