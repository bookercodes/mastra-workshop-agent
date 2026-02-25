import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const LUMA_API_BASE = 'https://public-api.luma.com/v1';

interface LumaEventDetails {
  event: {
    api_id: string;
    name: string;
    description_md: string;
    start_at: string;
    end_at: string;
    url: string;
    cover_url?: string;
    timezone: string;
  };
}

function getLumaHeaders(): Record<string, string> {
  const apiKey = process.env.LUMA_API_KEY;
  if (!apiKey) {
    throw new Error('LUMA_API_KEY environment variable is not set');
  }
  return {
    'accept': 'application/json',
    'content-type': 'application/json',
    'x-luma-api-key': apiKey,
  };
}

export const getLumaEventTool = createTool({
  id: 'get-luma-event',
  description: 'Get full details of a Luma event including its description. Use this before updating an event to see what information is already there.',
  inputSchema: z.object({
    eventId: z.string().describe('Luma API ID of the event'),
  }),
  outputSchema: z.object({
    eventId: z.string(),
    title: z.string(),
    description: z.string(),
    startAt: z.string(),
    endAt: z.string(),
    url: z.string(),
    coverUrl: z.string().optional(),
    timezone: z.string(),
  }),
  execute: async ({ eventId }) => {
    const response = await fetch(`${LUMA_API_BASE}/event/get?id=${eventId}`, {
      method: 'GET',
      headers: getLumaHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Luma event: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as LumaEventDetails;
    const event = data.event;

    return {
      eventId: event.api_id,
      title: event.name,
      description: event.description_md,
      startAt: event.start_at,
      endAt: event.end_at,
      url: event.url,
      coverUrl: event.cover_url,
      timezone: event.timezone,
    };
  },
});
