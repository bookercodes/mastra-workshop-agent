import { Eval, initDataset, loadParameters } from "braintrust";
import { randomUUID } from "node:crypto";
import { mastra } from "../src/mastra";
import { evalConfig } from "./eval-config";
import { workshopDescriptionScorer } from "./workshop-description-scorer";
import { workshopFormatScorer } from "./workshop-format-scorer";
import { workshopTopicScorer } from "./workshop-topic-scorer";

const projectName = process.env.BRAINTRUST_PROJECT_NAME || "workshop-agent";

Eval(projectName, {
  data: initDataset(projectName, {
    dataset: "Workshop topics",
  }),
  task: async (input, { parameters }) => {
    const agent = mastra.getAgentById("event-agent");
    const message = typeof input === "string" ? input : JSON.stringify(input);
    const response = await agent.generate(message, {
      model: `openai/${parameters.model}`,
      memory: {
        resource: "braintrust-eval",
        thread: randomUUID(),
      },
    });

    return response.text;
  },
  scores: [workshopDescriptionScorer, workshopFormatScorer, workshopTopicScorer],
  parameters: loadParameters<typeof evalConfig>({
    projectName,
    slug: "event-agent",
  }),
});
