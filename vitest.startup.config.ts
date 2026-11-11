import { defineConfig } from "vitest/config";
import { environmentProjects } from "./vitest.projects.ts";

/**
 * Startup suite: N identical tiny test files, used to measure how much it costs to create the DOM
 * environment once per test file. Includes a `node` project as a baseline so the DOM environment's
 * share can be separated from Vitest's own overhead.
 *
 * STARTUP_MODE=serial   (default) one worker, files one after another -> exposes the per-file cost
 * STARTUP_MODE=parallel           Vitest's default file parallelism -> what a normal suite run does
 */
const mode = process.env.STARTUP_MODE === "parallel" ? "parallel" : "serial";
const include = ["bench/generated/*.case.ts"];
const serialism =
  mode === "serial" ? { fileParallelism: false, maxWorkers: 1, minWorkers: 1 } : {};

export default defineConfig({
  test: {
    projects: [
      ...environmentProjects({
        include,
        setupFiles: [],
        test: serialism,
      }),
      {
        test: {
          name: "node",
          environment: "node",
          include,
          env: { TEST_ENV: "node" },
          ...serialism,
        },
      },
    ],
  },
});
