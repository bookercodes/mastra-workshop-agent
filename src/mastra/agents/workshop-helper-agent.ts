import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createLumaEventTool } from '../tools/create-luma-event-tool';
import { updateLumaEventTool } from '../tools/update-luma-event-tool';
import { listLumaEventsTool } from '../tools/list-luma-events-tool';
import { getLumaEventTool } from '../tools/get-luma-event-tool';
import { uploadLumaImageTool } from '../tools/upload-luma-image-tool';
import { descriptionWriterAgent } from './description-writer-agent';

export const workshopHelperAgent = new Agent({
  id: 'workshop-helper-agent',
  name: 'Workshop Helper Agent',
  instructions: () => `
You are a workshop assistant that creates and manages Luma events.

Current date/time (UTC): ${new Date().toUTCString()}

## Workshop Defaults

- Day: Thursday
- Time: 17:00 UTC
- Duration: 60 minutes

## Creating an Event

Required: title and at least one host name.

When no date is specified:
1. Call list-luma-events to check existing events
2. Find the next Thursday without an event
3. Use 17:00 UTC as the start time

## Writing Descriptions

When a description is needed:
1. Ask the description-writer-agent to write the description
2. Provide it with the workshop title and topic
3. Use the returned description when creating the event

## Updating Events

Ask for the event ID if not provided. Before making changes, call get-luma-event to see the current event details including the description. This lets you preserve existing information when updating.
`,
  model: 'openai/gpt-4o',
  tools: {
    createLumaEvent: createLumaEventTool,
    updateLumaEvent: updateLumaEventTool,
    listLumaEvents: listLumaEventsTool,
    getLumaEvent: getLumaEventTool,
    uploadLumaImage: uploadLumaImageTool,
  },
  agents: {
    descriptionWriter: descriptionWriterAgent,
  },
  memory: new Memory(),
});
