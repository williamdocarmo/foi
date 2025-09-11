'use server';

/**
 * @fileOverview A Genkit flow to fetch and rank top users.
 *
 * - getTopUsers - Fetches a list of top users based on the total curiosities read.
 * - GetTopUsersInput - The input type for the getTopUsers function.
 * - GetTopUsersOutput - The return type for the getTopUsers function.
 */

import { ai } from '@/ai/genkit';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { z } from 'zod';

const GetTopUsersInputSchema = z.object({
  count: z.number().default(5).describe('The number of top users to fetch.'),
});
export type GetTopUsersInput = z.infer<typeof GetTopUsersInputSchema>;

const GetTopUsersOutputSchema = z.object({
  users: z.array(
    z.object({
      rank: z.number(),
      name: z.string(),
      curiositiesRead: z.number(),
      photoURL: z.string().optional(),
    })
  ),
});
export type GetTopUsersOutput = z.infer<typeof GetTopUsersOutputSchema>;

async function fetchTopUsersFromFirestore(count: number): Promise<GetTopUsersOutput> {
  try {
    const usersRef = collection(db, 'userStats');
    const q = query(usersRef, orderBy('totalCuriositiesRead', 'desc'), limit(count));
    const querySnapshot = await getDocs(q);

    const users = querySnapshot.docs.map((doc, index) => {
      const data = doc.data();
      return {
        rank: index + 1,
        // We need user display name, which isn't in userStats.
        // For now, we use a placeholder. A more robust solution
        // would be to store displayName in the userStats doc.
        name: data.displayName || `Explorador #${index + 1}`,
        curiositiesRead: data.totalCuriositiesRead || 0,
        photoURL: data.photoURL || undefined,
      };
    });

    return { users };
  } catch (error) {
    console.error("Error fetching top users from Firestore:", error);
    // Return empty array in case of error
    return { users: [] };
  }
}

const getTopUsersFlow = ai.defineFlow(
  {
    name: 'getTopUsersFlow',
    inputSchema: GetTopUsersInputSchema,
    outputSchema: GetTopUsersOutputSchema,
  },
  async ({ count }) => {
    return await fetchTopUsersFromFirestore(count);
  }
);


export async function getTopUsers(input: GetTopUsersInput): Promise<GetTopUsersOutput> {
    return getTopUsersFlow(input);
}
