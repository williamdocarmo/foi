// src/hooks/useGameStats.ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { GameStats } from "@/lib/types";
import { isToday, isYesterday } from "date-fns";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  getDocFromCache
} from "firebase/firestore";

const LOCAL_GAME_STATS_KEY = "idea-spark-stats";

const defaultStats: GameStats = {
  totalCuriositiesRead: 0,
  readCuriosities: [],
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedDate: null,
  quizScores: {},
  explorerStatus: "Iniciante",
  combos: 0,
  lastReadCuriosity: null,
};

/** Seguro no SSR e tolerante a parsing */
function loadLocalStats(): GameStats {
  if (typeof window === "undefined") return { ...defaultStats };
  try {
    const stored = localStorage.getItem(LOCAL_GAME_STATS_KEY);
    if (!stored) return { ...defaultStats };
    const parsed = JSON.parse(stored);
    return { ...defaultStats, ...parsed };
  } catch {
    return { ...defaultStats };
  }
}

/** Reseta streak se ficou mais que 1 dia sem jogar */
function processDateLogic(statsToProcess: GameStats): GameStats {
  const s = { ...statsToProcess };
  if (s.lastPlayedDate) {
    const last = new Date(s.lastPlayedDate);
    if (!isToday(last) && !isYesterday(last)) s.currentStreak = 0;
  }
  return s;
}

/** Tenta ler do cache primeiro; cai para rede se necessário */
async function getUserStatsWithCache(uid: string) {
  const ref = doc(db, "userStats", uid);
  try {
    const snapCache = await getDocFromCache(ref);
    if (snapCache?.exists()) return snapCache.data();
  } catch (e) {
    // O cache pode falhar se estiver offline e o doc não estiver lá
  }
  // Cai para a rede se o cache falhar ou não existir
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}


export function useGameStats() {
  const [stats, setStats] = useState<GameStats>({ ...defaultStats });
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Refs para salvar debounced sem recriar handlers
  const userRef = useRef<User | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  userRef.current = user;

  /** Salva (debounced ~300ms) no Firestore ou localStorage */
  const scheduleSave = useCallback((toSave: GameStats) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const currentUser = userRef.current;
        if (currentUser) {
          const ref = doc(db, "userStats", currentUser.uid);
          await setDoc(
            ref,
            {
              ...toSave,
              displayName:
                currentUser.displayName ||
                currentUser.email?.split("@")[0] ||
                null,
              photoURL: currentUser.photoURL || null,
            },
            { merge: true }
          );
        } else {
          if (typeof window !== "undefined") {
            localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(toSave));
          }
        }
      } catch {
        // Em falha online, mantenha pelo menos no localStorage
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(toSave));
          } catch {}
        }
      }
    }, 300);
  }, []);

  /** 1) Hidrata instantaneamente com localStorage e libera isLoaded=true */
  useEffect(() => {
    const initial = processDateLogic(loadLocalStats());
    setStats(initial);
    setIsLoaded(true);
  }, []);

  /** 2) Sincroniza com Firebase em segundo plano quando o auth ficar pronto */
  useEffect(() => {
    // roda somente no client
    if (typeof window === "undefined") return;

    const unsubscribe = onAuthStateChanged(auth, async (authedUser) => {
      setUser(authedUser);

      if (!authedUser) {
        // Sem login: garantimos que o estado local está processado
        const local = processDateLogic(loadLocalStats());
        setStats(local);
        // já está isLoaded=true por causa do passo 1
        return;
      }

      try {
        // Lê do cache primeiro; cai para rede se necessário
        const cloud = (await getUserStatsWithCache(authedUser.uid)) as
          | GameStats
          | null;

        // Recarrega local (pode ter mudado durante a sessão)
        const local = loadLocalStats();

        // Merge determinístico
        const merged: GameStats = {
          ...defaultStats,
          ...local,
          ...cloud,
          // campos que precisam de merge não trivial:
          longestStreak: Math.max(
            local.longestStreak,
            cloud?.longestStreak || 0
          ),
          quizScores: {
            ...(cloud?.quizScores || {}),
            ...(local.quizScores || {}),
          },
          readCuriosities: [
            ...new Set([
              ...(local.readCuriosities || []),
              ...(cloud?.readCuriosities || []),
            ]),
          ],
          lastReadCuriosity: {
            ...(cloud?.lastReadCuriosity || {}),
            ...(local.lastReadCuriosity || {}),
          },
        };
        merged.totalCuriositiesRead = merged.readCuriosities.length;

        const finalStats = processDateLogic(merged);
        setStats(finalStats);

        // Limpa o local (virou “fonte” na nuvem)
        try {
          localStorage.removeItem(LOCAL_GAME_STATS_KEY);
        } catch {}

        // Persiste o merge (não bloqueia UI)
        scheduleSave(finalStats);
      } catch {
        // Se falhar a sync, mantenha local
        const fallback = processDateLogic(loadLocalStats());
        setStats(fallback);
      }
    });

    return () => unsubscribe();
  }, [scheduleSave]);

  /** Salva mudanças de stats (debounced) após carregado */
  useEffect(() => {
    if (!isLoaded) return;
    scheduleSave(stats);
  }, [stats, isLoaded, scheduleSave]);

  /** Marca curiosidade como lida, com opção de apenas atualizar “lastRead” */
  const markCuriosityAsRead = useCallback(
    (curiosityId: string, categoryId: string, onlyUpdateLastRead = false) => {
      setStats((prev) => {
        // Atualiza "lastRead" sempre (barato e útil pra navegação)
        const nextLastRead = {
          ...(prev.lastReadCuriosity || {}),
          [categoryId]: curiosityId,
        };

        if (onlyUpdateLastRead) {
          return { ...prev, lastReadCuriosity: nextLastRead };
        }

        // Idempotência de leitura
        if (prev.readCuriosities.includes(curiosityId)) {
          return { ...prev, lastReadCuriosity: nextLastRead };
        }

        // Append sem duplicar
        const newRead = [...prev.readCuriosities, curiosityId];
        const newTotal = newRead.length;

        // Streak
        const now = new Date();
        const last = prev.lastPlayedDate ? new Date(prev.lastPlayedDate) : null;
        const newStreak =
          !last || !isToday(last)
            ? last && isYesterday(last)
              ? prev.currentStreak + 1
              : 1
            : prev.currentStreak;

        const newLongest = Math.max(prev.longestStreak, newStreak);

        // Combos (a cada 5 lidas)
        const combosEarned =
          Math.floor(newTotal / 5) - Math.floor(prev.totalCuriositiesRead / 5);
        const newCombos = prev.combos + Math.max(0, combosEarned);

        // Nível
        let explorerStatus: GameStats["explorerStatus"] = "Iniciante";
        if (newTotal >= 50) explorerStatus = "Expert";
        else if (newTotal >= 10) explorerStatus = "Explorador";

        return {
          ...prev,
          readCuriosities: newRead,
          totalCuriositiesRead: newTotal,
          currentStreak: newStreak,
          longestStreak: newLongest,
          lastPlayedDate: now.toISOString(),
          explorerStatus,
          combos: newCombos,
          lastReadCuriosity: nextLastRead,
        };
      });
    },
    []
  );

  const addQuizResult = useCallback((categoryId: string, score: number) => {
    setStats((prev) => {
      const next = { ...prev.quizScores };
      if (!next[categoryId]) next[categoryId] = [];
      next[categoryId].push({ score, date: new Date().toISOString() });
      return { ...prev, quizScores: next };
    });
  }, []);

  const updateStats = useCallback((newStats: Partial<GameStats>) => {
    setStats((prev) => ({ ...prev, ...newStats }));
  }, []);

  return { stats, isLoaded, markCuriosityAsRead, addQuizResult, user, updateStats };
}
