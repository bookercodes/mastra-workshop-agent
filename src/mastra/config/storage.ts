import { LibSQLStore } from "@mastra/libsql";

export default new LibSQLStore({
  id: "mastra-storage",
  url: process.env.TURSO_DATABASE_URL || "file:./mastra.db",
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});
