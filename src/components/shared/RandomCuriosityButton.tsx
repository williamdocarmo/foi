"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { curiosities } from "@/lib/data";

export function RandomCuriosityButton() {
  const router = useRouter();

  const handleRandomClick = () => {
    const randomCuriosity = curiosities[Math.floor(Math.random() * curiosities.length)];
    if (randomCuriosity) {
      router.push(`/curiosity/${randomCuriosity.categoryId}?curiosity=${randomCuriosity.id}`);
    }
  };

  return (
    <Button
      size="lg"
      className="bg-accent text-accent-foreground hover:bg-accent/90"
      onClick={handleRandomClick}
    >
      <Sparkles className="mr-2 h-5 w-5" />
      Surpreenda-me!
    </Button>
  );
}
