# vitest + React: wasm-quickjs-dom vs jsdom Benchmark Report

Generated: 11/19/2026, 4:50:01 PM / Node v24.22.1 / win32 x64
AMD Ryzen 9 3900X 12-Core Processor             (24 threads, 95.9 GB)

Results of running identical React tests and benchmarks across two Vitest environments (`jsdom` / `wasm-quickjs-dom`).
Measurements are executed sequentially in separate processes per environment (to avoid CPU contention from concurrent runs),
reporting median values across 2 repeats for React scenarios and 2 repeats for environment startup.

## Versions

| Package | Version |
| --- | --- |
| node | v24.22.1 |
| vitest | 5.1.1 |
| vite | 8.3.8 |
| jsdom | 31.0.1 |
| wasm-quickjs-dom | 1.0.19 |
| vitest-environment-wasm-quickjs-dom | 1.0.19 |
| react / react-dom | 19.3.1 / 19.3.1 |
| @testing-library/react | 16.3.3 |
| @testing-library/dom | 10.4.2 |
| @testing-library/user-event | 14.6.13 |
| @testing-library/jest-dom | 8.0.0 |

## Summary

- React benchmarks (23 scenarios): **wasm-quickjs-dom slower: 12 / about the same: 7 / faster: 4**
- Geometric mean across all scenarios: **wasm-quickjs-dom takes 1.06x the time of jsdom** (<1.00 means wasm is faster)
- Identical React tests (95 total): jsdom 95/95 passed, wasm-quickjs-dom 98/98 passed
- Environment creation cost per test file: jsdom ~1200.8 ms / wasm-quickjs-dom ~194.2 ms
- Environment capability differences: 49 identical, **12 differing**

## Key Takeaways (Measured on this setup)

- **wasm-quickjs-dom slower in 12 scenarios**: 1.11x–2.06x (median 1.41x). Particularly heavier in `fireEvent.input x50` (2.06x) / `render <Counter/>` (2.01x) / `getAllByRole('link') on 300 cards` (1.83x).
- **wasm-quickjs-dom faster in 4 scenarios**: `unmount 1000 rows` (3.17x faster) / `querySelectorAll('.row') + iterate, 1000 rows` (2.73x faster) / `read textContent of 1000 rows` (2.51x faster) / `expect(...).toHaveTextContent on 1000 rows` (2.04x faster).
- Geometric mean across all scenarios is **1.06x**. While individual tests may show a ~2x difference in either direction,
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
| fireEvent.input x50 | 8.31 (0.166/op) | 17.11 (0.342/op) | 2.06x | wasm 2.06x slower | 10 |
| render <Counter/> | 4.11 (0.821/op) | 8.24 (1.65/op) | 2.01x | wasm 2.01x slower | 40 |
| getAllByRole('link') on 300 cards | 32.09 | 58.71 | 1.83x | wasm 1.83x slower | 10 |
| getByLabelText on 300 cards | 24.79 | 44.80 | 1.81x | wasm 1.81x slower | 10 |
| fireEvent.click x100 | 21.03 (0.210/op) | 36.90 (0.369/op) | 1.75x | wasm 1.75x slower | 10 |
| getByRole('button', {name}) on 300 cards | 50.54 | 78.52 | 1.55x | wasm 1.55x slower | 10 |
| mount 3000 rows | 294.1 | 414.2 | 1.41x | wasm 1.41x slower | 6 |
| mount 1000 simple rows | 41.39 | 54.05 | 1.31x | wasm 1.31x slower | 10 |
| mount 100 rows | 47.42 (15.81/op) | 59.51 (19.84/op) | 1.25x | wasm 1.25x slower | 16 |
| findByText (async query) on 300 cards | 27.74 | 34.51 | 1.24x | wasm 1.24x slower | 10 |
| mount 100 rows under a context provider | 52.57 (17.52/op) | 64.63 (21.54/op) | 1.23x | wasm 1.23x slower | 12 |
| mount 1000 rows | 123.7 | 137.0 | 1.11x | wasm 1.11x slower | 10 |
| userEvent.type 10 chars | 193.2 (19.32/op) | 212.0 (21.20/op) | 1.10x | about the same | 6 |
| form fill + submit (userEvent) | 502.8 | 540.2 | 1.07x | about the same | 6 |
| rerender 1000 rows | 84.31 (42.15/op) | 90.47 (45.24/op) | 1.07x | about the same | 20 |
| userEvent.click x5 | 292.6 (58.51/op) | 301.9 (60.38/op) | 1.03x | about the same | 6 |
| rerender <Counter/> x100 | 16.49 (0.165/op) | 15.84 (0.158/op) | 0.96x | about the same | 10 |
| getByText on 300 cards | 24.10 | 23.03 | 0.96x | about the same | 12 |
| update 100 rows (5 prop changes) | 18.41 (3.68/op) | 17.02 (3.40/op) | 0.92x | about the same | 16 |
| expect(...).toHaveTextContent on 1000 rows | 1.92 | 0.941 | 0.49x | wasm 2.04x faster | 10 |
| read textContent of 1000 rows | 1.80 | 0.718 | 0.40x | wasm 2.51x faster | 10 |
| querySelectorAll('.row') + iterate, 1000 rows | 11.05 | 4.05 | 0.37x | wasm 2.73x faster | 10 |
| unmount 1000 rows | 11.10 | 3.50 | 0.32x | wasm 3.17x faster | 10 |

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
| node (baseline) | 2289.5 | 864.9 | - | - |
| jsdom | 11896.0 | 2464.8 | +9606.6 | 1200.8 |
| wasm-quickjs-dom | 3843.0 | 1234.7 | +1553.5 | 194.2 |

> The serial difference primarily reflects the cost of recreating the environment per test file (Vitest isolates tests by default,
> running environment setup and importing the environment package for each file).
> In parallel execution, the overhead is amortized across workers, but when file counts grow large and workers are reused, it becomes significant again.

## Identical Test Suite Execution Time

Median wall-clock time running the same test suite (all files / tests) across 2 repeated runs per environment.

| Environment | Serial 1 worker (ms) | Parallel (default) (ms) |
| --- | --- | --- |
| jsdom | 26835.4 | 4769.1 |
| wasm-quickjs-dom | 14589.7 | 3376.0 |
| wasm/jsdom | 0.54x | 0.71x |

All 94 tests produced identical results (passed) in both environments.

Total duration of test bodies (reference only, includes warm-up): jsdom ~3086.6 ms / wasm-quickjs-dom ~3063.2 ms (wasm/jsdom 0.99x)

> Individual test durations are heavily influenced by execution order within the file (the first test bears the cost
> of module and React initialization), so per-test ratios should not be interpreted in isolation.
> For comparing environment overhead, rely on the isolated benchmark scenarios above and overall suite wall-clock times.

## Environment Capability Differences (Capability Probe)

Results of invoking DOM APIs visible from tests. Differences here can alter behavior
if tested components or polyfills depend on these APIs.

| Item | jsdom | wasm-quickjs-dom |
| --- | --- | --- |
| navigator.userAgent | Mozilla/5.0 (win32) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/31.0.1 | Mozilla/5.0 (compatible; wasm-html-to-image) AppleWebKit/537.36 Chrome/120.0 |
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

