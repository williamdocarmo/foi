
import { getCategoryById, getCuriositiesByCategoryId, categories } from "@/lib/data";
import { notFound } from "next/navigation";
import CuriosityExplorer from "@/components/curiosity/CuriosityExplorer";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type CuriosityPageProps = {
  params: { categoryId: string };
};

export async function generateStaticParams() {
  return categories.map((category) => ({
    categoryId: category.id,
  }));
}

// A busca de dados (getCategoryById, getCuriositiesByCategoryId) é feita no servidor,
// pois são dados estáticos. O componente de cliente `CuriosityExplorer` cuidará da interação.
export default function CuriosityPage({ params }: CuriosityPageProps) {
  const { categoryId } = params;

  const category = getCategoryById(categoryId);
  const curiosities = getCuriositiesByCategoryId(categoryId);

  if (!category) {
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
        {/* O CuriosityExplorer agora recebe os dados estáticos como props */}
        <CuriosityExplorer 
            category={category} 
            curiosities={curiosities}
        />
    </div>
  );
}
