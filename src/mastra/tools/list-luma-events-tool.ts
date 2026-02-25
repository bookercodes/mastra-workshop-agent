import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const LUMA_API_BASE = 'https://public-api.luma.com/v1';

interface LumaEvent {
  api_id: string;
  name: string;
  start_at: string;
  end_at: string;
  url: string;
}

interface LumaEventsResponse {
  entries: {
    event: LumaEvent;
  }[];
  has_more: boolean;
  next_cursor?: string;
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

export const listLumaEventsTool = createTool({
  id: 'list-luma-events',
  description: 'List upcoming events from Luma calendar. Use this to find scheduled events and identify available dates.',
  inputSchema: z.object({
    afterDate: z.string().optional().describe('Only return events after this ISO 8601 date'),
    limit: z.number().default(50).describe('Maximum number of events to return (default: 50)'),
  }),
  outputSchema: z.object({
    events: z.array(z.object({
      eventId: z.string(),
      title: z.string(),
      startAt: z.string(),
      endAt: z.string(),
      url: z.string(),
    })),
  }),
  execute: async ({ afterDate, limit }) => {
    const params = new URLSearchParams();
    if (afterDate) {
      params.set('after', afterDate);
    }

    const allEvents: LumaEvent[] = [];
    let cursor: string | undefined;

    while (allEvents.length < limit) {
      const url = cursor
        ? `${LUMA_API_BASE}/calendar/list-events?pagination_cursor=${cursor}`
        : `${LUMA_API_BASE}/calendar/list-events${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: getLumaHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list Luma events: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as LumaEventsResponse;

      for (const entry of data.entries) {
        if (allEvents.length >= limit) break;
        allEvents.push(entry.event);
      }

      if (!data.has_more || allEvents.length >= limit) {
        break;
      }

      cursor = data.next_cursor;
    }

    return {
      events: allEvents.map(event => ({
        eventId: event.api_id,
        title: event.name,
        startAt: event.start_at,
        endAt: event.end_at,
        url: event.url,
      })),
    };
  },
});
