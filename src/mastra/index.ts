import { Mastra } from "@mastra/core/mastra";
import { eventAgent } from "./agents/event-agent";
import logger from "./config/logger";
import observability from "./config/observability";
import storage from "./config/storage";

export const mastra = new Mastra({
  agents: {
    "event-agent": eventAgent,
  },
  logger,
  observability,
  storage,
});
