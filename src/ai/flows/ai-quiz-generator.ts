'use server';

/**
 * @fileOverview An AI quiz generator that creates personalized quiz questions based on user-read curiosities.
 *
 * - generateQuiz - A function that generates a quiz based on provided curiosities.
 * - GenerateQuizInput - The input type for the generateQuiz function.
 * - GenerateQuizOutput - The return type for the generateQuiz function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateQuizInputSchema = z.object({
  curiosities: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
      })
    )
    .describe('An array of curiosities the user has read.'),
  quizSize: z.number().default(5).describe('The number of questions in the quiz.'),
});
export type GenerateQuizInput = z.infer<typeof GenerateQuizInputSchema>;

const GenerateQuizOutputSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctAnswer: z.string(),
      explanation: z.string().optional(),
    })
  ),
});
export type GenerateQuizOutput = z.infer<typeof GenerateQuizOutputSchema>;

export async function generateQuiz(input: GenerateQuizInput): Promise<GenerateQuizOutput> {
  return generateQuizFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateQuizPrompt',
  input: {schema: GenerateQuizInputSchema},
  output: {schema: GenerateQuizOutputSchema},
  prompt: `You are an expert quiz generator. You will generate a quiz based on the curiosities the user has read.

The quiz should have {{{quizSize}}} questions. Each question should have 4 options, one of which is the correct answer.
For each question, provide an explanation of the correct answer.

Curiosities:
{{#each curiosities}}
  Title: {{{title}}}
  Content: {{{content}}}
{{/each}}

Output the quiz in JSON format.
`,
});

const generateQuizFlow = ai.defineFlow(
  {
    name: 'generateQuizFlow',
    inputSchema: GenerateQuizInputSchema,
    outputSchema: GenerateQuizOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
