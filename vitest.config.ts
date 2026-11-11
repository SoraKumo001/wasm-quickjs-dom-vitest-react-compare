import { defineConfig } from "vitest/config";
import { environmentProjects } from "./vitest.projects.ts";

/**
 * Correctness suite: identical React tests, run under both DOM environments.
 *
 *   npx vitest run                    # both projects
 *   npx vitest run --project jsdom    # only jsdom
 *   npx vitest run --project wasm-quickjs-dom
 */
export default defineConfig({
  test: {
    projects: environmentProjects({
      include: ["tests/**/*.test.{ts,tsx}"],
      setupFiles: ["./tests/setup.ts"],
      test: {
        // React 19 + act(): keep the default `act` environment used by @testing-library/react.
        restoreMocks: true,
      },
    }),
  },
});
