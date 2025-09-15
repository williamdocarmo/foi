
"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { Mail, Key, User } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import Link from 'next/link';
import { siteConfig } from '@/config/site';

type AuthModalProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export default function AuthModal({ isOpen, setIsOpen }: AuthModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async () => {
    if (!agreed) {
        toast({ title: 'Termos de Uso', description: 'Você precisa aceitar os termos para criar uma conta.', variant: 'destructive'});
        setIsLoading(false);
        return;
    }
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        toast({
            title: 'Conta Criada!',
            description: 'Sua conta foi criada com sucesso.',
        });
        setIsOpen(false);
    } catch (error: any) {
        let message = 'Ocorreu um erro ao criar a conta.';
         if (error.code === 'auth/weak-password') {
            message = 'A senha deve ter pelo menos 6 caracteres.'
        } else if (error.code === 'auth/email-already-in-use') {
             message = 'Este e-mail já está em uso. Tente fazer login.'
        }
        toast({
            title: 'Erro ao Criar Conta',
            description: message,
            variant: 'destructive',
        });
    }
  }

  const handleSignIn = async () => {
     try {
        await signInWithEmailAndPassword(auth, email, password);
        toast({
            title: 'Bem-vindo de volta!',
            description: 'Login realizado com sucesso.',
        });
        setIsOpen(false);
    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            // If user does not exist, try to sign them up.
            await handleSignUp();
        } else if (error.code === 'auth/wrong-password') {
            toast({
                title: 'Erro de Autenticação',
                description: 'Senha incorreta. Tente novamente ou redefina sua senha.',
                variant: 'destructive',
            });
        } else {
             toast({
                title: 'Erro de Autenticação',
                description: 'Ocorreu um erro. Verifique suas credenciais.',
                variant: 'destructive',
            });
        }
    }
  }
  
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
        toast({ title: 'Erro', description: 'Por favor, preencha e-mail e senha.', variant: 'destructive'});
        return;
    }
    setIsLoading(true);
    await handleSignIn();
    setIsLoading(false);
  }

  const handlePasswordReset = async () => {
    if (!email) {
      toast({
        title: 'E-mail necessário',
        description: 'Por favor, insira seu e-mail para redefinir a senha.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: 'E-mail de redefinição enviado',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao redefinir senha',
        description: 'Não foi possível enviar o e-mail. Verifique se o e-mail está correto.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };


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
                    <div className="flex justify-between items-center">
                        <Label htmlFor="password"><Key className='inline-block mr-1'/> Senha</Label>
                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={handlePasswordReset} disabled={isLoading}>
                            Esqueceu a senha?
                        </Button>
                    </div>
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
                         Você pode ver os termos de uso <Link href={`${siteConfig.url}/terms`} className="underline" target="_blank">aqui</Link>.
                        </p>
                    </div>
                 </div>
                
                <Button type="submit" className="w-full" disabled={isLoading || !agreed}>
                   {isLoading ? 'Verificando...' : <><User className='mr-2'/> Entrar ou Criar Conta</>}
                </Button>
            </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
