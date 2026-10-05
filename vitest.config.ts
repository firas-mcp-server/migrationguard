import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tests run against core's source, so they do not depend on a prior build.
    alias: {
      "migrationguard-core": fileURLToPath(new URL("packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "fixtures/**/*.test.ts"],
    passWithNoTests: true,
  },
});
