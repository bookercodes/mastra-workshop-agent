import { createClient, type SanityClient } from '@sanity/client';

export function getSanityClient(): SanityClient {
  const projectId = process.env.SANITY_PROJECT_ID;
  if (!projectId) {
    throw new Error('SANITY_PROJECT_ID environment variable is not set');
  }

  const token = process.env.SANITY_API_TOKEN;
  if (!token) {
    throw new Error('SANITY_API_TOKEN environment variable is not set');
  }

  return createClient({
    projectId,
    dataset: process.env.SANITY_DATASET || 'production',
    apiVersion: '2024-01-01',
    token,
    useCdn: false,
  });
}
