"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Category, Curiosity } from "@/lib/types";
import { useGameStats } from "@/hooks/useGameStats";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Rocket, Sparkles, Trophy, Star, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getAllCuriosities } from "@/lib/data";
import Link from "next/link";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

type CuriosityExplorerProps = {
  category: Category;
  curiosities: Curiosity[];
  initialCuriosityId?: string;
};

export default function CuriosityExplorer({ category, curiosities, initialCuriosityId }: CuriosityExplorerProps) {
  const router = useRouter();
  const { stats, markCuriosityAsRead, isLoaded } = useGameStats();
  const isOnline = useOnlineStatus();

  const allCuriosities = useMemo(() => getAllCuriosities(), []);

  const initialIndex = useMemo(() => {
    if (initialCuriosityId) {
      const foundIndex = curiosities.findIndex(c => c.id === initialCuriosityId);
      if (foundIndex !== -1) return foundIndex;
    }
    const lastReadIndex = curiosities.findIndex(c => !stats.readCuriosities.includes(c.id));
    return lastReadIndex !== -1 ? lastReadIndex : 0;
  }, [initialCuriosityId, curiosities, stats.readCuriosities]);
  
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  
  const currentCuriosity = curiosities[currentIndex];
  const isLastCuriosity = currentIndex === curiosities.length - 1;

  useEffect(() => {
    if (currentCuriosity && isLoaded) {
      markCuriosityAsRead(currentCuriosity.id);
    }
  }, [currentIndex, currentCuriosity, markCuriosityAsRead, isLoaded]);

  const goToNext = () => {
    if (currentIndex < curiosities.length - 1) {
      setCurrentIndex((prevIndex) => prevIndex + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prevIndex) => prevIndex - 1);
    }
  };
  
  const surpriseMe = () => {
    if (allCuriosities.length === 0) return;
    const unreadCuriosities = allCuriosities.filter(c => !stats.readCuriosities.includes(c.id));
    const pool = unreadCuriosities.length > 0 ? unreadCuriosities : allCuriosities;
    const randomCuriosity = pool[Math.floor(Math.random() * pool.length)];
    router.push(`/curiosity/${randomCuriosity.categoryId}?curiosity=${randomCuriosity.id}`);
  };
  
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
             <p className="text-muted-foreground mt-2">Você pode gerar conteúdo novo usando o script de geração.</p>
            <Button asChild className="mt-6">
                <Link href="/">Voltar ao Início</Link>
            </Button>
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
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
        </CardContent>
        <CardFooter className="flex flex-col gap-4 bg-muted/30 p-4 md:flex-row md:justify-between">
          <Button variant="outline" onClick={goToPrev} disabled={currentIndex === 0}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
          </Button>
          {isLastCuriosity ? (
            <Button asChild>
                <Link href="/">Voltar ao Início</Link>
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
