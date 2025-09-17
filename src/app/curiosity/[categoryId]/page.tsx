
import { getCategoryById, getCuriositiesByCategoryId, categories } from "@/lib/data";
import { notFound } from "next/navigation";
import CuriosityExplorer from "@/components/curiosity/CuriosityExplorer";

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
        {/* O CuriosityExplorer agora recebe os dados estáticos como props */}
        <CuriosityExplorer 
            category={category} 
            curiosities={curiosities}
        />
    </div>
  );
}
