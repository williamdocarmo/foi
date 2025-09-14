"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Category, Curiosity } from "@/lib/types";
import { useGameStats } from "@/hooks/useGameStats";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Rocket, Sparkles, Trophy, Star, TrendingUp, Home, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Skeleton } from "../ui/skeleton";
import { categories, curiositiesByCategory } from "@/lib/data";

type CuriosityExplorerProps = {
  category: Category;
  curiosities: Curiosity[];
};

const explorerIcons: Record<string, JSX.Element> = {
  'Iniciante': <Star className="mr-2 h-5 w-5 text-yellow-400" />,
  'Explorador': <TrendingUp className="mr-2 h-5 w-5 text-green-500" />,
  'Expert': <Trophy className="mr-2 h-5 w-5 text-amber-500" />,
};

export default function CuriosityExplorer({ category, curiosities }: CuriosityExplorerProps) {
  const router = useRouter();
  const { stats, markCuriosityAsRead, isLoaded } = useGameStats();
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  // IDs de todas curiosidades, memoizado
  const allCuriosityIds = useMemo(() => 
    categories.flatMap(cat =>
      (curiositiesByCategory[cat.id] || []).map(c => ({ id: c.id, categoryId: c.categoryId }))
    )
  , []);

  // Inicializa o índice com a primeira curiosidade não lida
  useEffect(() => {
    if (!isLoaded || currentIndex !== null) return;
    const firstUnread = curiosities.findIndex(c => !stats.readCuriosities.includes(c.id));
    setCurrentIndex(firstUnread !== -1 ? firstUnread : 0);
  }, [isLoaded, curiosities, stats.readCuriosities, currentIndex]);

  // Marca curiosidade atual como lida
  const currentCuriosity = useMemo(() => {
    if (currentIndex === null) return null;
    return curiosities[currentIndex] || null;
  }, [currentIndex, curiosities]);

  useEffect(() => {
    if (!isLoaded || !currentCuriosity) return;
    if (!stats.readCuriosities.includes(currentCuriosity.id)) {
      markCuriosityAsRead(currentCuriosity.id, currentCuriosity.categoryId);
    }
  }, [isLoaded, currentCuriosity, markCuriosityAsRead, stats.readCuriosities]);

  // Navegação
  const handleNext = useCallback(() => {
    if (currentIndex === null || currentIndex >= curiosities.length - 1) return;
    setCurrentIndex(prev => (prev !== null ? prev + 1 : prev));
  }, [currentIndex, curiosities.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex === null || currentIndex <= 0) return;
    setCurrentIndex(prev => (prev !== null ? prev - 1 : prev));
  }, [currentIndex]);

  // Surpresa aleatória
  const surpriseMe = useCallback(() => {
    if (!currentCuriosity) return;

    const unreadCuriosities = allCuriosityIds.filter(c => 
      c.id !== currentCuriosity.id && !stats.readCuriosities.includes(c.id)
    );
    const pool = unreadCuriosities.length ? unreadCuriosities : allCuriosityIds.filter(c => c.id !== currentCuriosity.id);

    if (pool.length === 0) return;

    const random = pool[Math.floor(Math.random() * pool.length)];
    router.push(`/curiosity/${random.categoryId}`);
  }, [allCuriosityIds, currentCuriosity, stats.readCuriosities, router]);

  // Skeleton de carregamento
  if (!isLoaded || currentIndex === null) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className="font-headline text-3xl font-bold">{category.name}</h1>
        <Card className="overflow-hidden shadow-2xl animate-pulse">
          <CardHeader className="bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-6 w-1/6" />
            </div>
          </CardHeader>
          <CardContent className="p-6 md:p-8 space-y-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </CardContent>
          <CardFooter className="flex flex-col gap-4 bg-muted/30 p-4 md:flex-row md:justify-between">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!currentCuriosity) return (
    <div className="flex flex-col items-center justify-center text-center p-8">
      <h2 className="text-2xl font-bold">Opa! Algo deu errado.</h2>
      <p className="text-muted-foreground mt-2">Não conseguimos carregar esta curiosidade.</p>
      <Button asChild className="mt-6">
        <Link href="/">Voltar ao Início</Link>
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center">
        <h1 className="font-headline text-3xl font-bold">{category.name}</h1>
        <Button variant="outline" asChild>
          <Link href={`/quiz/${category.id}`}>
            <HelpCircle className="mr-2 h-4 w-4" />
            Iniciar Quiz
          </Link>
        </Button>
      </div>

      {/* Curiosidade */}
      <Card key={currentCuriosity.id} className="overflow-hidden shadow-2xl" style={{ borderLeft: `5px solid ${category.color}` }}>
        <CardHeader className="bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{category.emoji}</span>
              <CardTitle className="font-headline text-2xl">{category.name}</CardTitle>
            </div>
            <Badge variant="secondary" className="whitespace-nowrap">Curiosidade #{currentIndex + 1}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 md:p-8">
          <div className="mb-6">
            <h2 className="mb-4 font-headline text-3xl font-bold text-primary">{currentCuriosity.title}</h2>
            <p className="text-lg leading-relaxed text-foreground/80">{currentCuriosity.content}</p>
            {currentCuriosity.funFact && (
              <div className="mt-6 rounded-lg border-l-4 border-accent bg-accent/10 p-4">
                <p className="font-semibold text-accent-foreground">
                  <span className="font-bold">Fato Curioso:</span> {currentCuriosity.funFact}
                </p>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 bg-muted/30 p-4 md:flex-row md:justify-between">
          <Button variant="outline" onClick={handlePrev} disabled={currentIndex === 0} aria-label="Curiosidade anterior">
            <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
          </Button>
          {currentIndex === curiosities.length - 1 ? (
            <Button asChild>
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Voltar ao início
              </Link>
            </Button>
          ) : (
            <Button onClick={handleNext} aria-label="Próxima curiosidade">
              Próxima Curiosidade <Rocket className="ml-2 h-4 w-4" />
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Surpresa */}
      <div className="flex justify-center">
        <Button variant="ghost" onClick={surpriseMe} aria-label="Surpreenda-me com uma curiosidade aleatória">
          <Sparkles className="mr-2 h-4 w-4" /> Surpreenda-me
        </Button>
      </div>

      {/* Status do explorador */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center">
            {stats.explorerStatus ? explorerIcons[stats.explorerStatus] : <Skeleton className="h-5 w-5 mr-2" />}
            Status do Explorador
          </CardTitle>
          <CardDescription>Sua jornada de conhecimento até agora.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
          {[
            { label: "Lidas", value: stats.totalCuriositiesRead },
            { label: "Sequência", value: stats.currentStreak },
            { label: "Combos", value: stats.combos },
            { label: "Nível", value: stats.explorerStatus },
          ].map((item, idx) => (
            <div key={idx} className="flex flex-col items-center justify-center rounded-lg bg-muted p-4">
              {isLoaded ? <span className={item.label === "Nível" ? "text-lg font-bold" : "text-2xl font-bold"}>{item.value}</span> : <Skeleton className="h-8 w-1/2" />}
              <span className="text-sm text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
