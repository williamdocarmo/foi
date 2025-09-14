
"use client";

import { useState, useEffect } from 'react';
import type { GetTopUsersOutput } from '@/ai/flows/ranking-flow';
import { getTopUsers } from '@/ai/flows/ranking-flow';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Medal, Trophy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Componente para exibir o estado de carregamento (Skeleton)
function RankingSkeleton() {
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

// O componente agora é um Client Component e busca os dados no lado do cliente.
export default function RankingList() {
  const [users, setUsers] = useState<GetTopUsersOutput['users']>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // A busca de dados agora acontece aqui, no cliente.
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const { users: fetchedUsers } = await getTopUsers({ count: 10 });
        setUsers(fetchedUsers);
      } catch (error) {
        console.error("Error fetching ranking on client:", error);
        setUsers([]); // Define como vazio em caso de erro para não quebrar a UI
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
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
    return <RankingSkeleton />;
  }

  if (users.length === 0) {
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
      {users.map((user, index) => (
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
