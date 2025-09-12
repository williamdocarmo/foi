import Image from 'next/image';
import Link from 'next/link';
import { categories, getCategoryById } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { RandomCuriosityButton } from '@/components/shared/RandomCuriosityButton';
import * as LucideIcons from 'lucide-react';
import { HelpCircle, Rocket } from 'lucide-react';

function CategoryCard({ category }: { category: ReturnType<typeof getCategoryById> }) {
  if (!category) return null;

  const Icon = (LucideIcons as any)[category.icon as any] as React.ElementType;

  return (
    <Card className="flex h-full flex-col overflow-hidden transition-transform duration-300 ease-in-out hover:-translate-y-2 hover:shadow-2xl">
      <CardHeader className="flex-grow">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: `${category.color}20` }}
        >
          {Icon && <Icon className="h-8 w-8" style={{ color: category.color }} />}
        </div>
        <CardTitle className="text-center font-headline">{category.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow text-center">
        <p className="text-sm text-muted-foreground">{category.description}</p>
      </CardContent>
      <div className="mt-auto grid grid-cols-2 gap-2 p-4">
        <Button variant="outline" asChild>
          <Link href={`/curiosity/${category.id}`}>
            <Rocket className="mr-2 h-4 w-4" />
            Explorar
          </Link>
        </Button>
        <Button asChild>
          <Link href={`/quiz/${category.id}`}>
            <HelpCircle className="mr-2 h-4 w-4" />
            Quiz
          </Link>
        </Button>
      </div>
    </Card>
  );
}

export default function Home() {
  const heroImage = PlaceHolderImages.find((img) => img.id === 'hero-background');

  return (
    <div className="flex flex-col">
      <section className="relative w-full overflow-hidden bg-background py-20 md:py-32">
        {heroImage && (
          <Image
            src={heroImage.imageUrl}
            alt={heroImage.description}
            fill
            className="object-cover"
            priority
            data-ai-hint={heroImage.imageHint}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-primary/50 to-accent/60 dark:from-primary/90 dark:via-primary/70 dark:to-accent/70" />
        <div className="container relative z-10 flex flex-col items-center text-center">
          <h1 className="animate-bounce-in font-headline text-5xl font-extrabold tracking-tighter text-primary-foreground drop-shadow-lg md:text-7xl">
            Você Sabia?
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-primary-foreground/90 md:text-xl">
            Descubra curiosidades fascinantes, teste seu conhecimento com quizzes e aprenda algo novo todo dia.
          </p>
          <div className="mt-8">
            <RandomCuriosityButton />
          </div>
        </div>
      </section>

      <section className="w-full bg-background py-16 md:py-24">
        <div className="container">
          <h2 className="mb-12 text-center font-headline text-3xl font-bold md:text-4xl">
            Explore as Categorias
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {categories.map((category, index) => (
              <div
                key={category.id}
                className="animate-slide-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CategoryCard category={category} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
