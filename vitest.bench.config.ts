import { defineConfig } from "vitest/config";
import { environmentProjects } from "./vitest.projects.ts";

/**
 * Benchmark run: not part of `npm test`.
 *
 * One scenario per test file, so Vitest gives every scenario a fresh DOM environment. Files run
 * sequentially in one worker (`fileParallelism: false`) and `scripts/bench.mjs` runs one
 * environment at a time, so the two DOM implementations never compete for CPU.
 */
export default defineConfig({
  test: {
    projects: environmentProjects({
      include: ["bench/scenarios/*.bench.tsx"],
      setupFiles: ["./tests/setup.ts"],
      test: {
        fileParallelism: false,
        maxWorkers: 1,
        minWorkers: 1,
        testTimeout: 180_000,
        hookTimeout: 180_000,
        sequence: { shuffle: false },
      },
    }),
  },
});
