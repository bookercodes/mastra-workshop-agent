import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { addMinutes } from 'date-fns';

const LUMA_API_BASE = 'https://public-api.luma.com/v1';

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

export const updateLumaEventTool = createTool({
  id: 'update-luma-event',
  description: 'Update an existing event on Luma',
  requireApproval: true,
  inputSchema: z.object({
    eventId: z.string().describe('Luma API ID of the event to update'),
    title: z.string().optional().describe('New workshop title'),
    hosts: z.array(hostSchema).optional().describe('New array of hosts for the workshop'),
    description: z.string().optional().describe('New custom description body'),
    startAt: z.string().optional().describe('New start date and time in ISO 8601 format'),
    duration: z.number().optional().describe('New duration in minutes'),
    coverImageUrl: z.string().optional().describe('URL to a new image to use as the event cover'),
  }),
  outputSchema: z.object({
    eventId: z.string().describe('Luma API ID for the event'),
    eventUrl: z.string().describe('Public URL for the event'),
    updatedFields: z.array(z.string()).describe('List of fields that were updated'),
  }),
  execute: async ({ eventId, title, hosts, description, startAt, duration, coverImageUrl }) => {
    const updatePayload: Record<string, unknown> = {};
    const updatedFields: string[] = [];

    if (title !== undefined) {
      updatePayload.name = title;
      updatedFields.push('title');
    }

    if (hosts !== undefined || description !== undefined) {
      // If either hosts or description is provided, we need to rebuild the full description
      // For simplicity, we require hosts if description needs to be updated
      if (hosts !== undefined) {
        updatePayload.description_md = buildDescription(hosts, description);
        updatedFields.push('description');
        if (!updatedFields.includes('hosts')) {
          updatedFields.push('hosts');
        }
      } else if (description !== undefined) {
        // Description without hosts - just update the description part
        // Note: This will lose the hosts section formatting. Ideally hosts should always be provided.
        updatePayload.description_md = description;
        updatedFields.push('description');
      }
    }

    if (startAt !== undefined) {
      const startDate = new Date(startAt);
      updatePayload.start_at = startDate.toISOString();
      updatedFields.push('startAt');

      if (duration !== undefined) {
        const endDate = addMinutes(startDate, duration);
        updatePayload.end_at = endDate.toISOString();
        updatedFields.push('duration');
      }
    } else if (duration !== undefined) {
      // Duration provided but no startAt - we'd need to fetch current start time
      // For now, just note that duration was requested but couldn't be updated without startAt
      console.warn('Duration update requires startAt to be provided as well');
    }

    if (coverImageUrl !== undefined) {
      const { upload_url, file_url } = await createImageUploadUrl();
      const imageData = await downloadImage(coverImageUrl);
      await uploadCoverImage(upload_url, imageData);
      updatePayload.cover_url = file_url;
      updatedFields.push('coverImage');
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new Error('No fields to update. Provide at least one field to change.');
    }

    const response = await fetch(`${LUMA_API_BASE}/event/update`, {
      method: 'POST',
      headers: getLumaHeaders(),
      body: JSON.stringify({
        event_api_id: eventId,
        ...updatePayload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update Luma event: ${response.statusText} - ${errorText}`);
    }

    const eventUrl = await getEventUrl(eventId);

    return {
      eventId,
      eventUrl,
      updatedFields,
    };
  },
});
