"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail
} from 'firebase/auth';
import { Separator } from '../ui/separator';
import { Mail, Key, User } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import Link from 'next/link';

type AuthModalProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

const GoogleIcon = () => (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );

export default function AuthModal({ isOpen, setIsOpen }: AuthModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!agreed) {
        toast({ title: 'Termos de Uso', description: 'Você precisa aceitar os termos para criar uma conta.', variant: 'destructive'});
        return;
    }
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast({
        title: 'Bem-vindo!',
        description: 'Login com Google realizado com sucesso.',
      });
      setIsOpen(false);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erro de Login',
        description: 'Não foi possível fazer login com o Google. Verifique a configuração do Firebase.',
        variant: 'destructive',
      });
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
        toast({ title: 'Erro', description: 'Por favor, preencha e-mail e senha.', variant: 'destructive'});
        return;
    }
    setIsLoading(true);
    try {
        const methods = await fetchSignInMethodsForEmail(auth, email);
        
        if (methods.length > 0) {
            // Email exists, try to sign in
            await signInWithEmailAndPassword(auth, email, password);
             toast({
                title: 'Bem-vindo de volta!',
                description: 'Login realizado com sucesso.',
            });
        } else {
            // Email does not exist, check for agreement and create a new account
             if (!agreed) {
                toast({ title: 'Termos de Uso', description: 'Você precisa aceitar os termos para criar uma conta.', variant: 'destructive'});
                setIsLoading(false);
                return;
            }
            await createUserWithEmailAndPassword(auth, email, password);
             toast({
                title: 'Conta Criada!',
                description: 'Sua conta foi criada com sucesso.',
            });
        }
        setIsOpen(false);
    } catch (error: any) {
        console.error(error);
        let message = 'Ocorreu um erro. Verifique suas credenciais ou a configuração do Firebase.';
        if (error.code === 'auth/wrong-password') {
            message = 'Senha incorreta. Tente novamente.'
        } else if (error.code === 'auth/weak-password') {
            message = 'A senha deve ter pelo menos 6 caracteres.'
        } else if (error.code === 'auth/email-already-in-use') {
             message = 'Este e-mail já está em uso por outra conta.'
        }
        toast({
            title: 'Erro de Autenticação',
            description: message,
            variant: 'destructive',
        });
    } finally {
        setIsLoading(false);
    }
  }


  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-headline">Acesse ou Crie sua Conta</DialogTitle>
          <DialogDescription className="text-center">
            O progresso é salvo no seu navegador. Crie uma conta para sincronizar entre dispositivos.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
             <Button variant="outline" onClick={handleGoogleSignIn} disabled={isLoading}>
                {isLoading ? 'Carregando...' : <><GoogleIcon /> Continuar com o Google</>}
             </Button>

            <div className="relative my-2">
                <Separator />
                <div className="absolute inset-0 flex items-center">
                    <span className="mx-auto bg-background px-2 text-xs text-muted-foreground">OU</span>
                </div>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="email"><Mail className='inline-block mr-1'/> E-mail</Label>
                    <Input 
                        id="email" 
                        type="email" 
                        placeholder="seu@email.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                    />
                </div>
                 <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="password"><Key className='inline-block mr-1'/> Senha</Label>
                    <Input 
                        id="password" 
                        type="password"
                        placeholder="Sua senha"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={isLoading}
                    />
                </div>
                
                 <div className="items-top flex space-x-2">
                    <Checkbox id="terms" checked={agreed} onCheckedChange={(checked) => setAgreed(checked as boolean)} />
                    <div className="grid gap-1.5 leading-none">
                        <label
                        htmlFor="terms"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                        Li e concordo com os Termos de Uso
                        </label>
                        <p className="text-sm text-muted-foreground">
                         Você pode ver os termos de uso <Link href="/terms" className="underline" target="_blank">aqui</Link>.
                        </p>
                    </div>
                 </div>
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                   {isLoading ? 'Verificando...' : <><User className='mr-2'/> Entrar ou Criar Conta</>}
                </Button>
            </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
