import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { addMinutes } from 'date-fns';

const LUMA_API_BASE = 'https://public-api.luma.com/v1';
const DEFAULT_COVER_IMAGE_URL = 'https://images.lumacdn.com/event-covers/g3/9cd7b6f5-3556-4a1b-8985-3cbdb27e3a33.png';

const hostSchema = z.object({
  name: z.string().describe('Host name'),
  role: z.string().optional().describe('Host role/title'),
  xHandle: z.string().optional().describe('X (Twitter) handle without @'),
  linkedinUrl: z.string().optional().describe('LinkedIn profile URL'),
});

interface UploadUrlResponse {
  upload_url: string;
  file_url: string;
}

interface LumaEventResponse {
  api_id: string;
}

interface LumaEventDetails {
  event: {
    url: string;
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

function buildHostsSection(hosts: z.infer<typeof hostSchema>[]): string {
  return hosts.map(host => {
    const lines: string[] = [];
    const nameAndRole = host.role ? `${host.name}, ${host.role}` : host.name;
    lines.push(nameAndRole);
    if (host.xHandle) {
      lines.push(`x.com/${host.xHandle}`);
    }
    if (host.linkedinUrl) {
      lines.push(host.linkedinUrl);
    }
    return lines.join('\n');
  }).join('\n\n');
}

function buildDescription(
  hosts: z.infer<typeof hostSchema>[],
  customDescription?: string
): string {
  const parts: string[] = [];

  if (customDescription) {
    parts.push(customDescription);
  }

  parts.push('---');
  parts.push('**Hosted by**');
  parts.push('');
  parts.push(buildHostsSection(hosts));
  parts.push('');
  parts.push('Recording and code examples will be available to everyone who registers.');

  return parts.join('\n');
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

async function downloadImage(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image from ${url}: ${response.statusText}`);
  }
  return response.arrayBuffer();
}

async function uploadCoverImage(uploadUrl: string, imageData: ArrayBuffer): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png',
    },
    body: imageData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload cover image: ${response.statusText}`);
  }
}

async function getEventUrl(apiId: string): Promise<string> {
  const response = await fetch(`${LUMA_API_BASE}/event/get?id=${apiId}`, {
    method: 'GET',
    headers: getLumaHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to get event details: ${response.statusText}`);
  }

  const data = await response.json() as LumaEventDetails;
  return data.event.url;
}

export const createLumaEventTool = createTool({
  id: 'create-luma-event',
  description: 'Create a new event on Luma for a workshop',
  requireApproval: true,
  inputSchema: z.object({
    title: z.string().describe('Workshop title'),
    hosts: z.array(hostSchema).min(1).describe('Array of hosts for the workshop'),
    description: z.string().optional().describe('Custom description body (hosts section is auto-generated)'),
    startAt: z.string().describe('Start date and time in ISO 8601 format'),
    duration: z.number().default(60).describe('Duration in minutes (default: 60)'),
    coverImageUrl: z.string().optional().describe('URL to an image to use as the event cover'),
  }),
  outputSchema: z.object({
    eventId: z.string().describe('Luma API ID for the event'),
    eventUrl: z.string().describe('Public URL for the event'),
  }),
  execute: async ({ title, hosts, description, startAt, duration, coverImageUrl }) => {
    const startDate = new Date(startAt);
    const endDate = addMinutes(startDate, duration);
    const fullDescription = buildDescription(hosts, description);

    console.log('Creating event with description:', fullDescription);

    let coverUrl: string;
    if (coverImageUrl) {
      const { upload_url, file_url } = await createImageUploadUrl();
      const imageData = await downloadImage(coverImageUrl);
      await uploadCoverImage(upload_url, imageData);
      coverUrl = file_url;
    } else {
      coverUrl = DEFAULT_COVER_IMAGE_URL;
    }

    const meetingUrl = process.env.WORKSHOP_MEETING_URL;

    const response = await fetch(`${LUMA_API_BASE}/event/create`, {
      method: 'POST',
      headers: getLumaHeaders(),
      body: JSON.stringify({
        name: title,
        description_md: fullDescription,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        timezone: 'Europe/London',
        cover_url: coverUrl,
        visibility: 'public',
        meeting_url: meetingUrl,
        tint_color: '#D3D4D7',
        show_guest_list: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Luma event: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as LumaEventResponse;
    const eventUrl = await getEventUrl(data.api_id);

    return {
      eventId: data.api_id,
      eventUrl,
    };
  },
});
