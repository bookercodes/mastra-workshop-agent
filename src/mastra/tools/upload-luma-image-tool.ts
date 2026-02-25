import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const LUMA_API_BASE = 'https://public-api.luma.com/v1';

interface UploadUrlResponse {
  upload_url: string;
  file_url: string;
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

async function createImageUploadUrl(): Promise<UploadUrlResponse> {
  const response = await fetch(`${LUMA_API_BASE}/images/create-upload-url`, {
    method: 'POST',
    headers: getLumaHeaders(),
    body: JSON.stringify({ purpose: 'event-cover' }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create image upload URL: ${response.statusText}`);
  }

  return response.json() as Promise<UploadUrlResponse>;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: Blob } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL format. Expected: data:<mime-type>;base64,<data>');
  }
  const buffer = Buffer.from(match[2], 'base64');
  return {
    mimeType: match[1],
    data: new Blob([buffer], { type: match[1] }),
  };
}

export const uploadLumaImageTool = createTool({
  id: 'upload-luma-image',
  description: 'Upload an image to Luma CDN. Returns a URL that can be used as a cover image when creating or updating events.',
  inputSchema: z.object({
    imageData: z.string().describe('Base64 data URL (e.g., data:image/png;base64,...)'),
  }),
  outputSchema: z.object({
    imageUrl: z.string().describe('Luma CDN URL for the uploaded image'),
  }),
  execute: async ({ imageData }) => {
    const { mimeType, data } = parseDataUrl(imageData);

    const { upload_url, file_url } = await createImageUploadUrl();

    const response = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      body: data as BodyInit,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload image: ${response.statusText}`);
    }

    return {
      imageUrl: file_url,
    };
  },
});
