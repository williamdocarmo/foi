import ProfileClient from '@/components/profile/ProfileClient';
import { ShareButton } from '@/components/profile/ShareButton';
import { Card, CardContent } from '@/components/ui/card';
import { categories } from '@/lib/data'; // Importa os dados das categorias no servidor

export default function ProfilePage() {

  return (
    <div className="container mx-auto max-w-4xl py-8 md:py-12">
        <div className="mb-8 text-center">
            <h1 className="font-headline text-4xl font-bold">Seu Perfil de Explorador</h1>
            <p className="text-muted-foreground mt-2">Acompanhe sua jornada de conhecimento e suas conquistas!</p>
        </div>
        {/* Passa os dados das categorias como prop para o componente de cliente */}
        <ProfileClient categories={categories} />
        <Card className="mt-6">
          <CardContent className="p-6 text-center">
            <h3 className="font-headline text-xl font-bold">Gostando do Desafio?</h3>
            <p className="text-muted-foreground mt-2 mb-4">Compartilhe com seus amigos e veja quem sabe mais!</p>
            <ShareButton />
          </CardContent>
        </Card>
    </div>
  );
}
