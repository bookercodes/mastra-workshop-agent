import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { createLumaEventTool } from "../tools/create-luma-event-tool";
import { updateLumaEventTool } from "../tools/update-luma-event-tool";
import { listLumaEventsTool } from "../tools/list-luma-events-tool";
import { getLumaEventTool } from "../tools/get-luma-event-tool";
import { uploadLumaImageTool } from "../tools/upload-luma-image-tool";
import { searchSanityGuestsTool } from "../tools/search-sanity-guests-tool";
import { createSanityGuestTool } from "../tools/create-sanity-guest-tool";
import { descriptionWriterAgent } from "./description-writer-agent";

export const workshopHelperAgent = new Agent({
  id: "workshop-helper-agent",
  name: "Workshop Helper Agent",
  instructions: () => `
You are a workshop assistant that creates and manages Luma events.

Current date/time (UTC): ${new Date().toUTCString()}

## Workshop Defaults

- Day: Thursday
- Time: 17:00 UTC
- Duration: 60 minutes

## Creating an Event

Required: title and at least one host name.

## Host Lookup

When the user mentions host names:
1. Search Sanity CMS first using search-sanity-guests
2. Present matching results for the user to confirm
3. If no match is found, ask for details (company, xHandle, website) and offer to create the guest in Sanity using create-sanity-guest
4. Use the confirmed guest data when creating or updating the Luma event
5. Never fabricate host details — always look up or ask

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
  model: "openai/gpt-5.2",
  tools: {
    createLumaEvent: createLumaEventTool,
    updateLumaEvent: updateLumaEventTool,
    listLumaEvents: listLumaEventsTool,
    getLumaEvent: getLumaEventTool,
    uploadLumaImage: uploadLumaImageTool,
    searchSanityGuests: searchSanityGuestsTool,
    createSanityGuest: createSanityGuestTool,
  },
  agents: {
    descriptionWriter: descriptionWriterAgent,
  },
  defaultOptions: {
    requireToolApproval: true,
  },
  memory: new Memory({
    options: {
      observationalMemory: {
        model: "openai/gpt-5.2",
      },
    },
  }),
});
