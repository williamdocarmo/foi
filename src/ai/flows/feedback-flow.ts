'use server';

/**
 * @fileOverview An AI flow to generate intelligent feedback for incorrect quiz answers.
 *
 * - getIntelligentFeedback - A function that provides a personalized explanation for a wrong answer.
 * - GetIntelligentFeedbackInput - The input type for the function.
 * - GetIntelligentFeedbackOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const GetIntelligentFeedbackInputSchema = z.object({
  question: z.string().describe('The quiz question that was answered.'),
  correctAnswer: z.string().describe('The correct answer to the question.'),
  userAnswer: z.string().describe('The incorrect answer provided by the user.'),
});
export type GetIntelligentFeedbackInput = z.infer<typeof GetIntelligentFeedbackInputSchema>;

const GetIntelligentFeedbackOutputSchema = z.object({
  intelligentExplanation: z
    .string()
    .describe('A personalized explanation about why the user’s answer was incorrect and why the correct one is right.'),
});
export type GetIntelligentFeedbackOutput = z.infer<typeof GetIntelligentFeedbackOutputSchema>;

export async function getIntelligentFeedback(input: GetIntelligentFeedbackInput): Promise<GetIntelligentFeedbackOutput> {
  return intelligentFeedbackFlow(input);
}

const prompt = ai.definePrompt({
  name: 'intelligentFeedbackPrompt',
  input: {schema: GetIntelligentFeedbackInputSchema},
  output: {schema: GetIntelligentFeedbackOutputSchema},
  prompt: `You are an expert tutor. A user has answered a quiz question incorrectly.
Your task is to provide a brief, encouraging, and intelligent explanation.

The user was asked: "{{question}}"
The correct answer is: "{{correctAnswer}}"
The user incorrectly answered: "{{userAnswer}}"

Generate an explanation that:
1. Briefly acknowledges the user's answer, explaining why it might be a common mistake if applicable.
2. Clearly explains why the correct answer is right.
3. Is concise, friendly, and easy to understand.
4. Keep it to 1-2 sentences.

Example: "Sua resposta 'X' é uma confusão comum! A resposta correta é 'Y' porque..."

Return only the JSON object with the explanation.`,
});

const intelligentFeedbackFlow = ai.defineFlow(
  {
    name: 'intelligentFeedbackFlow',
    inputSchema: GetIntelligentFeedbackInputSchema,
    outputSchema: GetIntelligentFeedbackOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
