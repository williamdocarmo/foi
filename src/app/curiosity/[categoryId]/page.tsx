import { getCategoryById, getCuriositiesByCategoryId } from "@/lib/data";
import { notFound } from "next/navigation";
import CuriosityExplorer from "@/components/curiosity/CuriosityExplorer";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type CuriosityPageProps = {
  params: { categoryId: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

export default function CuriosityPage({ params, searchParams }: CuriosityPageProps) {
  const { categoryId } = params;
  const initialCuriosityId = searchParams?.curiosity as string;

  const category = getCategoryById(categoryId);
  const curiosities = getCuriositiesByCategoryId(categoryId);

  if (!category || curiosities.length === 0) {
    notFound();
  }

  return (
    <div className="container mx-auto max-w-4xl py-8 md:py-12">
        <div className="mb-8">
            <Button variant="ghost" asChild>
                <Link href="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Categorias
                </Link>
            </Button>
        </div>
        <CuriosityExplorer 
            category={category} 
            curiosities={curiosities} 
            initialCuriosityId={initialCuriosityId}
        />
    </div>
  );
}
