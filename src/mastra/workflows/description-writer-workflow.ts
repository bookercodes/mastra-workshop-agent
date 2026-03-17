import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { descriptionWriterAgent } from "../agents/description-writer-agent";

const reviewOutputSchema = z.object({
  description: z.string(),
  approved: z.boolean(),
});

const generateDescription = createStep({
  id: "generate-description",
  inputSchema: z.object({
    title: z.string(),
    topic: z.string().optional(),
  }),
  outputSchema: reviewOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent("descriptionWriterAgent");
    const parts = [`Write a workshop description for: "${inputData.title}"`];
    if (inputData.topic) {
      parts.push(`Additional context: ${inputData.topic}`);
    }
    const response = await agent.generate(parts.join("\n\n"));
    return { description: response.text, approved: false };
  },
});

const reviewDescription = createStep({
  id: "review-description",
  inputSchema: reviewOutputSchema,
  outputSchema: reviewOutputSchema,
  resumeSchema: z.object({
    approved: z.boolean().optional().default(false),
    feedback: z.string().optional().describe("Feedback to refine the description"),
  }),
  suspendSchema: z.object({
    description: z.string().describe("The generated description for review"),
  }),
  execute: async ({ inputData, resumeData, suspend, mastra }) => {
    const { approved, feedback } = resumeData ?? {};

    if (approved) {
      return { description: inputData.description, approved: true };
    }

    if (feedback) {
      const agent = mastra.getAgent("descriptionWriterAgent");
      const response = await agent.generate(
        `Here is the current description:\n\n${inputData.description}\n\nFeedback: ${feedback}`,
      );
      return { description: response.text, approved: false };
    }

    return await suspend({ description: inputData.description });
  },
});

export const descriptionWriterWorkflow = createWorkflow({
  id: "description-writer-workflow",
  inputSchema: z.object({
    title: z.string().describe("Workshop title"),
    topic: z.string().optional().describe("Additional topic context or details"),
  }),
  outputSchema: reviewOutputSchema,
})
  .then(generateDescription)
  .dountil(
    reviewDescription,
    async ({ inputData }) => inputData.approved === true,
  )
  .commit();
