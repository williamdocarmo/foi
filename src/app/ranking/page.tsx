import RankingList from '@/components/ranking/RankingClient';
import { getTopUsers } from '@/ai/flows/ranking-flow';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

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

// Componente de Servidor Assíncrono para buscar os dados
async function RankingData() {
  // A busca de dados agora acontece no servidor
  const { users } = await getTopUsers({ count: 10 });
  return <RankingList initialUsers={users} />;
}


export default function RankingPage() {
  return (
    <div className="container mx-auto max-w-4xl py-8 md:py-12">
        <div className="mb-8 text-center">
            <h1 className="font-headline text-4xl font-bold">Ranking de Exploradores</h1>
            <p className="text-muted-foreground mt-2">Veja quem são os maiores mestres do conhecimento!</p>
        </div>
        
        {/* Suspense vai renderizar o fallback enquanto os dados de RankingData estão sendo buscados */}
        <Suspense fallback={<RankingSkeleton />}>
          <RankingData />
        </Suspense>
    </div>
  );
}