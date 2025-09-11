// src/ai/flows/ai-generated-curiosity.ts
'use server';
/**
 * @fileOverview This file defines a Genkit flow to generate a new curiosity based on a user-selected category using AI.
 *
 * @function generateAICuriosity - Generates a new curiosity using AI based on a specified category.
 * @interface GenerateAICuriosityInput - Defines the input schema for the generateAICuriosity function, including the category ID.
 * @interface GenerateAICuriosityOutput - Defines the output schema for the generateAICuriosity function, including the generated curiosity's title and content.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateAICuriosityInputSchema = z.object({
  categoryId: z
    .string()
    .describe('The ID of the category for which to generate a curiosity.'),
  categoryName: z
    .string()
    .describe('The Name of the category for which to generate a curiosity.'),
});
export type GenerateAICuriosityInput = z.infer<typeof GenerateAICuriosityInputSchema>;

const GenerateAICuriosityOutputSchema = z.object({
  title: z.string().describe('The title of the generated curiosity.'),
  content: z.string().describe('The content of the generated curiosity.'),
  funFact: z.string().optional().describe('A fun fact related to the generated curiosity.'),
});
export type GenerateAICuriosityOutput = z.infer<typeof GenerateAICuriosityOutputSchema>;

export async function generateAICuriosity(input: GenerateAICuriosityInput): Promise<GenerateAICuriosityOutput> {
  return generateAICuriosityFlow(input);
}

const generateAICuriosityPrompt = ai.definePrompt({
  name: 'generateAICuriosityPrompt',
  input: {schema: GenerateAICuriosityInputSchema},
  output: {schema: GenerateAICuriosityOutputSchema},
  prompt: `You are an AI that generates interesting and novel curiosities.

  The curiosity should be related to the category: {{categoryName}} (ID: {{categoryId}}).

  The curiosity should have a title, content, and optionally, a fun fact.

  Please generate a new curiosity. The style should be very engaging and suited for the mobile app called 'Foi uma ideia 💡'.`,
});

const generateAICuriosityFlow = ai.defineFlow(
  {
    name: 'generateAICuriosityFlow',
    inputSchema: GenerateAICuriosityInputSchema,
    outputSchema: GenerateAICuriosityOutputSchema,
  },
  async input => {
    const {output} = await generateAICuriosityPrompt(input);
    return output!;
  }
);
