"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Lightbulb, BookOpen, Flame, Trophy, LogIn, LogOut, User, BarChart } from 'lucide-react';
import { useGameStats } from '@/hooks/useGameStats';
import OfflineIndicator from '@/components/shared/OfflineIndicator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import AuthModal from '@/components/auth/AuthModal';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';

export default function AppHeader() {
  const { stats, isLoaded, user } = useGameStats();
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({
        title: 'Sucesso!',
        description: 'Você saiu da sua conta.',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível sair. Tente novamente.',
        variant: 'destructive',
      });
    }
  };
  
  const getInitials = (email: string | null | undefined) => {
    if (!email) return 'U';
    return email.substring(0, 2).toUpperCase();
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Lightbulb className="h-6 w-6 text-accent" />
            <span className="hidden font-bold sm:inline-block font-headline">
              Você sabia?
            </span>
          </Link>
          
          <div className="flex flex-1 items-center justify-end space-x-2 md:space-x-4">
              <div className="flex items-center space-x-2 md:space-x-4 text-sm font-medium text-muted-foreground">
                {isLoaded ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1" >
                          <BookOpen className="h-4 w-4" />
                          <span>{stats.totalCuriositiesRead}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Curiosidades Lidas</TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1">
                          <Flame className="h-4 w-4 text-orange-500" />
                          <span>{stats.currentStreak}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Sequência de Dias</TooltipContent>
                    </Tooltip>
                    
                     <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href="/profile" className="flex items-center gap-1 hover:text-foreground">
                          <Trophy className="h-4 w-4 text-yellow-500" />
                          <span className='hidden sm:inline-block'>Conquistas</span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>Ver Conquistas e Perfil</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href="/ranking" className="flex items-center gap-1 hover:text-foreground">
                          <BarChart className="h-4 w-4 text-blue-500" />
                          <span className='hidden sm:inline-block'>Ranking</span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>Ver Ranking de Jogadores</TooltipContent>
                    </Tooltip>

                  </>
                ) : (
                  <>
                    <Skeleton className="h-5 w-8" />
                    <Skeleton className="h-5 w-8" />
                    <Skeleton className="h-5 w-20" />
                     <Skeleton className="h-5 w-20" />
                  </>
                )}
              </div>

            <OfflineIndicator />

            {isLoaded && (
              user ? (
                 <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                      <Avatar className='h-8 w-8'>
                         <AvatarImage src={user.photoURL ?? ''} alt={user.displayName ?? 'Avatar'} />
                         <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                     <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.displayName || 'Usuário'}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                     <DropdownMenuItem asChild>
                       <Link href="/profile">
                         <Trophy className="mr-2 h-4 w-4" />
                         <span>Minhas Conquistas</span>
                       </Link>
                    </DropdownMenuItem>
                     <DropdownMenuItem asChild>
                       <Link href="/ranking">
                         <BarChart className="mr-2 h-4 w-4" />
                         <span>Ranking Global</span>
                       </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sair</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setAuthModalOpen(true)}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Entrar
                </Button>
              )
            )}
          </div>
        </div>
      </header>
      <AuthModal isOpen={isAuthModalOpen} setIsOpen={setAuthModalOpen} />
    </>
  );
}
