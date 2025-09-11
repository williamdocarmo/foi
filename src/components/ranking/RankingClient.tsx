"use client";

import { useEffect, useState } from 'react';
import { getTopUsers, type GetTopUsersOutput } from '@/ai/flows/ranking-flow';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Medal, Trophy } from 'lucide-react';

export default function RankingClient() {
  const [ranking, setRanking] = useState<GetTopUsersOutput['users']>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchRanking() {
      try {
        setIsLoading(true);
        const result = await getTopUsers({ count: 5 });
        setRanking(result.users);
      } catch (error) {
        console.error("Failed to fetch ranking:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRanking();
  }, []);

  const getMedalColor = (rank: number) => {
    switch (rank) {
      case 1: return "text-yellow-400";
      case 2: return "text-gray-400";
      case 3: return "text-amber-600";
      default: return "text-muted-foreground";
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="flex items-center p-4">
            <Skeleton className="h-6 w-6 mr-4" />
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="ml-4 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (ranking.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-xl font-semibold">O Ranking está Vazio!</h3>
          <p className="mt-2 text-muted-foreground">
            Ainda não há dados suficientes para exibir o ranking. Jogue mais para aparecer aqui!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-slide-in-up">
      {ranking.map((user, index) => (
        <Card key={index} className="flex items-center p-4 transition-all hover:bg-muted/50">
          <div className={`flex h-8 w-8 items-center justify-center font-bold text-xl ${getMedalColor(user.rank)}`}>
            {user.rank <= 3 ? <Medal className="h-6 w-6 fill-current" /> : user.rank}
          </div>
          <Avatar className="ml-4 h-12 w-12">
            <AvatarImage src={user.photoURL} alt={user.name} />
            <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="ml-4 flex-grow">
            <p className="font-bold text-lg">{user.name}</p>
            <p className="text-sm text-muted-foreground">
              {user.curiositiesRead} curiosidades lidas
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
