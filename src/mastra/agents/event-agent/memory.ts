import { Memory } from "@mastra/memory";

export default new Memory({
  options: {
    observationalMemory: {
      model: "openai/gpt-5.6-sol",
      scope: "thread",
      observation: {
        messageTokens: 60000,
      },
      reflection: {
        observationTokens: 20000,
      },
    },
  },
});
