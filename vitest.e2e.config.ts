import { defineConfig } from "vitest/config";

// Runs against the built CLI and MCP server, so `pnpm build` must run first.
export default defineConfig({
  test: { include: ["e2e/**/*.test.ts"], testTimeout: 30_000 },
});
