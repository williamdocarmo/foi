"use client";

import { useGameStats } from "@/hooks/useGameStats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Trophy, Star, TrendingUp, BookOpen, Flame, Zap, BarChart3, Medal } from "lucide-react";
import { Progress } from "../ui/progress";
import { getCategoryById } from "@/lib/data";
import { Skeleton } from "../ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useIsMobile } from "@/hooks/use-mobile";


export default function ProfileClient() {
  const { stats, isLoaded } = useGameStats();
  const isMobile = useIsMobile();
  
  const explorerIcons = {
    'Iniciante': <Star className="h-12 w-12 text-yellow-400" />,
    'Explorador': <TrendingUp className="h-12 w-12 text-green-500" />,
    'Expert': <Trophy className="h-12 w-12 text-amber-500" />,
  };
  
  const explorerProgress = {
    'Iniciante': (stats.totalCuriositiesRead / 10) * 100,
    'Explorador': ((stats.totalCuriositiesRead - 10) / 40) * 100,
    'Expert': 100,
  }

  const nextLevel = {
     'Iniciante': 'Explorador (10 lidas)',
     'Explorador': 'Expert (50 lidas)',
     'Expert': 'Você é uma lenda!',
  }

  const quizChartData = Object.entries(stats.quizScores).map(([categoryId, scores]) => {
    const category = getCategoryById(categoryId);
    const averageScore = scores.reduce((acc, s) => acc + s.score, 0) / scores.length;
    return {
      name: category?.name.substring(0, 3) ?? '??',
      pontuação: Math.round(averageScore),
      fill: category?.color ?? '#8884d8'
    };
  });
  
  if (!isLoaded) {
    return (
        <div className="space-y-6">
            <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-32 w-full" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-8 w-1/3" /></CardHeader><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-8 w-1/4" /></CardHeader><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>
        </div>
    )
  }

  return (
    <div className="space-y-6 animate-slide-in-up">
      {/* Status Card */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Nível de Explorador</CardTitle>
          <CardDescription>Sua classificação atual no mundo do conhecimento.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-shrink-0">
             {stats.explorerStatus && explorerIcons[stats.explorerStatus]}
          </div>
          <div className="w-full">
            <p className="text-2xl font-bold text-primary">{stats.explorerStatus}</p>
            <Progress value={explorerProgress[stats.explorerStatus]} className="my-2 h-3" />
            <p className="text-xs text-muted-foreground">
                Próximo nível: {nextLevel[stats.explorerStatus]}
            </p>
          </div>
        </CardContent>
      </Card>
      
      {/* General Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Curiosidades Lidas</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{stats.totalCuriositiesRead}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sequência Atual</CardTitle>
                <Flame className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{stats.currentStreak} {stats.currentStreak > 1 ? 'dias' : 'dia'}</div>
            </CardContent>
        </Card>
         <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recorde</CardTitle>
                <Medal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{stats.longestStreak} {stats.longestStreak > 1 ? 'dias' : 'dia'}</div>
            </CardContent>
        </Card>
         <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Combos</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{stats.combos}</div>
                 <p className="text-xs text-muted-foreground">Ganhos a cada 5 lidas</p>
            </CardContent>
        </Card>
      </div>

       {/* Quiz Performance */}
      {quizChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3/> Desempenho nos Quizzes</CardTitle>
            <CardDescription>Sua pontuação média por categoria.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 300}>
              <BarChart data={quizChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                  }}
                />
                <Bar dataKey="pontuação" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
