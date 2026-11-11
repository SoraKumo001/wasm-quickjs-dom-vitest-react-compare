# vitest + React: wasm-quickjs-dom vs jsdom Benchmark Report

Generated: 11/11/2026, 7:29:11 PM / Node v24.22.1 / win32 x64
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
| wasm-quickjs-dom | 1.0.16 |
| vitest-environment-wasm-quickjs-dom | 1.0.16 |
| react / react-dom | 19.3.1 / 19.3.1 |
| @testing-library/react | 16.3.3 |
| @testing-library/dom | 10.4.2 |
| @testing-library/user-event | 14.6.9 |
| @testing-library/jest-dom | 7.0.1 |

## Summary

- React benchmarks (23 scenarios): **wasm-quickjs-dom slower: 12 / about the same: 6 / faster: 5**
- Geometric mean across all scenarios: **wasm-quickjs-dom takes 1.02x the time of jsdom** (<1.00 means wasm is faster)
- Identical React tests (93 total): jsdom 93/93 passed, wasm-quickjs-dom 93/93 passed
- Environment creation cost per test file: jsdom ~1247.9 ms / wasm-quickjs-dom ~211.0 ms
- Environment capability differences: 49 identical, **12 differing**

## Key Takeaways (Measured on this setup)

- **wasm-quickjs-dom slower in 12 scenarios**: 1.12x–2.32x (median 1.32x). Particularly heavier in `fireEvent.input x50` (2.32x) / `fireEvent.click x100` (2.07x) / `render <Counter/>` (2.00x).
- **wasm-quickjs-dom faster in 5 scenarios**: `unmount 1000 rows` (3.47x faster) / `read textContent of 1000 rows` (3.39x faster) / `querySelectorAll('.row') + iterate, 1000 rows` (2.62x faster) / `expect(...).toHaveTextContent on 1000 rows` (2.53x faster) / `update 100 rows (5 prop changes)` (1.12x faster).
- Geometric mean across all scenarios is **1.02x**. While individual tests may show a ~2x difference in either direction,
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
| fireEvent.input x50 | 8.12 (0.162/op) | 18.87 (0.377/op) | 2.32x | wasm 2.32x slower | 10 |
| fireEvent.click x100 | 19.70 (0.197/op) | 40.86 (0.409/op) | 2.07x | wasm 2.07x slower | 10 |
| render <Counter/> | 4.23 (0.846/op) | 8.47 (1.69/op) | 2.00x | wasm 2.00x slower | 40 |
| getByLabelText on 300 cards | 25.47 | 45.35 | 1.78x | wasm 1.78x slower | 10 |
| getAllByRole('link') on 300 cards | 36.37 | 60.79 | 1.67x | wasm 1.67x slower | 10 |
| getByRole('button', {name}) on 300 cards | 59.48 | 80.30 | 1.35x | wasm 1.35x slower | 10 |
| mount 1000 simple rows | 41.52 | 54.95 | 1.32x | wasm 1.32x slower | 10 |
| mount 100 rows | 46.59 (15.53/op) | 58.92 (19.64/op) | 1.26x | wasm 1.26x slower | 16 |
| findByText (async query) on 300 cards | 30.99 | 39.01 | 1.26x | wasm 1.26x slower | 10 |
| mount 1000 rows | 110.0 | 134.3 | 1.22x | wasm 1.22x slower | 10 |
| mount 100 rows under a context provider | 55.02 (18.34/op) | 63.54 (21.18/op) | 1.15x | wasm 1.15x slower | 12 |
| userEvent.type 10 chars | 190.9 (19.09/op) | 212.9 (21.29/op) | 1.12x | wasm 1.12x slower | 6 |
| userEvent.click x5 | 280.9 (56.19/op) | 308.4 (61.69/op) | 1.10x | about the same | 6 |
| form fill + submit (userEvent) | 495.2 | 529.3 | 1.07x | about the same | 6 |
| rerender <Counter/> x100 | 16.20 (0.162/op) | 16.52 (0.165/op) | 1.02x | about the same | 10 |
| rerender 1000 rows | 109.8 (54.91/op) | 110.7 (55.35/op) | 1.01x | about the same | 20 |
| getByText on 300 cards | 24.57 | 24.27 | 0.99x | about the same | 12 |
| mount 3000 rows | 438.1 | 411.4 | 0.94x | about the same | 6 |
| update 100 rows (5 prop changes) | 19.87 (3.97/op) | 17.70 (3.54/op) | 0.89x | wasm 1.12x faster | 16 |
| expect(...).toHaveTextContent on 1000 rows | 2.24 | 0.889 | 0.40x | wasm 2.53x faster | 10 |
| querySelectorAll('.row') + iterate, 1000 rows | 11.01 | 4.20 | 0.38x | wasm 2.62x faster | 10 |
| read textContent of 1000 rows | 2.22 | 0.654 | 0.29x | wasm 3.39x faster | 10 |
| unmount 1000 rows | 13.93 | 4.01 | 0.29x | wasm 3.47x faster | 10 |

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
| node (baseline) | 2127.2 | 782.7 | - | - |
| jsdom | 12110.5 | 2414.7 | +9983.3 | 1247.9 |
| wasm-quickjs-dom | 3815.0 | 1172.2 | +1687.8 | 211.0 |

> The serial difference primarily reflects the cost of recreating the environment per test file (Vitest isolates tests by default,
> running environment setup and importing the environment package for each file).
> In parallel execution, the overhead is amortized across workers, but when file counts grow large and workers are reused, it becomes significant again.

## Identical Test Suite Execution Time

Median wall-clock time running the same test suite (all files / tests) across 2 repeated runs per environment.

| Environment | Serial 1 worker (ms) | Parallel (default) (ms) |
| --- | --- | --- |
| jsdom | 23330.3 | 4367.9 |
| wasm-quickjs-dom | 12064.4 | 3014.0 |
| wasm/jsdom | 0.52x | 0.69x |

All 93 tests produced identical results (passed) in both environments.

Total duration of test bodies (reference only, includes warm-up): jsdom ~3052.8 ms / wasm-quickjs-dom ~3132.3 ms (wasm/jsdom 1.03x)

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

