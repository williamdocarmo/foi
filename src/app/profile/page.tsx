import ProfileClient from '@/components/profile/ProfileClient';

export default function ProfilePage() {

  return (
    <div className="container mx-auto max-w-4xl py-8 md:py-12">
        <div className="mb-8 text-center">
            <h1 className="font-headline text-4xl font-bold">Seu Perfil de Explorador</h1>
            <p className="text-muted-foreground mt-2">Acompanhe sua jornada de conhecimento e suas conquistas!</p>
        </div>
        <ProfileClient />
    </div>
  );
}
