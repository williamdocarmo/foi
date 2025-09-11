"use client";

import Link from "next/link";
import { Lightbulb, BookOpen, Flame } from "lucide-react";
import { useGameStats } from "@/hooks/useGameStats";
import OfflineIndicator from "@/components/shared/OfflineIndicator";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppHeader() {
  const { stats, isLoaded } = useGameStats();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Lightbulb className="h-6 w-6 text-accent" />
          <span className="hidden font-bold sm:inline-block font-headline">
            Idea Spark
          </span>
        </Link>
        <div className="flex flex-1 items-center justify-end space-x-4">
          <div className="flex items-center space-x-4 text-sm font-medium text-muted-foreground">
            {isLoaded ? (
              <>
                <div className="flex items-center gap-1" title="Curiosidades Lidas">
                  <BookOpen className="h-4 w-4" />
                  <span>{stats.totalCuriositiesRead}</span>
                </div>
                <div className="flex items-center gap-1" title="Sequência de Dias">
                  <Flame className="h-4 w-4 text-orange-500" />
                  <span>{stats.currentStreak}</span>
                </div>
              </>
            ) : (
                <>
                    <Skeleton className="h-5 w-8" />
                    <Skeleton className="h-5 w-8" />
                </>
            )}
          </div>
          <OfflineIndicator />
        </div>
      </div>
    </header>
  );
}
