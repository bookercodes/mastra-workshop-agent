import { channels } from "@mastra/connect";
import { Mastra } from "@mastra/core/mastra";
import { SimpleAuth } from "@mastra/core/server";
import { eventAgent } from "./agents/event-agent";
import logger from "./config/logger";
import observability from "./config/observability";
import storage from "./config/storage";
import { slackChannelHandlers } from "./config/channels";

const connectChannels = await channels({
  providers: {
    slack: {
      providerOptions: {
        handlers: slackChannelHandlers,
      },
    },
  },
});

export const mastra = new Mastra({
  agents: {
    "event-agent": eventAgent,
  },
  channels: connectChannels,
  server: {
    // Reject direct API access; Platform Studio and Slack authenticate separately.
    auth: new SimpleAuth({ tokens: {} }),
  },
  logger,
  observability,
  storage,
});
