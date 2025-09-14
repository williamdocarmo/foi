import RankingList from '@/components/ranking/RankingClient';
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

// A página agora renderiza o componente cliente e o Suspense
// A busca inicial de dados foi removida do servidor para evitar erros de build.
export default function RankingPage() {
  return (
    <div className="container mx-auto max-w-4xl py-8 md:py-12">
        <div className="mb-8 text-center">
            <h1 className="font-headline text-4xl font-bold">Ranking de Exploradores</h1>
            <p className="text-muted-foreground mt-2">Veja quem são os maiores mestres do conhecimento!</p>
        </div>
        
        {/* Suspense mostra o esqueleto enquanto o RankingList (agora um Client Component) busca os dados */}
        <Suspense fallback={<RankingSkeleton />}>
          <RankingList initialUsers={[]} />
        </Suspense>
    </div>
  );
}
