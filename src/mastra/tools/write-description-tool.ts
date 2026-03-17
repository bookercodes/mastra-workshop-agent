import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { descriptionWriterAgent } from '../agents/description-writer-agent';

export const writeDescriptionTool = createTool({
  id: 'write-description',
  description: 'Write or refine a workshop description using the description writer agent. The agent remembers previous drafts within the same conversation, so follow-up calls with feedback will refine rather than restart.',
  inputSchema: z.object({
    title: z.string().describe('Workshop title'),
    topic: z.string().optional().describe('Additional topic context or details'),
    feedback: z.string().optional().describe('Feedback on the previous draft to refine it'),
  }),
  outputSchema: z.object({
    description: z.string(),
  }),
  execute: async ({ title, topic, feedback }, { agent }) => {
    const threadId = agent?.threadId
      ? `desc-writer-${agent.threadId}`
      : `desc-writer-${Date.now()}`;
    const resourceId = 'description-writer';

    let prompt: string;
    if (feedback) {
      prompt = feedback;
    } else {
      const parts = [`Write a workshop description for: "${title}"`];
      if (topic) {
        parts.push(`Additional context: ${topic}`);
      }
      prompt = parts.join('\n\n');
    }

    const response = await descriptionWriterAgent.generate(prompt, {
      memory: { thread: threadId, resource: resourceId },
    });

    return { description: response.text };
  },
});
