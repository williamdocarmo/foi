import RankingClient from '@/components/ranking/RankingClient';

export default function RankingPage() {
  return (
    <div className="container mx-auto max-w-4xl py-8 md:py-12">
        <div className="mb-8 text-center">
            <h1 className="font-headline text-4xl font-bold">Ranking de Exploradores</h1>
            <p className="text-muted-foreground mt-2">Veja quem são os maiores mestres do conhecimento!</p>
        </div>
        <RankingClient />
    </div>
  );
}
