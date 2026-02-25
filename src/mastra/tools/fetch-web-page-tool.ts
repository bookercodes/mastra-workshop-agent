import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const fetchWebPageTool = createTool({
  id: 'fetch-web-page',
  description: 'Fetch the content of a web page. Returns the text content (HTML stripped).',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to fetch'),
  }),
  outputSchema: z.object({
    content: z.string().describe('The text content of the page'),
    title: z.string().optional().describe('The page title if found'),
  }),
  execute: async ({ url }) => {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MastraBot/1.0)',
        'Accept': 'text/markdown,text/plain,text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // If it's plain text or markdown, return as-is
    if (contentType.includes('text/plain') || contentType.includes('text/markdown')) {
      return { content: text };
    }

    // Strip HTML tags for basic text extraction
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    // Remove script and style elements, then strip remaining tags
    const content = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { content, title };
  },
});
