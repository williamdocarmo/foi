"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { getAllCuriosities } from "@/lib/data";
import { Curiosity } from "@/lib/types";

export function RandomCuriosityButton() {
  const router = useRouter();
  
  // As the data loading is now synchronous, we can get it directly.
  const allCuriosities: Curiosity[] = getAllCuriosities();

  const handleRandomClick = () => {
    if (allCuriosities.length === 0) return;
    const randomCuriosity = allCuriosities[Math.floor(Math.random() * allCuriosities.length)];
    if (randomCuriosity) {
      router.push(`/curiosity/${randomCuriosity.categoryId}?curiosity=${randomCuriosity.id}`);
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
      Surpreenda-me!
    </Button>
  );
}
