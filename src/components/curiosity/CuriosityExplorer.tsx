
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Category, Curiosity } from "@/lib/types";
import { useGameStats } from "@/hooks/useGameStats";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Rocket, Sparkles, Trophy, Star, TrendingUp, Home, HelpCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getAllCuriosities } from "@/lib/data";
import Link from "next/link";
import { Skeleton } from "../ui/skeleton";

type CuriosityExplorerProps = {
  category: Category;
  curiosities: Curiosity[];
  initialCuriosityId?: string;
};

export default function CuriosityExplorer({ 
    category, 
    curiosities, 
    initialCuriosityId 
}: CuriosityExplorerProps) {
  const router = useRouter();
  const { stats, markCuriosityAsRead, isLoaded } = useGameStats();
  
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!isLoaded) return 0; // Return a default, will be re-calculated in useEffect
    const firstUnreadIndex = curiosities.findIndex(c => !stats.readCuriosities.includes(c.id));
    const initialIndex = curiosities.findIndex(c => c.id === initialCuriosityId);

    if (initialIndex !== -1) {
      return initialIndex;
    }
    return firstUnreadIndex !== -1 ? firstUnreadIndex : 0;
  });

  const [hasInitialized, setHasInitialized] = useState(false);

  // This effect runs only once when `isLoaded` becomes true.
  // It correctly sets the initial index without causing loops.
  useEffect(() => {
    if (isLoaded && !hasInitialized) {
      const firstUnreadIndex = curiosities.findIndex(c => !stats.readCuriosities.includes(c.id));
      const initialIndexFromUrl = curiosities.findIndex(c => c.id === initialCuriosityId);

      let startIndex = 0;
      if (initialIndexFromUrl !== -1) {
        startIndex = initialIndexFromUrl;
      } else if (firstUnreadIndex !== -1) {
        startIndex = firstUnreadIndex;
      }
      
      setCurrentIndex(startIndex);
      setHasInitialized(true);
    }
  }, [isLoaded, hasInitialized, curiosities, initialCuriosityId, stats.readCuriosities]);

  const currentCuriosity = curiosities[currentIndex];

  // This effect marks a curiosity as read only when the current one changes.
  useEffect(() => {
    if (currentCuriosity && isLoaded && hasInitialized) {
      markCuriosityAsRead(currentCuriosity.id, currentCuriosity.categoryId);
    }
  }, [currentCuriosity, isLoaded, hasInitialized, markCuriosityAsRead]);

  const goToNext = () => {
    setCurrentIndex(prevIndex => Math.min(prevIndex + 1, curiosities.length - 1));
  };

  const goToPrev = () => {
    setCurrentIndex(prevIndex => Math.max(prevIndex - 1, 0));
  };
  
  const surpriseMe = useCallback(() => {
    const allCuriosities = getAllCuriosities();
    if (allCuriosities.length <= 1) return;
  
    let randomCuriosity: Curiosity;
    // Prefer unread curiosities that are not the current one
    const unread = allCuriosities.filter(c => !stats.readCuriosities.includes(c.id) && c.id !== currentCuriosity?.id);
  
    if (unread.length > 0) {
      randomCuriosity = unread[Math.floor(Math.random() * unread.length)];
    } else {
      // If all are read, pick any other one
      const allOthers = allCuriosities.filter(c => c.id !== currentCuriosity?.id);
      randomCuriosity = allOthers[Math.floor(Math.random() * allOthers.length)];
    }
    
    // Navigate to the new curiosity's page, which will re-render the component correctly
    router.push(`/curiosity/${randomCuriosity.categoryId}?curiosity=${randomCuriosity.id}`);

  }, [stats.readCuriosities, currentCuriosity?.id, router]);
  
  const progress = curiosities.length > 0 ? ((currentIndex + 1) / curiosities.length) * 100 : 0;
  
  const explorerIcons = {
    'Iniciante': <Star className="mr-2 h-5 w-5 text-yellow-400" />,
    'Explorador': <TrendingUp className="mr-2 h-5 w-5 text-green-500" />,
    'Expert': <Trophy className="mr-2 h-5 w-5 text-amber-500" />,
  };

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
  
  if (!isLoaded || !currentCuriosity || !hasInitialized) {
    return (
         <div className="flex flex-col gap-8">
            <h1 className="font-headline text-3xl font-bold">{category.name}</h1>
            <Card className="overflow-hidden shadow-2xl animate-pulse">
                <CardHeader className="bg-muted/30 p-4">
                     <div className="flex items-center justify-between">
                         <Skeleton className="h-8 w-1/2" />
                         <Skeleton className="h-6 w-1/6" />
                     </div>
                     <Skeleton className="h-2 w-full mt-4" />
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
                    {currentIndex + 1} / {curiosities.length}
                </Badge>
            </div>
            <Progress value={progress} className="mt-4 h-2" />
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
          <Button variant="outline" onClick={goToPrev} disabled={currentIndex === 0}>
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
               <Button onClick={goToNext}>
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
