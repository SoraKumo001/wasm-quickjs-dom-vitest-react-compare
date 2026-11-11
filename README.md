# vitest + React: `wasm-quickjs-dom` vs `jsdom` Benchmark Kit

This repository measures and compares **compatibility and execution speed between `jsdom` and `wasm-quickjs-dom`** when running React tests with Vitest, using identical tests and benchmarks under identical conditions.

- Tests run identically across both environments using **Vitest projects** configured in `vitest.config.ts`. Running `npx vitest run` executes the same React test suite in both `jsdom` and `wasm-quickjs-dom`.
- Benchmarks are executed via `npm run bench`. Each environment runs sequentially in its own process, and the compiled results are generated into `BENCHMARK.md`.
- See [`BENCHMARK.md`](./BENCHMARK.md) for sample benchmark results (regenerated whenever `npm run bench` is run).

## Setup

```sh
npm install
```

Node.js 20+ / ESM only (a requirement of `wasm-quickjs-dom`). Tested versions:

| Package | Version |
| --- | --- |
| vitest / vite | 5.1.0 / 8.3.8 |
| jsdom | 31.0.0 |
| wasm-quickjs-dom / vitest-environment-wasm-quickjs-dom | 1.0.16 |
| react / react-dom | 19.3.1 |
| @testing-library/react / dom / user-event / jest-dom | 16.3.3 / 10.4.2 / 14.6.9 / 7.0.1 |

## Usage

```sh
npm test              # Run all tests in both environments (Vitest projects)
npm run test:jsdom    # Run jsdom only
npm run test:wasm     # Run wasm-quickjs-dom only

npm run bench         # Full benchmark suite (2 repeats) -> generates BENCHMARK.md
npm run bench:quick   # Quick single-run benchmark (~half the execution time)
npm run compare       # Regenerate BENCHMARK.md from existing measurements in results/
npm run probe         # Run DOM capability probe only
```

`npm run bench` runs each environment sequentially in separate processes (to prevent CPU contention).
Default run time is roughly 6 minutes on this machine (3–4 minutes for `bench:quick`).

Options: `node scripts/bench.mjs --repeats 3` (repeat count), `--startup-files 12` (number of files for startup measurement), `--skip-startup` (skip startup cost measurement).

## What Is Being Compared

### 1. Compatibility: Do the same React tests pass?

Runs 93 React tests in `tests/` across both environments. These tests cover typical component testing patterns:

| File | Tests | Description |
| --- | --- | --- |
| [`tests/render.test.tsx`](./tests/render.test.tsx) | 10 | Static rendering, lists, conditional rendering, class/style, table parsing corrections, SVG, portals, context, form values, `dangerouslySetInnerHTML` |
| [`tests/interaction.test.tsx`](./tests/interaction.test.tsx) | 9 | `fireEvent` / `userEvent` click, input, select, keyboard, focus, checkboxes, form submission |
| [`tests/forms.test.tsx`](./tests/forms.test.tsx) | 10 | Validation, radio / checkbox groups, multiple select, `valueAsNumber`, `form.reset()`, disabled fieldsets, label clicks, tab navigation, `FormData` |
| [`tests/hooks.test.tsx`](./tests/hooks.test.tsx) | 11 | `useReducer`, `useRef`, `useLayoutEffect` ordering, `useId`, `useMemo`, `memo`, `forwardRef`/`useImperativeHandle`, `useSyncExternalStore`, context, `useDeferredValue` |
| [`tests/events.test.tsx`](./tests/events.test.tsx) | 12 | Double click, context menu, pointer / mouse / wheel / scroll, bubbling & `stopPropagation`, capture, `preventDefault`, `input`, arrow keys, CustomEvent, focus/blur |
| [`tests/composition.test.tsx`](./tests/composition.test.tsx) | 12 | Compound components, render props, Error Boundaries, Suspense + `lazy`, portal + keydown cleanup, keyed list reordering, Fragments, HOCs, MutationObserver, multiple roots, layout-agnostic verification |
| [`tests/integration.test.tsx`](./tests/integration.test.tsx) | 9 | Debounce + fake timers, fetch loading / error states, ignoring stale responses, pagination, master-detail, localStorage, `history.pushState` + `popstate`, multiple independent widgets |
| [`tests/async.test.tsx`](./tests/async.test.tsx) | 5 | `useEffect` + `setTimeout`, Promises, `waitFor` / `findBy`, debounce, unmount cleanup |
| [`tests/matchers.test.tsx`](./tests/matchers.test.tsx) | 4 | `@testing-library/jest-dom` matchers (layout-independent) |
| [`tests/env-differences.test.tsx`](./tests/env-differences.test.tsx) | 10 | Verification of environment differences (`matchMedia` / observers / `scrollIntoView` / UA / viewport / 0-dimension layout / serialization parity / core DOM manipulation) |
| [`tests/smoke.test.tsx`](./tests/smoke.test.tsx) | 1 | Environment sanity check |

If all tests pass in both environments, it confirms that migration is possible without modifying test code.
`env-differences.test.tsx` explicitly asserts known differences between environments, ensuring tests pass while alerting if behaviors change.

### 2. Performance: Where React tests are faster/slower

23 scenarios are defined in `bench/scenarios/` with **1 scenario per test file**:

- Mount / unmount (100 / 1,000 / 3,000 row lists, 100 rows under a context provider)
- Re-rendering (props change, re-rendering 1,000 rows, re-rendering `<Counter/>` 100 times)
- Events (`fireEvent.click` ×100, `fireEvent.input` ×50, `userEvent.click` / `userEvent.type`, form fill + submit)
- Testing Library queries (`getByText` / `getAllByRole('link')` / `getByRole('button', {name})` / `getByLabelText` / `findByText`, 300 cards)
- jest-dom matchers (`toHaveTextContent`, 1,000 rows)
- Host-side DOM inspection (`querySelectorAll` + iteration, `textContent`)

Each scenario uses an isolated file **to force Vitest to instantiate a fresh DOM environment per scenario**.
Creating large amounts of DOM within a single file causes GC pressure from remnants of previous scenarios, which skews subsequent query measurements by multiple times.

### 3. Environment Startup Overhead (Impact of File Count)

8 minimal test files are executed in **serial** (`fileParallelism: false`, 1 worker) and **parallel** (Vitest default) modes.
Using the `node` environment (no DOM) as a baseline, we measure the environment instantiation cost per test file.
Because Vitest defaults to `isolate: true` (recreating the environment for each test file), this cost scales proportionally with file count.

### 4. Capability Differences (Capability Probe)

`probes/capabilities.probe.ts` invokes DOM APIs in both environments and saves the results to `results/capabilities-<env>.json`.
`scripts/compare.mjs` generates a diff table. These differences may affect code or polyfills that depend on specific browser APIs.

## How It Works (Implementation Notes)

- **Running the same tests in both environments**: [`vitest.projects.ts`](./vitest.projects.ts) defines two projects (`jsdom` and `wasm-quickjs-dom`), loaded by [`vitest.config.ts`](./vitest.config.ts). Each project sets `env: { TEST_ENV: name }`, accessible in tests via `process.env.TEST_ENV`.
- **Harmonized environment options**: The same `url` is configured in `environmentOptions.jsdom` and `environmentOptions.wasmQuickjsDom`, and `@testing-library/react` setup ([`tests/setup.ts`](./tests/setup.ts)) is shared.
- **Fair benchmark methodology**:
  - Sequential execution in separate processes per environment to eliminate CPU contention
  - Fixture creation is excluded from the measurement window (only the function returned by `setup()` is timed)
  - Explicit GC (`NODE_OPTIONS=--expose-gc`) between samples to exclude GC pauses from measurements
  - Warm-up phase before sampling, taking median values
- **Output files**: `results/` (`fragments/` holds raw scenario samples, `tests-*.json` holds test durations, `bench-summary.json` holds wall-clock times, and `capabilities-*.json` holds capability probes). `results/` is ignored in `.gitignore`.

## Interpreting Results

Focus on the **`wasm/jsdom` column** in `BENCHMARK.md` (ratio measured under identical conditions on the same machine). Absolute numbers depend on hardware.
Key takeaways on this benchmark system (Ryzen 9 3900X / Node 24):

- For smaller component tests (mount -> query -> click), **wasm-quickjs-dom is 1.1x–2.3x slower**. `fireEvent.click` and `getByRole` queries are notably heavier, while `getByText` is roughly comparable.
- For reading and tearing down large DOM trees (`textContent`, `querySelectorAll` + traversal, `unmount`), **wasm-quickjs-dom is 2.5x–3.5x faster**.
- Environment setup per test file takes **~1.25s for jsdom vs. ~0.21s for wasm-quickjs-dom**. In test suites with many files, this advantage can offset slower test execution, potentially resulting in faster overall wall-clock time.
- In terms of API support, wasm-quickjs-dom implements several APIs missing in jsdom (`matchMedia`, `IntersectionObserver`, `ResizeObserver`, `scrollIntoView`, `requestIdleCallback`, `navigator.clipboard`, `Element.animate`), reducing the need for polyfills. Conversely, `navigator.userAgent` and viewport dimensions differ, so tests relying on them may require environment-specific branching.

## Adding a Scenario

1. Add `{ name, runs, setup, ... }` to the `SCENARIOS` array in [`bench/harness.tsx`](./bench/harness.tsx) (`setup()` builds the fixture and returns the function to benchmark).
2. Add a one-line test file `bench/scenarios/NN-name.bench.tsx`: `runScenario(<index>);`.
3. Re-run `npm test` (add to `tests/` if adding compatibility tests) and `npm run bench`.

## Notes

- `wasm-quickjs-dom` requires ESM and Node.js 20+. It cannot be used with CommonJS configuration files.
- Layout geometry (e.g. `getBoundingClientRect().width`) evaluates to **0 in both environments** (neither environment includes a layout engine). Layout-dependent matchers like `toBeVisible` can only evaluate properties that do not depend on real layout.
- The numbers in this repository are for relative comparison on the same machine. When re-measuring on CI or different machines, compare the ratio rather than absolute durations.
