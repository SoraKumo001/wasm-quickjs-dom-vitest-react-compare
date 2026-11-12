# vitest + React: wasm-quickjs-dom vs jsdom Benchmark Report

Generated: 11/12/2026, 9:17:23 AM / Node v24.22.1 / win32 x64
AMD Ryzen 9 3900X 12-Core Processor             (24 threads, 95.9 GB)

Results of running identical React tests and benchmarks across two Vitest environments (`jsdom` / `wasm-quickjs-dom`).
Measurements are executed sequentially in separate processes per environment (to avoid CPU contention from concurrent runs),
reporting median values across 2 repeats for React scenarios and 2 repeats for environment startup.

## Versions

| Package | Version |
| --- | --- |
| node | v24.22.1 |
| vitest | 5.1.0 |
| vite | 8.3.8 |
| jsdom | 31.0.0 |
| wasm-quickjs-dom | 1.0.17 |
| vitest-environment-wasm-quickjs-dom | 1.0.17 |
| react / react-dom | 19.3.1 / 19.3.1 |
| @testing-library/react | 16.3.3 |
| @testing-library/dom | 10.4.2 |
| @testing-library/user-event | 14.6.9 |
| @testing-library/jest-dom | 7.0.1 |

## Summary

- React benchmarks (23 scenarios): **wasm-quickjs-dom slower: 14 / about the same: 5 / faster: 4**
- Geometric mean across all scenarios: **wasm-quickjs-dom takes 1.07x the time of jsdom** (<1.00 means wasm is faster)
- Identical React tests (93 total): jsdom 93/93 passed, wasm-quickjs-dom 93/93 passed
- Environment creation cost per test file: jsdom ~1151.1 ms / wasm-quickjs-dom ~187.3 ms
- Environment capability differences: 49 identical, **12 differing**

## Key Takeaways (Measured on this setup)

- **wasm-quickjs-dom slower in 14 scenarios**: 1.17x–1.99x (median 1.42x). Particularly heavier in `fireEvent.input x50` (1.99x) / `render <Counter/>` (1.93x) / `fireEvent.click x100` (1.79x).
- **wasm-quickjs-dom faster in 4 scenarios**: `unmount 1000 rows` (3.12x faster) / `read textContent of 1000 rows` (2.92x faster) / `expect(...).toHaveTextContent on 1000 rows` (2.47x faster) / `querySelectorAll('.row') + iterate, 1000 rows` (2.41x faster).
- Geometric mean across all scenarios is **1.07x**. While individual tests may show a ~2x difference in either direction,
  the overall test suite execution time typically stays within a ~10% margin.

Practical Guidance:

- **Typical component tests** (mounting small components, querying 1–2 times with `getByRole`, clicking) are
  about 1.5x–2x slower than jsdom. In repositories with large numbers of tests, this difference accumulates.
- Conversely, **the environment instantiation cost per test file is far lower with wasm-quickjs-dom**,
  so in test suites with many separate test files, this can offset test execution time and yield a faster overall wall-clock time (as observed in this repository).
- **Reading and tearing down large DOM trees** (`textContent`, `querySelectorAll` + traversal, `unmount`) is distinctly faster in wasm,
  providing an advantage for tests rendering large pages or complex tables.
- **Capabilities**: APIs missing in jsdom (`matchMedia`, `IntersectionObserver`, `ResizeObserver`, `scrollIntoView`,
  `requestIdleCallback`, `navigator.clipboard`, `Element.animate`) are implemented in wasm-quickjs-dom, eliminating the need for
  mocking/polyfills. Conversely, `navigator.userAgent` and viewport dimensions differ, so tests relying on those values will need environment-specific branching.

## React Benchmarks

Median duration per scenario (ms). `wasm/jsdom` < 1.00 means wasm-quickjs-dom is faster.

| Scenario | jsdom (ms) | wasm-quickjs-dom (ms) | wasm/jsdom | Verdict | Samples |
| --- | --- | --- | --- | --- | --- |
| fireEvent.input x50 | 8.07 (0.161/op) | 16.09 (0.322/op) | 1.99x | wasm 1.99x slower | 10 |
| render <Counter/> | 4.02 (0.803/op) | 7.77 (1.55/op) | 1.93x | wasm 1.93x slower | 40 |
| fireEvent.click x100 | 19.47 (0.195/op) | 34.79 (0.348/op) | 1.79x | wasm 1.79x slower | 10 |
| getByLabelText on 300 cards | 24.17 | 42.32 | 1.75x | wasm 1.75x slower | 10 |
| getAllByRole('link') on 300 cards | 34.70 | 58.21 | 1.68x | wasm 1.68x slower | 10 |
| mount 1000 rows | 100.4 | 149.3 | 1.49x | wasm 1.49x slower | 10 |
| getByRole('button', {name}) on 300 cards | 52.09 | 74.81 | 1.44x | wasm 1.44x slower | 10 |
| userEvent.type 10 chars | 138.6 (13.86/op) | 197.4 (19.74/op) | 1.42x | wasm 1.42x slower | 6 |
| mount 3000 rows | 284.4 | 383.3 | 1.35x | wasm 1.35x slower | 6 |
| mount 1000 simple rows | 39.25 | 52.85 | 1.35x | wasm 1.35x slower | 10 |
| findByText (async query) on 300 cards | 29.29 | 37.14 | 1.27x | wasm 1.27x slower | 10 |
| mount 100 rows | 45.05 (15.02/op) | 56.51 (18.84/op) | 1.25x | wasm 1.25x slower | 16 |
| form fill + submit (userEvent) | 399.3 | 481.6 | 1.21x | wasm 1.21x slower | 6 |
| mount 100 rows under a context provider | 51.58 (17.19/op) | 60.43 (20.14/op) | 1.17x | wasm 1.17x slower | 12 |
| rerender 1000 rows | 75.40 (37.70/op) | 81.33 (40.67/op) | 1.08x | about the same | 20 |
| rerender <Counter/> x100 | 15.57 (0.156/op) | 16.07 (0.161/op) | 1.03x | about the same | 10 |
| userEvent.click x5 | 222.8 (44.56/op) | 215.9 (43.17/op) | 0.97x | about the same | 6 |
| getByText on 300 cards | 23.33 | 22.31 | 0.96x | about the same | 12 |
| update 100 rows (5 prop changes) | 17.57 (3.51/op) | 16.05 (3.21/op) | 0.91x | about the same | 16 |
| querySelectorAll('.row') + iterate, 1000 rows | 10.13 | 4.21 | 0.42x | wasm 2.41x faster | 10 |
| expect(...).toHaveTextContent on 1000 rows | 1.88 | 0.761 | 0.40x | wasm 2.47x faster | 10 |
| read textContent of 1000 rows | 1.88 | 0.644 | 0.34x | wasm 2.92x faster | 10 |
| unmount 1000 rows | 12.06 | 3.87 | 0.32x | wasm 3.12x faster | 10 |

> Note: Absolute values depend on hardware. Compare using the `wasm/jsdom` column (relative ratio on the same machine).

`update 100 rows (5 prop changes)` is the sum of 5 re-renders; `fireEvent.click x100` is the sum of 100 clicks.
Values in parentheses show the duration per individual operation.

Explicit GC (`--expose-gc`) is invoked between benchmark runs to exclude GC pauses from the measurement window.
Without explicit GC, query measurements (especially for wasm-quickjs-dom) exhibited bimodal distributions (e.g., 60 ms vs 280 ms),
causing high variance in median figures across runs. In addition, each scenario runs in its own isolated test file
to re-create the DOM environment and prevent residual garbage from earlier scenarios triggering GC.

> In scenarios where large lists are repeatedly mounted within the same test file in wasm-quickjs-dom
> (`mount 3000 rows`), later samples tend to run slower due to in-page heap GC (e.g., later samples ~1.5x slower than early ones).
> This is an inherent runtime characteristic; the table reports the median across all samples.

## Environment Startup Overhead per Test File

Suite execution time (wall clock median) when running 8 identical minimal test files.
`node` serves as the baseline without a DOM environment (measuring Vitest's own overhead).

- **Serial** (`fileParallelism: false`, 1 worker): Accumulates per-file environment startup cost directly.
- **Parallel** (Vitest default): Reflects actual execution during `npm test`.

| Environment | Serial suite (ms) | Parallel suite (ms) | Diff vs node (ms) | Per file (ms) |
| --- | --- | --- | --- | --- |
| node (baseline) | 2220.0 | 834.0 | - | - |
| jsdom | 11429.1 | 2456.1 | +9209.1 | 1151.1 |
| wasm-quickjs-dom | 3718.3 | 1185.8 | +1498.3 | 187.3 |

> The serial difference primarily reflects the cost of recreating the environment per test file (Vitest isolates tests by default,
> running environment setup and importing the environment package for each file).
> In parallel execution, the overhead is amortized across workers, but when file counts grow large and workers are reused, it becomes significant again.

## Identical Test Suite Execution Time

Median wall-clock time running the same test suite (all files / tests) across 2 repeated runs per environment.

| Environment | Serial 1 worker (ms) | Parallel (default) (ms) |
| --- | --- | --- |
| jsdom | 24053.1 | 4699.5 |
| wasm-quickjs-dom | 13113.3 | 3251.4 |
| wasm/jsdom | 0.55x | 0.69x |

All 93 tests produced identical results (passed) in both environments.

Total duration of test bodies (reference only, includes warm-up): jsdom ~2824.2 ms / wasm-quickjs-dom ~2737.2 ms (wasm/jsdom 0.97x)

> Individual test durations are heavily influenced by execution order within the file (the first test bears the cost
> of module and React initialization), so per-test ratios should not be interpreted in isolation.
> For comparing environment overhead, rely on the isolated benchmark scenarios above and overall suite wall-clock times.

## Environment Capability Differences (Capability Probe)

Results of invoking DOM APIs visible from tests. Differences here can alter behavior
if tested components or polyfills depend on these APIs.

| Item | jsdom | wasm-quickjs-dom |
| --- | --- | --- |
| navigator.userAgent | Mozilla/5.0 (win32) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/31.0.0 | Mozilla/5.0 (compatible; wasm-html-to-image) AppleWebKit/537.36 Chrome/120.0 |
| navigator.platform |  | Linux |
| window.innerWidth | 1024 | 800 |
| window.innerHeight | 768 | 600 |
| typeof requestIdleCallback | undefined | function |
| typeof IntersectionObserver | undefined | function |
| typeof ResizeObserver | undefined | function |
| typeof matchMedia | undefined | function |
| typeof Element.animate | undefined | function |
| typeof navigator.clipboard | undefined | object |
| typeof scrollIntoView + call | {"error":"layoutTarget.scrollIntoView is not a function"} | function |
| matchMedia('(min-width: 1px)').matches | undefined | true |

The remaining 49 items (DOM tree manipulation, HTML parse/serialization, CSS cascading, forms,
Range/Selection, identical innerHTML output, etc.) produced identical results in both environments.

## How to Reproduce

```sh
npm install
npm test                              # Run identical tests in both environments (Vitest projects)
npm run test:jsdom                    # jsdom only
npm run test:wasm                     # wasm-quickjs-dom only
npm run bench                         # Full benchmark suite (default 2 repeats) -> BENCHMARK.md
npm run bench:quick                   # Quick single-run benchmark
npm run compare                       # Regenerate report from stored results/
```

Numbers in this report are for relative comparison on the same machine.
Focus on the `wasm/jsdom` column (ratios); absolute numbers should be re-measured on your target environment.

