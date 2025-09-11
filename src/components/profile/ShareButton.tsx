"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Share2 } from "lucide-react";

export function ShareButton() {
  const { toast } = useToast();

  const handleShare = async () => {
    const shareData = {
      title: "Você Sabia?",
      text: "Venha testar seus conhecimentos e aprender algo novo todos os dias!",
      url: window.location.origin,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        console.error("Erro ao compartilhar:", error);
      }
    } else {
      // Fallback for browsers that don't support Web Share API
      try {
        await navigator.clipboard.writeText(shareData.url);
        toast({
          title: "Link Copiado!",
          description: "O link do app foi copiado para sua área de transferência.",
        });
      } catch (error) {
        console.error("Erro ao copiar o link:", error);
        toast({
          title: "Erro",
          description: "Não foi possível copiar o link.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Button onClick={handleShare}>
      <Share2 className="mr-2 h-4 w-4" />
      Convidar Amigos
    </Button>
  );
}
