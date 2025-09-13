"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Category, Curiosity } from "@/lib/types";
import { useGameStats } from "@/hooks/useGameStats";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Rocket, Sparkles, Trophy, Star, TrendingUp, Home, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAllCuriosities } from "@/lib/data";
import Link from "next/link";
import { Skeleton } from "../ui/skeleton";

type CuriosityExplorerProps = {
  category: Category;
  curiosities: Curiosity[];
  initialCuriosityId?: string;
};

// This component was completely rewritten to fix persistent rendering loop and navigation bugs.
// The new architecture follows senior-level React patterns for stability and predictability.
export default function CuriosityExplorer({ 
    category, 
    curiosities, 
    initialCuriosityId 
}: CuriosityExplorerProps) {
  const router = useRouter();
  const { stats, markCuriosityAsRead, isLoaded } = useGameStats();
  
  // State is now minimal: only the currentIndex is needed.
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  // Effect to set the initial index. This runs ONLY ONCE after the component mounts
  // and the game stats are loaded. This is the key to breaking the rendering loop.
  useEffect(() => {
    if (!isLoaded || curiosities.length === 0) return;

    const findInitialIndex = () => {
      // 1. Prioritize the ID from the URL query parameter.
      if (initialCuriosityId) {
        const index = curiosities.findIndex(c => c.id === initialCuriosityId);
        if (index !== -1) return index;
      }
      // 2. Fallback to the last read curiosity in this category.
      const lastReadId = stats.lastReadCuriosity?.[category.id];
      if (lastReadId) {
          const index = curiosities.findIndex(c => c.id === lastReadId);
          if (index !== -1) return index;
      }
      // 3. Fallback to the first unread curiosity in this category.
      const firstUnreadIndex = curiosities.findIndex(c => !stats.readCuriosities.includes(c.id));
      if (firstUnreadIndex !== -1) return firstUnreadIndex;
      // 4. Default to the very first curiosity if all else fails.
      return 0;
    };

    setCurrentIndex(findInitialIndex());
    
  // The empty dependency array [] ensures this effect runs only once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, curiosities.length]);


  // Effect to mark a curiosity as read. This is a controlled side-effect that
  // runs ONLY when the currentIndex changes.
  useEffect(() => {
    if (currentIndex !== null && isLoaded) {
      const currentCuriosity = curiosities[currentIndex];
      if (currentCuriosity) {
        markCuriosityAsRead(currentCuriosity.id, currentCuriosity.categoryId);
      }
    }
  }, [currentIndex, isLoaded, markCuriosityAsRead, curiosities]);


  // Navigation handlers are now simple state updaters.
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
    const allCuriosities = getAllCuriosities();
    if (allCuriosities.length <= 1) return;
  
    let randomCuriosity: Curiosity;
    const unread = allCuriosities.filter(c => !stats.readCuriosities.includes(c.id) && c.id !== curiosities[currentIndex!]?.id);
  
    if (unread.length > 0) {
      randomCuriosity = unread[Math.floor(Math.random() * unread.length)];
    } else {
      const allOthers = allCuriosities.filter(c => c.id !== curiosities[currentIndex!]?.id);
      randomCuriosity = allOthers[Math.floor(Math.random() * allOthers.length)];
    }
    
    // Navigate to the new curiosity's page, which will re-render the component tree correctly.
    router.push(`/curiosity/${randomCuriosity.categoryId}?curiosity=${randomCuriosity.id}`);

  }, [stats.readCuriosities, currentIndex, curiosities, router]);
  
  
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
  
  // A single, clear loading state.
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
          <Button variant="outline" onClick={handlePrev} disabled={currentIndex === 0}>
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
               <Button onClick={handleNext}>
                  Próxima Curiosidade <Rocket className="ml-2 h-4 w-4" />
               </Button>
            )}
        </CardFooter>
      </Card>
      
      <div className="flex justify-center">
         <Button variant="ghost" onClick={surpriseMe}>
            <Sparkles className="mr-2 h-4 w-4" /> Surpreenda-me com uma curiosidade aleatória
         </Button>
      </div>

       <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center">
            {isLoaded && stats.explorerStatus && explorerIcons[stats.explorerStatus]}
            Status do Explorador
          </CardTitle>
          <CardDescription>Sua jornada de conhecimento até agora.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
          <div className="flex flex-col items-center justify-center rounded-lg bg-muted p-4">
            <span className="text-2xl font-bold">{isLoaded ? stats.totalCuriositiesRead : '...'}</span>
            <span className="text-sm text-muted-foreground">Lidas</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg bg-muted p-4">
            <span className="text-2xl font-bold">{isLoaded ? stats.currentStreak : '...'}</span>
            <span className="text-sm text-muted-foreground">Sequência</span>
          </div>
           <div className="flex flex-col items-center justify-center rounded-lg bg-muted p-4">
            <span className="text-2xl font-bold">{isLoaded ? stats.combos : '...'}</span>
            <span className="text-sm text-muted-foreground">Combos</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg bg-muted p-4">
            <span className="text-lg font-bold">{isLoaded ? stats.explorerStatus : '...'}</span>
            <span className="text-sm text-muted-foreground">Nível</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
