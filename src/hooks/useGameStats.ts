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
  
  const userRef = useRef(user);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mantém a ref do usuário sempre atualizada sem causar re-renderizações desnecessárias
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Efeito para persistir as alterações de estado de forma debotada (com atraso)
  useEffect(() => {
    // Não faz nada se os dados ainda não foram carregados
    if (!isLoaded) return;
    
    // Função para salvar os dados
    const flushSave = async (dataToSave: GameStats) => {
      try {
        if (userRef.current) {
          const userDocRef = doc(db, 'userStats', userRef.current.uid);
          await setDoc(userDocRef, dataToSave, { merge: true });
        } else {
          localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(dataToSave));
        }
      } catch (error) {
        console.error("Failed to save game stats:", error);
        // Fallback para localStorage se o save na nuvem falhar
        if (!userRef.current) {
          localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(dataToSave));
        }
      }
    };
    
    // Se já houver um timer de salvamento, cancela
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Agenda um novo salvamento para daqui a 500ms
    debounceTimerRef.current = setTimeout(() => {
      flushSave(stats);
    }, 500);

    // Função de limpeza para cancelar o timer se o componente for desmontado
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [stats, isLoaded]); // Este efeito roda sempre que `stats` ou `isLoaded` mudam


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


  const markCuriosityAsRead = useCallback((curiosityId: string, categoryId: string) => {
    setStats(prevStats => {
      // Se a curiosidade já foi lida, apenas retorna o estado anterior sem modificações.
      if (prevStats.readCuriosities.includes(curiosityId)) {
        return prevStats;
      }

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
    
    