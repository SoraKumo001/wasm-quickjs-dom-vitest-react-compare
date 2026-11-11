import { defineConfig } from "vitest/config";
import { environmentProjects } from "./vitest.projects.ts";

/**
 * Capability probe: records what the test-visible DOM can do under each environment so the two
 * matrices can be diffed (`npm run compare` reads `results/capabilities-*.json`).
 */
export default defineConfig({
  test: {
    projects: environmentProjects({
      include: ["probes/**/*.probe.ts"],
      setupFiles: [],
      test: { fileParallelism: false },
    }),
  },
});
