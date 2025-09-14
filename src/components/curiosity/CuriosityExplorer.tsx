"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Category, Curiosity } from "@/lib/types";
import { useGameStats } from "@/hooks/useGameStats";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Rocket, Sparkles, Trophy, Star, TrendingUp, Home, HelpCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Skeleton } from "../ui/skeleton";
import { categories, curiositiesByCategory } from "@/lib/data";

type CuriosityExplorerProps = {
  category: Category;
  curiosities: Curiosity[];
};

export default function CuriosityExplorer({ 
    category, 
    curiosities, 
}: CuriosityExplorerProps) {
  const router = useRouter();
  const { stats, markCuriosityAsRead, isLoaded } = useGameStats();

  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  const allCuriosityIds = useMemo(() => {
    return categories.flatMap(cat => 
        (curiositiesByCategory[cat.id] || []).map(c => ({ id: c.id, categoryId: c.categoryId }))
    );
  }, []);

  // Efeito que executa apenas quando os dados do usuário terminam de carregar.
  // Isso define o índice inicial corretamente, sem causar loops.
  useEffect(() => {
    if (isLoaded) {
      const calculateInitialIndex = () => {
        if (!curiosities || curiosities.length === 0) return 0;
        if (!stats || !stats.readCuriosities) return 0;
        const firstUnreadIndex = curiosities.findIndex(c => !stats.readCuriosities.includes(c.id));
        return firstUnreadIndex !== -1 ? firstUnreadIndex : 0;
      };
      setCurrentIndex(calculateInitialIndex());
    }
  }, [isLoaded, curiosities, stats.readCuriosities]); // Dependências estáveis

  // Efeito para marcar a curiosidade atual como lida
  useEffect(() => {
    if (isLoaded && currentIndex !== null) {
      const currentCuriosity = curiosities[currentIndex];
      if (currentCuriosity) {
        markCuriosityAsRead(currentCuriosity.id, currentCuriosity.categoryId);
      }
    }
  }, [isLoaded, currentIndex, curiosities, markCuriosityAsRead]);

  const handleNext = useCallback(() => {
    if (currentIndex === null) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex < curiosities.length) {
      setCurrentIndex(nextIndex);
    }
  }, [currentIndex, curiosities.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex === null) return;
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setCurrentIndex(prevIndex);
    }
  }, [currentIndex]);
  
  const surpriseMe = useCallback(() => {
    if (allCuriosityIds.length <= 1 || currentIndex === null) return;
  
    const currentId = curiosities[currentIndex]?.id;
    let availableIds = allCuriosityIds.filter(c => c.id !== currentId);
  
    let unreadIds = availableIds.filter(c => !stats.readCuriosities.includes(c.id));

    if (unreadIds.length > 0) {
        availableIds = unreadIds;
    }

    const randomCuriosity = availableIds[Math.floor(Math.random() * availableIds.length)];
    
    router.push(`/curiosity/${randomCuriosity.categoryId}`);
  }, [stats.readCuriosities, currentIndex, curiosities, router, allCuriosityIds]);
  
  if (curiosities.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-2xl font-bold">Nenhuma curiosidade encontrada.</h2>
            <p className="text-muted-foreground mt-2">Parece que não há nada aqui ainda para a categoria {category.name}.</p>
            <p className="text-muted-foreground mt-2">Você pode gerar conteúdo novo executando: `npm run generate-content`</p>
            <Button asChild className="mt-6">
                <Link href="/">Voltar ao Início</Link>
            </Button>
        </div>
    );
  }
  
  if (currentIndex === null || !isLoaded) {
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
    )
  }

  const currentCuriosity = curiosities[currentIndex];
  
  const explorerIcons = {
    'Iniciante': <Star className="mr-2 h-5 w-5 text-yellow-400" />,
    'Explorador': <TrendingUp className="mr-2 h-5 w-5 text-green-500" />,
    'Expert': <Trophy className="mr-2 h-5 w-5 text-amber-500" />,
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-between items-center">
        <h1 className="font-headline text-3xl font-bold">{category.name}</h1>
        <Button variant="outline" asChild>
          <Link href={`/quiz/${category.id}`}>
            <HelpCircle className="mr-2 h-4 w-4" />
            Iniciar Quiz
          </Link>
        </Button>
      </div>

       <Card
        key={currentCuriosity.id}
        className="overflow-hidden shadow-2xl"
        style={{ borderLeft: `5px solid ${category.color}` }}
      >
        <CardHeader className="bg-muted/30 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{category.emoji}</span>
                    <CardTitle className="font-headline text-2xl">{category.name}</CardTitle>
                </div>
                 <Badge variant="secondary" className="whitespace-nowrap">
                    Curiosidade #{currentIndex + 1}
                </Badge>
            </div>
        </CardHeader>
        <CardContent className="p-6 md:p-8">
          <div className="mb-6">
            <h2 className="mb-4 font-headline text-3xl font-bold text-primary">
              {currentCuriosity.title}
            </h2>
            <p className="text-lg leading-relaxed text-foreground/80">
              {currentCuriosity.content}
            </p>
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
      
      <div className="flex justify-center">
         <Button variant="ghost" onClick={surpriseMe} aria-label="Surpreenda-me com uma curiosidade aleatória">
            <Sparkles className="mr-2 h-4 w-4" /> Surpreenda-me
         </Button>
      </div>

       <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center">
            {isLoaded && stats.explorerStatus ? explorerIcons[stats.explorerStatus] : <Skeleton className="h-5 w-5 mr-2" />}
            Status do Explorador
          </CardTitle>
          <CardDescription>Sua jornada de conhecimento até agora.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
          <div className="flex flex-col items-center justify-center rounded-lg bg-muted p-4">
            {isLoaded ? <span className="text-2xl font-bold">{stats.totalCuriositiesRead}</span> : <Skeleton className="h-8 w-1/2" />}
            <span className="text-sm text-muted-foreground">Lidas</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg bg-muted p-4">
            {isLoaded ? <span className="text-2xl font-bold">{stats.currentStreak}</span> : <Skeleton className="h-8 w-1/2" />}
            <span className="text-sm text-muted-foreground">Sequência</span>
          </div>
           <div className="flex flex-col items-center justify-center rounded-lg bg-muted p-4">
            {isLoaded ? <span className="text-2xl font-bold">{stats.combos}</span> : <Skeleton className="h-8 w-1/2" />}
            <span className="text-sm text-muted-foreground">Combos</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg bg-muted p-4">
            {isLoaded ? <span className="text-lg font-bold">{stats.explorerStatus}</span> : <Skeleton className="h-7 w-3/4" />}
            <span className="text-sm text-muted-foreground">Nível</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
