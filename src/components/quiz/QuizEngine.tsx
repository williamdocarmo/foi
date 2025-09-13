"use client";

import { useState, useEffect, useCallback } from "react";
import type { Category, QuizQuestion } from "@/lib/types";
import { useGameStats } from "@/hooks/useGameStats";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, Clock, Award, Target, Repeat, Home, HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

type QuizEngineProps = {
  category: Category;
  questions: QuizQuestion[];
};

const QUESTION_TIME = 60; 
const DELAY_AFTER_CORRECT_MS = 2000;
const DELAY_AFTER_WRONG_MS = 10000;


export default function QuizEngine({ category, questions }: QuizEngineProps) {
  const [gameState, setGameState] = useState<'playing' | 'finished'>('playing');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [isAnswered, setIsAnswered] = useState(false);
  const [totalTime, setTotalTime] = useState(0);
  const [correctAnswersCount, setCorrectAnswersCount] = useState(0);
  
  const { stats, addQuizResult, updateStats } = useGameStats();
  const isOnline = useOnlineStatus();

  const [shuffledQuestions, setShuffledQuestions] = useState<QuizQuestion[]>([]);

  useEffect(() => {
    // Avoid hydration mismatch by shuffling on the client
    if (questions.length > 0) {
        setShuffledQuestions([...questions].sort(() => Math.random() - 0.5));
    }
  }, [questions]);

  const currentQuestion = shuffledQuestions[currentQuestionIndex];

  const handleNextQuestion = useCallback(() => {
    setIsAnswered(false);
    setSelectedAnswer(null);
    if (currentQuestionIndex < shuffledQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setTimeLeft(QUESTION_TIME);
    } else {
      setGameState('finished');
      addQuizResult(category.id, score);
    }
  }, [currentQuestionIndex, shuffledQuestions.length, category.id, score, addQuizResult]);

  useEffect(() => {
    if (gameState !== 'playing' || isAnswered || shuffledQuestions.length === 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsAnswered(true); // Times up
          setTotalTime(t => t + (QUESTION_TIME - (prev - 1)))
          setTimeout(handleNextQuestion, DELAY_AFTER_WRONG_MS); // User didn't answer, treat as wrong
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentQuestionIndex, gameState, isAnswered, handleNextQuestion, shuffledQuestions.length]);
  
  const handleAnswerSelect = async (option: string) => {
    if (isAnswered) return;

    setIsAnswered(true);
    setSelectedAnswer(option);
    const timeTaken = QUESTION_TIME - timeLeft;
    setTotalTime(t => t + timeTaken);

    const isCorrect = option === currentQuestion.correctAnswer;
    let delay = isCorrect ? DELAY_AFTER_CORRECT_MS : DELAY_AFTER_WRONG_MS;

    if (isCorrect) {
      setScore(prev => prev + 10 + timeLeft);
      setCorrectAnswersCount(prev => prev + 1);
    }

    setTimeout(handleNextQuestion, delay);
  };
  
  const useCombo = () => {
    if (stats.combos > 0) {
      updateStats({ combos: stats.combos - 1 });
      handleAnswerSelect(currentQuestion.correctAnswer);
    }
  }

  const restartQuiz = () => {
    setGameState('playing');
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setScore(0);
    setTimeLeft(QUESTION_TIME);
    setIsAnswered(false);
    setTotalTime(0);
    setCorrectAnswersCount(0);
    setShuffledQuestions([]); 
    setTimeout(() => setShuffledQuestions([...questions].sort(() => Math.random() - 0.5)), 0);
  }

  if (questions.length === 0) {
     return (
        <Card className="w-full max-w-lg text-center animate-bounce-in">
            <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2 font-headline text-3xl">
                    <HelpCircle className="h-8 w-8 text-accent"/>
                    Quiz em Breve!
                </CardTitle>
                <CardDescription>Ainda não há perguntas para a categoria {category.name}.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">Nosso gerador de conteúdo está trabalhando. Volte mais tarde para testar seus conhecimentos!</p>
            </CardContent>
            <CardFooter>
                 <Button asChild className="w-full">
                    <Link href="/">
                        <Home className="mr-2 h-4 w-4" />
                        Voltar para o Início
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    );
  }
  
  if (shuffledQuestions.length === 0) {
    return (
        <Card className="w-full max-w-2xl">
             <CardHeader>
                <CardTitle className="font-headline text-2xl">{category.name}</CardTitle>
                 <CardDescription className="pt-2 text-center">Preparando seu desafio...</CardDescription>
            </CardHeader>
            <CardContent className="p-6 text-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Embaralhando perguntas...</p>
                </div>
            </CardContent>
        </Card>
    )
  }


  if (gameState === 'finished') {
    return (
        <Card className="w-full max-w-lg text-center animate-bounce-in">
            <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2 font-headline text-3xl">
                    <Award className="h-8 w-8 text-accent"/>
                    Quiz Concluído!
                </CardTitle>
                <CardDescription>Veja seu desempenho em {category.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted p-6">
                    <p className="text-lg text-muted-foreground">Sua Pontuação Final</p>
                    <p className="text-6xl font-bold text-primary">{score}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-left">
                     <div className="flex items-center gap-2 rounded-lg bg-muted p-4">
                        <Target className="h-6 w-6 text-green-500" />
                        <div>
                            <p className="font-bold">{correctAnswersCount} / {shuffledQuestions.length}</p>
                            <p className="text-sm text-muted-foreground">Acertos</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-2 rounded-lg bg-muted p-4">
                        <Clock className="h-6 w-6 text-blue-500" />
                        <div>
                            <p className="font-bold">{totalTime}s</p>
                            <p className="text-sm text-muted-foreground">Tempo Total</p>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex-col gap-2 sm:flex-row">
                 <Button onClick={restartQuiz} className="w-full">
                    <Repeat className="mr-2 h-4 w-4" />
                    Jogar Novamente
                </Button>
                <Button variant="outline" asChild className="w-full">
                    <Link href="/">
                        <Home className="mr-2 h-4 w-4" />
                        Página Inicial
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    );
  }


  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
            <CardTitle className="font-headline text-2xl">{category.name}</CardTitle>
            <div className="flex items-center gap-2 font-mono text-lg font-bold text-primary">
                <Clock className="h-5 w-5" />
                <span>{timeLeft}</span>
            </div>
        </div>
        <Progress value={( (currentQuestionIndex + 1) / shuffledQuestions.length) * 100} className="mt-2" />
        <CardDescription className="pt-2 text-center">Pergunta {currentQuestionIndex + 1}</CardDescription>
      </CardHeader>
      <CardContent className="p-6 text-center">
        <p className="mb-8 text-xl font-semibold">{currentQuestion.question}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {currentQuestion.options.map((option) => {
             const isCorrect = option === currentQuestion.correctAnswer;
             const isWrong = selectedAnswer === option && !isCorrect;

            return (
              <Button
                key={option}
                variant="outline"
                size="lg"
                className={cn("h-auto min-h-[4rem] justify-start whitespace-normal text-left transition-all duration-300",
                    isAnswered && isCorrect && "border-green-500 bg-green-500/10 text-green-700 transform scale-105",
                    isAnswered && isWrong && "border-destructive bg-destructive/10 text-destructive",
                )}
                onClick={() => handleAnswerSelect(option)}
                disabled={isAnswered}
              >
                <div className="flex w-full items-center justify-between">
                    <span>{option}</span>
                    {isAnswered && isCorrect && <CheckCircle className="h-5 w-5" />}
                    {isAnswered && isWrong && <XCircle className="h-5 w-5" />}
                </div>
              </Button>
            );
          })}
        </div>
         {isAnswered && ! (selectedAnswer === currentQuestion.correctAnswer) && (
             <div className="mt-6 rounded-lg bg-muted p-4 text-sm text-muted-foreground animate-fade-in">
                <p><span className="font-bold">Explicação:</span> {currentQuestion.explanation}</p>
            </div>
         )}
      </CardContent>
       <CardFooter className="flex-col sm:flex-row justify-end gap-2">
        {stats.combos > 0 && !isAnswered && (
            <Button variant="secondary" size="sm" onClick={useCombo} disabled={isAnswered}>
               <HelpCircle className="mr-2 h-4 w-4"/> Usar Combo ({stats.combos})
            </Button>
        )}
      </CardFooter>
    </Card>
  );
}
