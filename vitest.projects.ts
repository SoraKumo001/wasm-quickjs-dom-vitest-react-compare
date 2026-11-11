/**
 * Shared Vitest project definitions.
 *
 * The very same test files are run twice: once under `jsdom` (the reference), once under
 * `wasm-quickjs-dom`. Vitest "projects" give each environment its own worker/environment while
 * sharing the config, so `vitest run` executes the identical suite against both DOMs.
 */
import type { UserWorkspaceConfig } from "vitest/config";

export const ENVIRONMENTS = [
  { name: "jsdom", environment: "jsdom" },
  { name: "wasm-quickjs-dom", environment: "wasm-quickjs-dom" },
] as const;

export type EnvName = (typeof ENVIRONMENTS)[number]["name"];

export interface ProjectOptions {
  /** Test files to include. */
  include: string[];
  /** Files run before each test file (per project). */
  setupFiles: string[];
  /** Extra `test` options merged into every project. */
  test?: Record<string, unknown>;
}

/**
 * Both environments get identical user-visible settings (URL, globals, setup files) so that a
 * timing or behaviour difference is the DOM implementation's, not the config's.
 */
export function environmentProjects({
  include,
  setupFiles,
  test = {},
}: ProjectOptions): UserWorkspaceConfig[] {
  return ENVIRONMENTS.map(({ name, environment }) => ({
    // No @vitejs/plugin-react on purpose: Vite 8 / oxc transforms .tsx with the automatic JSX
    // runtime out of the box, so both environments pay the same (minimal) transform cost.
    test: {
      name,
      environment,
      include,
      setupFiles,
      globals: true,
      // The environment name is visible to test files (benchmarks use it to name their output).
      env: { TEST_ENV: name },
      environmentOptions: {
        // Vitest's own jsdom environment reads `environmentOptions.jsdom`; wasm-quickjs-dom reads
        // `environmentOptions.wasmQuickjsDom` and falls back to `jsdom`. Keep both in sync.
        jsdom: { url: "http://localhost:3000" },
        wasmQuickjsDom: { url: "http://localhost:3000" },
      },
      ...test,
    },
  }));
}
