"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import type { Curiosity } from "@/lib/types";

type RandomCuriosityButtonProps = {
  allCuriosities: Curiosity[];
};

export function RandomCuriosityButton({ allCuriosities }: RandomCuriosityButtonProps) {
  const router = useRouter();

  const handleRandomClick = () => {
    if (allCuriosities.length === 0) return;
    const randomCuriosity = allCuriosities[Math.floor(Math.random() * allCuriosities.length)];
    if (randomCuriosity) {
      router.push(`/curiosity/${randomCuriosity.categoryId}`);
    }
  };

  return (
    <Button
      size="lg"
      className="bg-accent text-accent-foreground hover:bg-accent/90"
      onClick={handleRandomClick}
      disabled={allCuriosities.length === 0}
    >
      <Sparkles className="mr-2 h-5 w-5" />
      Surpreenda-me com uma curiosidade aleatória
    </Button>
  );
}
