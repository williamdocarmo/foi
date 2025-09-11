'use server';

/**
 * @fileOverview AI-powered adaptive learning flow.
 *
 * - adaptLearningPath - A function that analyzes quiz performance, adapts quiz difficulty, and suggests relevant curiosities.
 * - AdaptLearningPathInput - The input type for the adaptLearningPath function.
 * - AdaptLearningPathOutput - The return type for the adaptLearningPath function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AdaptLearningPathInputSchema = z.object({
  quizHistory: z
    .array(
      z.object({
        categoryId: z.string(),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        score: z.number(),
        timeTaken: z.number(),
      })
    )
    .describe('The user quiz history data.'),
  availableCategories: z.array(z.string()).describe('The available curiosity categories.'),
});
export type AdaptLearningPathInput = z.infer<typeof AdaptLearningPathInputSchema>;

const AdaptLearningPathOutputSchema = z.object({
  adaptedDifficulty: z
    .enum(['easy', 'medium', 'hard'])
    .describe('The adapted quiz difficulty based on performance.'),
  suggestedCategories: z
    .array(z.string())
    .describe('The suggested curiosity categories based on quiz history.'),
  explanation: z.string().describe('Explanation of why the difficulty and categories were chosen.'),
});
export type AdaptLearningPathOutput = z.infer<typeof AdaptLearningPathOutputSchema>;

export async function adaptLearningPath(input: AdaptLearningPathInput): Promise<AdaptLearningPathOutput> {
  return adaptLearningPathFlow(input);
}

const prompt = ai.definePrompt({
  name: 'adaptLearningPathPrompt',
  input: {schema: AdaptLearningPathInputSchema},
  output: {schema: AdaptLearningPathOutputSchema},
  prompt: `You are an AI learning path optimizer.

You will analyze the user's quiz history to adapt the quiz difficulty and suggest relevant curiosity categories.

Quiz History: {{{quizHistory}}}
Available Categories: {{{availableCategories}}}

Based on this information, adapt the quiz difficulty to either easy, medium, or hard, and suggest 3 relevant curiosity categories to optimize the user's learning path.
Explain your reasoning.

Output in the following format:
{
  "adaptedDifficulty": "<adapted difficulty>",
  "suggestedCategories": ["<category 1>", "<category 2>", "<category 3>"],
  "explanation": "<explanation>"
}
`,
});

const adaptLearningPathFlow = ai.defineFlow(
  {
    name: 'adaptLearningPathFlow',
    inputSchema: AdaptLearningPathInputSchema,
    outputSchema: AdaptLearningPathOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
