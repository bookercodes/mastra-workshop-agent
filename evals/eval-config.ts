import * as braintrust from "braintrust";

const projectName = process.env.BRAINTRUST_PROJECT_NAME || "workshop-agent";

const project = braintrust.projects.create({
  name: projectName,
});

export const evalConfig = project.parameters.create({
  name: "Event agent parameters",
  slug: "event-agent",
  description: "Model configuration for the event agent",
  schema: {
    model: {
      type: "model",
      default: "gpt-5.6-sol",
      description: "Model to evaluate",
    },
  },
  metadata: { version: "1.0" },
});
