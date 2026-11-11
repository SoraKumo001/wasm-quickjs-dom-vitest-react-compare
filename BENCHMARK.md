# vitest + React: wasm-quickjs-dom vs jsdom Benchmark Report

Generated: 11/11/2026, 9:17:58 PM / Node v24.22.1 / win32 x64
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

- React benchmarks (23 scenarios): **wasm-quickjs-dom slower: 10 / about the same: 4 / faster: 9**
- Geometric mean across all scenarios: **wasm-quickjs-dom takes 0.92x the time of jsdom** (<1.00 means wasm is faster)
- Identical React tests (93 total): jsdom 93/93 passed, wasm-quickjs-dom 93/93 passed
- Environment creation cost per test file: jsdom ~1516.5 ms / wasm-quickjs-dom ~224.3 ms
- Environment capability differences: 49 identical, **12 differing**

## Key Takeaways (Measured on this setup)

- **wasm-quickjs-dom slower in 10 scenarios**: 1.15x–2.11x (median 1.38x). Particularly heavier in `fireEvent.input x50` (2.11x) / `fireEvent.click x100` (1.91x) / `render <Counter/>` (1.87x).
- **wasm-quickjs-dom faster in 9 scenarios**: `unmount 1000 rows` (5.07x faster) / `read textContent of 1000 rows` (3.97x faster) / `querySelectorAll('.row') + iterate, 1000 rows` (3.07x faster) / `expect(...).toHaveTextContent on 1000 rows` (2.32x faster) / `update 100 rows (5 prop changes)` (1.78x faster) / `findByText (async query) on 300 cards` (1.26x faster) / `getByText on 300 cards` (1.25x faster) / `mount 100 rows` (1.16x faster) / `mount 1000 rows` (1.13x faster).
- Geometric mean across all scenarios is **0.92x**. While individual tests may show a ~2x difference in either direction,
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
| fireEvent.input x50 | 8.69 (0.174/op) | 18.33 (0.367/op) | 2.11x | wasm 2.11x slower | 10 |
| fireEvent.click x100 | 20.97 (0.210/op) | 40.08 (0.401/op) | 1.91x | wasm 1.91x slower | 10 |
| render <Counter/> | 5.01 (1.00/op) | 9.39 (1.88/op) | 1.87x | wasm 1.87x slower | 40 |
| rerender 1000 rows | 115.8 (57.91/op) | 197.4 (98.70/op) | 1.70x | wasm 1.70x slower | 20 |
| getByLabelText on 300 cards | 38.94 | 56.56 | 1.45x | wasm 1.45x slower | 10 |
| mount 3000 rows | 561.0 | 774.1 | 1.38x | wasm 1.38x slower | 6 |
| getByRole('button', {name}) on 300 cards | 72.87 | 93.04 | 1.28x | wasm 1.28x slower | 10 |
| getAllByRole('link') on 300 cards | 51.92 | 65.87 | 1.27x | wasm 1.27x slower | 10 |
| mount 1000 simple rows | 45.72 | 57.58 | 1.26x | wasm 1.26x slower | 10 |
| userEvent.click x5 | 258.7 (51.75/op) | 298.3 (59.66/op) | 1.15x | wasm 1.15x slower | 6 |
| userEvent.type 10 chars | 197.4 (19.74/op) | 211.6 (21.16/op) | 1.07x | about the same | 6 |
| mount 100 rows under a context provider | 63.07 (21.02/op) | 67.11 (22.37/op) | 1.06x | about the same | 12 |
| form fill + submit (userEvent) | 488.1 | 513.1 | 1.05x | about the same | 6 |
| rerender <Counter/> x100 | 16.92 (0.169/op) | 17.24 (0.172/op) | 1.02x | about the same | 10 |
| mount 1000 rows | 178.0 | 157.8 | 0.89x | wasm 1.13x faster | 10 |
| mount 100 rows | 73.42 (24.47/op) | 63.53 (21.18/op) | 0.87x | wasm 1.16x faster | 16 |
| getByText on 300 cards | 35.06 | 28.12 | 0.80x | wasm 1.25x faster | 12 |
| findByText (async query) on 300 cards | 50.44 | 39.96 | 0.79x | wasm 1.26x faster | 10 |
| update 100 rows (5 prop changes) | 35.10 (7.02/op) | 19.77 (3.95/op) | 0.56x | wasm 1.78x faster | 16 |
| expect(...).toHaveTextContent on 1000 rows | 3.25 | 1.40 | 0.43x | wasm 2.32x faster | 10 |
| querySelectorAll('.row') + iterate, 1000 rows | 15.93 | 5.19 | 0.33x | wasm 3.07x faster | 10 |
| read textContent of 1000 rows | 3.05 | 0.768 | 0.25x | wasm 3.97x faster | 10 |
| unmount 1000 rows | 21.70 | 4.28 | 0.20x | wasm 5.07x faster | 10 |

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
| node (baseline) | 2465.2 | 942.5 | - | - |
| jsdom | 14597.5 | 2788.2 | +12132.3 | 1516.5 |
| wasm-quickjs-dom | 4259.4 | 1349.1 | +1794.1 | 224.3 |

> The serial difference primarily reflects the cost of recreating the environment per test file (Vitest isolates tests by default,
> running environment setup and importing the environment package for each file).
> In parallel execution, the overhead is amortized across workers, but when file counts grow large and workers are reused, it becomes significant again.

## Identical Test Suite Execution Time

Median wall-clock time running the same test suite (all files / tests) across 2 repeated runs per environment.

| Environment | Serial 1 worker (ms) | Parallel (default) (ms) |
| --- | --- | --- |
| jsdom | 29942.9 | 5546.3 |
| wasm-quickjs-dom | 15969.2 | 3778.9 |
| wasm/jsdom | 0.53x | 0.68x |

All 93 tests produced identical results (passed) in both environments.

Total duration of test bodies (reference only, includes warm-up): jsdom ~3176.5 ms / wasm-quickjs-dom ~3092.6 ms (wasm/jsdom 0.97x)

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

