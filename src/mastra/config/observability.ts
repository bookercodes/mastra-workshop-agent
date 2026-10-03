import { Observability, SensitiveDataFilter } from "@mastra/observability";
import { BraintrustExporter } from "@mastra/braintrust";

const projectName = process.env.BRAINTRUST_PROJECT_NAME || "workshop-agent";

export default new Observability({
  configs: {
    default: {
      serviceName: "workshop-agent",
      exporters: [
        new BraintrustExporter({
          projectName,
        }),
      ],
      spanOutputProcessors: [new SensitiveDataFilter()],
    },
  },
});
