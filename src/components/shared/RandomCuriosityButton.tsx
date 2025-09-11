"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { getAllCuriosities } from "@/lib/data";
import { useEffect, useState } from "react";
import { Curiosity } from "@/lib/types";

export function RandomCuriosityButton() {
  const router = useRouter();
  const [allCuriosities, setAllCuriosities] = useState<Curiosity[]>([]);
  
  useEffect(() => {
    getAllCuriosities().then(setAllCuriosities);
  }, []);

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
