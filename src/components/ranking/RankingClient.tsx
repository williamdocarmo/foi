"use client";

import type { GetTopUsersOutput } from '@/ai/flows/ranking-flow';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Medal, Trophy } from 'lucide-react';

// O componente agora é mais 'burro'. Ele apenas recebe os dados e os renderiza.
export default function RankingList({ initialUsers }: { initialUsers: GetTopUsersOutput['users'] }) {

  const getMedalColor = (rank: number) => {
    switch (rank) {
      case 1: return "text-yellow-400";
      case 2: return "text-gray-400";
      case 3: return "text-amber-600";
      default: return "text-muted-foreground";
    }
  }

  if (initialUsers.length === 0) {
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
      {initialUsers.map((user, index) => (
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