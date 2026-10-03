import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "fixtures/**/*.test.ts"],
    passWithNoTests: true,
  },
});
