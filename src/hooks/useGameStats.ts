// src/hooks/useGameStats.ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { GameStats } from "@/lib/types";
import { isToday, isYesterday } from "date-fns";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

const LOCAL_GAME_STATS_KEY = "idea-spark-stats";

/** Normalizador seguro para o mapa de última curiosidade lida */
function asLastReadMap(v: unknown): Record<string, string> {
  if (v && typeof v === "object") return v as Record<string, string>;
  return {};
}

const defaultStats: GameStats = {
  totalCuriositiesRead: 0,
  readCuriosities: [],
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedDate: null,
  quizScores: {},
  explorerStatus: "Iniciante",
  combos: 0,
  // pode vir null do backend; vamos normalizar com asLastReadMap sempre que formos usar
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

/** Tenta cache; cai para rede se necessário (com tipagem tolerante) */
async function getUserStatsWithCache(uid: string) {
  const ref = doc(db, "userStats", uid);

  // Se a sua versão do SDK não tipar "source: 'cache'", comente este bloco.
  try {
    // @ts-expect-error algumas versões não tipam "source"
    const snapCache = await getDoc(ref, { source: "cache" });
    if (snapCache?.exists()) return snapCache.data();
  } catch {
    // ignora e cai para rede
  }

  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export function useGameStats() {
  const [stats, setStats] = useState<GameStats>({ ...defaultStats });
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);

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
        } else if (typeof window !== "undefined") {
          localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(toSave));
        }
      } catch {
        // fallback local
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(LOCAL_GAME_STATS_KEY, JSON.stringify(toSave));
          } catch {}
        }
      }
    }, 300);
  }, []);

  /** 1) Hidrata rápido com localStorage */
  useEffect(() => {
    const initial = processDateLogic(loadLocalStats());
    setStats(initial);
    setIsLoaded(true);
  }, []);

  /** 2) Sincroniza quando o auth estiver pronto */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const unsubscribe = onAuthStateChanged(auth, async (authedUser) => {
      setUser(authedUser);

      if (!authedUser) {
        const local = processDateLogic(loadLocalStats());
        setStats(local);
        return;
      }

      try {
        const cloud = (await getUserStatsWithCache(authedUser.uid)) as GameStats | null;
        const local = loadLocalStats();

        // Merge determinístico
        const merged: GameStats = {
          ...defaultStats,
          ...local,
          ...cloud,
          longestStreak: Math.max(local.longestStreak, cloud?.longestStreak || 0),
          quizScores: { ...(cloud?.quizScores || {}), ...(local.quizScores || {}) },
          readCuriosities: [
            ...new Set([
              ...(local.readCuriosities || []),
              ...(cloud?.readCuriosities || []),
            ]),
          ],
          lastReadCuriosity: {
            ...asLastReadMap(cloud?.lastReadCuriosity),
            ...asLastReadMap(local.lastReadCuriosity),
          } as any,
        };
        merged.totalCuriositiesRead = merged.readCuriosities.length;

        const finalStats = processDateLogic(merged);
        setStats(finalStats);

        try {
          localStorage.removeItem(LOCAL_GAME_STATS_KEY);
        } catch {}

        scheduleSave(finalStats);
      } catch {
        const fallback = processDateLogic(loadLocalStats());
        setStats(fallback);
      }
    });

    return () => unsubscribe();
  }, [scheduleSave]);

  /** 3) Salva mudanças (debounced) */
  useEffect(() => {
    if (!isLoaded) return;
    scheduleSave(stats);
  }, [stats, isLoaded, scheduleSave]);

  /** Helpers de última curiosidade lida */
  const getLastReadCuriosityId = useCallback(
    (categoryId: string): string | null => {
      const map = asLastReadMap(stats.lastReadCuriosity);
      return map[categoryId] ?? null;
    },
    [stats.lastReadCuriosity]
  );

  const setLastReadCuriosity = useCallback(
    (categoryId: string, curiosityId: string) => {
      setStats((prev) => {
        const prevMap = asLastReadMap(prev.lastReadCuriosity);
        return {
          ...prev,
          lastReadCuriosity: { ...prevMap, [categoryId]: curiosityId },
        };
      });
    },
    []
  );

  /** Marca curiosidade como lida (ou só atualiza "lastRead") */
  const markCuriosityAsRead = useCallback(
    (curiosityId: string, categoryId: string, onlyUpdateLastRead = false) => {
      setStats((prev) => {
        const prevMap = asLastReadMap(prev.lastReadCuriosity);
        const nextLastRead = { ...prevMap, [categoryId]: curiosityId };

        if (onlyUpdateLastRead) {
          return { ...prev, lastReadCuriosity: nextLastRead };
        }

        // já lida → só atualiza lastRead
        if (prev.readCuriosities.includes(curiosityId)) {
          return { ...prev, lastReadCuriosity: nextLastRead };
        }

        const newRead = [...prev.readCuriosities, curiosityId];
        const newTotal = newRead.length;

        // streak
        const now = new Date();
        const last = prev.lastPlayedDate ? new Date(prev.lastPlayedDate) : null;
        const newStreak =
          !last || !isToday(last)
            ? last && isYesterday(last)
              ? prev.currentStreak + 1
              : 1
            : prev.currentStreak;

        const newLongest = Math.max(prev.longestStreak, newStreak);

        // combos a cada 5
        const combosEarned =
          Math.floor(newTotal / 5) - Math.floor(prev.totalCuriositiesRead / 5);
        const newCombos = prev.combos + Math.max(0, combosEarned);

        // nível
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

  return {
    stats,
    isLoaded,
    user,
    // leitura/gravação simples do "último visto"
    getLastReadCuriosityId,
    setLastReadCuriosity,
    // APIs existentes
    markCuriosityAsRead,
    addQuizResult,
    updateStats,
  };
}
