import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSanityClient } from '../lib/sanity-client';

const guestSchema = z.object({
  _id: z.string(),
  name: z.string(),
  company: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  xHandle: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
});

export const searchSanityGuestsTool = createTool({
  id: 'search-sanity-guests',
  description: 'Search for guests in Sanity CMS by name or partial name',
  inputSchema: z.object({
    query: z.string().describe('Name or partial name to search for'),
  }),
  outputSchema: z.object({
    guests: z.array(guestSchema),
  }),
  execute: async ({ query }) => {
    const client = getSanityClient();
    const guests = await client.fetch(
      `*[_type == "guest" && name match $query]{
        _id,
        name,
        company,
        "slug": slug.current,
        xHandle,
        website
      }`,
      { query: `${query}*` },
    );

    return { guests };
  },
});
