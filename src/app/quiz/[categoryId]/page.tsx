import { getCategoryById, getQuizQuestionsByCategoryId } from "@/lib/data";
import { notFound } from "next/navigation";
import QuizEngine from "@/components/quiz/QuizEngine";

type QuizPageProps = {
  params: { categoryId: string };
};

export default function QuizPage({ params }: QuizPageProps) {
  const { categoryId } = params;
  const category = getCategoryById(categoryId);
  const questions = getQuizQuestionsByCategoryId(categoryId);

  if (!category) {
    notFound();
  }

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center py-8">
      <QuizEngine category={category} questions={questions} />
    </div>
  );
}
