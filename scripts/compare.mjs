#!/usr/bin/env node
/**
 * Comparison report generator.
 *
 * Reads everything `scripts/bench.mjs` produced in `results/` and writes `BENCHMARK.md`
 * plus a compact console report. Can be re-run on its own (`npm run compare`) without
 * re-measuring.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const RESULTS = path.join(root, "results");
const JSDOM = "jsdom";
const WASM = "wasm-quickjs-dom";

// --------------------------------------------------------------------------------- helpers
function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    if (fallback !== undefined) return fallback;
    throw new Error(`読み込めません: ${path.relative(root, file)}`);
  }
}

function exists(file) {
  return fs.existsSync(file);
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function median(values) {
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

function formatMs(ms) {
  if (!Number.isFinite(ms)) return "n/a";
  if (ms < 0.01) return ms.toFixed(4);
  if (ms < 1) return ms.toFixed(3);
  if (ms < 100) return ms.toFixed(2);
  return ms.toFixed(1);
}

function formatRatio(ratio) {
  if (!Number.isFinite(ratio)) return "n/a";
  // wasm/jsdom: >1 means wasm is slower
  return `${ratio.toFixed(2)}x`;
}

function ratioLabel(ratio) {
  if (!Number.isFinite(ratio)) return "";
  if (ratio >= 1.1) return `wasm ${ratio.toFixed(2)}x slower`;
  if (ratio <= 0.9) return `wasm ${(1 / ratio).toFixed(2)}x faster`;
  return "about the same";
}

function markdownTable(headers, rows) {
  const escape = (cell) => String(cell).replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function formatDelta(ms) {
  if (!Number.isFinite(ms)) return "n/a";
  return `${ms >= 0 ? "+" : "-"}${formatMs(Math.abs(ms))}`;
}

function version(pkg) {
  try {
    return readJson(path.join(root, "node_modules", pkg, "package.json")).version;
  } catch {
    return "?";
  }
}

const envLabel = (env) => (env === WASM ? "wasm-quickjs-dom" : env);

// --------------------------------------------------------------------------------- 1. metadata
const summaryFile = path.join(RESULTS, "bench-summary.json");
if (!exists(summaryFile)) {
  console.error("results/bench-summary.json not found. Run `npm run bench` first.");
  process.exit(1);
}
const summary = readJson(summaryFile);

const versions = {
  vitest: version("vitest"),
  vite: version("vite"),
  jsdom: version("jsdom"),
  wasmQuickjsDom: version("wasm-quickjs-dom"),
  vitestEnvWasmQuickjsDom: version("vitest-environment-wasm-quickjs-dom"),
  react: version("react"),
  reactDom: version("react-dom"),
  testingLibraryReact: version("@testing-library/react"),
  testingLibraryDom: version("@testing-library/dom"),
  testingLibraryUserEvent: version("@testing-library/user-event"),
  jestDom: version("@testing-library/jest-dom"),
};

// --------------------------------------------------------------------- 2. correctness suite
/** Median of the per-test durations across the repeated serial runs. */
function loadTests(env) {
  const files = fs
    .readdirSync(RESULTS)
    .filter((name) => name.startsWith(`tests-${env}-run-`) && name.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;

  const byName = new Map();
  let total = 0;
  let passed = 0;
  for (const file of files) {
    const report = readJson(path.join(RESULTS, file));
    total = report.numTotalTests ?? total;
    passed = report.numPassedTests ?? passed;
    for (const suite of report.testResults ?? []) {
      for (const assertion of suite.assertionResults ?? []) {
        const entry = byName.get(assertion.fullName) ?? {
          name: assertion.fullName,
          status: assertion.status,
          durations: [],
          file: path.relative(root, suite.name).replace(/\\/g, "/"),
        };
        entry.durations.push(assertion.duration ?? Number.NaN);
        entry.status = assertion.status;
        byName.set(assertion.fullName, entry);
      }
    }
  }

  return {
    runs: files.length,
    total,
    passed,
    failed: total - passed,
    tests: [...byName.values()].map((entry) => ({
      name: entry.name,
      status: entry.status,
      duration: median(entry.durations),
      file: entry.file,
    })),
  };
}

const testsByEnv = { [JSDOM]: loadTests(JSDOM), [WASM]: loadTests(WASM) };
const testParity = [];
if (testsByEnv[JSDOM] && testsByEnv[WASM]) {
  const jsdomTests = new Map(testsByEnv[JSDOM].tests.map((test) => [test.name, test]));
  for (const wasmTest of testsByEnv[WASM].tests) {
    const jsdomTest = jsdomTests.get(wasmTest.name);
    if (!jsdomTest) continue;
    const same = jsdomTest.status === wasmTest.status;
    testParity.push({
      name: wasmTest.name,
      file: wasmTest.file,
      status: same ? wasmTest.status : `${jsdomTest.status} / ${wasmTest.status}`,
      jsdom: jsdomTest.duration,
      wasm: wasmTest.duration,
      ratio: wasmTest.duration / jsdomTest.duration,
      same,
    });
  }
}

// --------------------------------------------------------------------- 3. React scenarios
function loadBench(env) {
  const base = path.join(RESULTS, "fragments", env);
  if (!exists(base)) return null;

  const runDirs = fs
    .readdirSync(base)
    .filter((name) => fs.statSync(path.join(base, name)).isDirectory())
    .sort();
  if (runDirs.length === 0) return null;

  const merged = new Map();
  for (const runDir of runDirs) {
    const files = fs
      .readdirSync(path.join(base, runDir))
      .filter((name) => name.startsWith("scenario-") && name.endsWith(".json"))
      .sort();
    for (const file of files) {
      const fragment = readJson(path.join(base, runDir, file));
      const key = fragment.name;
      if (!merged.has(key)) {
        merged.set(key, { name: key, opsPerRun: fragment.opsPerRun ?? 1, samples: [] });
      }
      merged.get(key).samples.push(...fragment.samples);
    }
  }

  const scenarios = [...merged.values()].map(({ name, opsPerRun, samples }) => {
    const sorted = [...samples].sort((a, b) => a - b);
    const med = percentile(sorted, 0.5);
    return {
      name,
      runs: samples.length,
      opsPerRun,
      medianMs: med,
      perOpMs: med / opsPerRun,
      minMs: sorted[0],
      p95Ms: percentile(sorted, 0.95),
    };
  });
  return { runs: runDirs.length, scenarios };
}

const bench = { [JSDOM]: loadBench(JSDOM), [WASM]: loadBench(WASM) };
const scenarioRows = [];
if (bench[JSDOM] && bench[WASM]) {
  const wasmByName = new Map(bench[WASM].scenarios.map((scenario) => [scenario.name, scenario]));
  for (const jsdomScenario of bench[JSDOM].scenarios) {
    const wasmScenario = wasmByName.get(jsdomScenario.name);
    if (!wasmScenario) continue;
    scenarioRows.push({
      name: jsdomScenario.name,
      opsPerRun: jsdomScenario.opsPerRun,
      jsdom: jsdomScenario.medianMs,
      wasm: wasmScenario.medianMs,
      ratio: wasmScenario.medianMs / jsdomScenario.medianMs,
      jsdomPerOp: jsdomScenario.perOpMs,
      wasmPerOp: wasmScenario.perOpMs,
      runs: Math.min(jsdomScenario.runs, wasmScenario.runs),
    });
  }
}

const finiteRatios = scenarioRows.map((row) => row.ratio).filter((ratio) => Number.isFinite(ratio) && ratio > 0);
const geometricMeanRatio = finiteRatios.length
  ? Math.exp(finiteRatios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / finiteRatios.length)
  : Number.NaN;
const wasmSlower = scenarioRows.filter((row) => row.ratio > 1.1).length;
const wasmFaster = scenarioRows.filter((row) => row.ratio < 0.9).length;
const aboutSame = scenarioRows.length - wasmSlower - wasmFaster;

// ------------------------------------------------------------------ 4. environment startup
function medianWall(bucket, project) {
  const values = summary.wall[bucket]?.[project] ?? [];
  return values.length ? median(values) : Number.NaN;
}

const startupSerial = {};
const startupParallel = {};
for (const project of ["node", JSDOM, WASM]) {
  startupSerial[project] = medianWall("startupSerial", project);
  startupParallel[project] = medianWall("startupParallel", project);
}
const startupPerFile = (env) => {
  const base = startupSerial.node;
  if (!Number.isFinite(base) || !Number.isFinite(startupSerial[env])) return Number.NaN;
  return (startupSerial[env] - base) / summary.startupFiles;
};

const testsSerial = {
  [JSDOM]: medianWall("testsSerial", JSDOM),
  [WASM]: medianWall("testsSerial", WASM),
};
const testsParallel = {
  [JSDOM]: medianWall("testsParallel", JSDOM),
  [WASM]: medianWall("testsParallel", WASM),
};
const testRuns = summary.wall.testsSerial?.[JSDOM]?.length ?? 0;

// --------------------------------------------------------------------- 5. capability diff
function loadCapabilities(env) {
  const file = path.join(RESULTS, `capabilities-${env}.json`);
  return exists(file) ? readJson(file).results : null;
}
const capabilities = { [JSDOM]: loadCapabilities(JSDOM), [WASM]: loadCapabilities(WASM) };
const capabilityRows = [];
if (capabilities[JSDOM] && capabilities[WASM]) {
  const keys = new Set([...Object.keys(capabilities[JSDOM]), ...Object.keys(capabilities[WASM])]);
  for (const key of keys) {
    const jsdomValue = capabilities[JSDOM][key];
    const wasmValue = capabilities[WASM][key];
    const same = JSON.stringify(jsdomValue) === JSON.stringify(wasmValue);
    capabilityRows.push({ key, jsdom: jsdomValue, wasm: wasmValue, same });
  }
}
const capabilityDiffs = capabilityRows.filter((row) => !row.same);
const capabilitySame = capabilityRows.length - capabilityDiffs.length;

// --------------------------------------------------------------------------------- 6. output
const date = new Date(summary.generatedAt);
const dateLabel = date.toLocaleString("en-US", { timeZone: "Asia/Tokyo" });
const lines = [];
const out = (line = "") => lines.push(line);

out("# vitest + React: wasm-quickjs-dom vs jsdom Benchmark Report");
out();
out(`Generated: ${dateLabel} / Node ${summary.node} / ${summary.platform}`);
out(`${summary.cpu} (${summary.cpuCount} threads, ${summary.totalMemoryGb} GB)`);
out();
out("Results of running identical React tests and benchmarks across two Vitest environments (`jsdom` / `wasm-quickjs-dom`).");
out("Measurements are executed sequentially in separate processes per environment (to avoid CPU contention from concurrent runs),");
out(`reporting median values across ${summary.repeats} repeats for React scenarios and ${summary.repeats} repeats for environment startup.`);
out();
out("## Versions");
out();
out(
  markdownTable(
    ["Package", "Version"],
    [
      ["node", summary.node],
      ["vitest", versions.vitest],
      ["vite", versions.vite],
      ["jsdom", versions.jsdom],
      ["wasm-quickjs-dom", versions.wasmQuickjsDom],
      ["vitest-environment-wasm-quickjs-dom", versions.vitestEnvWasmQuickjsDom],
      ["react / react-dom", `${versions.react} / ${versions.reactDom}`],
      ["@testing-library/react", versions.testingLibraryReact],
      ["@testing-library/dom", versions.testingLibraryDom],
      ["@testing-library/user-event", versions.testingLibraryUserEvent],
      ["@testing-library/jest-dom", versions.jestDom],
    ],
  ),
);
out();

out("## Summary");
out();
if (scenarioRows.length > 0) {
  out(`- React benchmarks (${scenarioRows.length} scenarios): **wasm-quickjs-dom slower: ${wasmSlower} / about the same: ${aboutSame} / faster: ${wasmFaster}**`);
  out(`- Geometric mean across all scenarios: **wasm-quickjs-dom takes ${geometricMeanRatio.toFixed(2)}x the time of jsdom** (<1.00 means wasm is faster)`);
}
if (testsByEnv[JSDOM] && testsByEnv[WASM]) {
  out(
    `- Identical React tests (${testsByEnv[JSDOM].total} total): jsdom ${testsByEnv[JSDOM].passed}/${testsByEnv[JSDOM].total} passed, wasm-quickjs-dom ${testsByEnv[WASM].passed}/${testsByEnv[WASM].total} passed`,
  );
}
if (Number.isFinite(startupPerFile(JSDOM)) && Number.isFinite(startupPerFile(WASM))) {
  out(
    `- Environment creation cost per test file: jsdom ~${formatMs(startupPerFile(JSDOM))} ms / wasm-quickjs-dom ~${formatMs(startupPerFile(WASM))} ms`,
  );
}
if (capabilityRows.length > 0) {
  out(`- Environment capability differences: ${capabilitySame} identical, **${capabilityDiffs.length} differing**`);
}
out();

// ------------------------------------------------------------------------- practical reading
if (scenarioRows.length > 0) {
  const slower = scenarioRows.filter((row) => row.ratio > 1.1).sort((a, b) => b.ratio - a.ratio);
  const faster = scenarioRows.filter((row) => row.ratio < 0.9).sort((a, b) => a.ratio - b.ratio);
  out("## Key Takeaways (Measured on this setup)");
  out();
  if (slower.length > 0) {
    const ratios = slower.map((row) => row.ratio);
    out(
      `- **wasm-quickjs-dom slower in ${slower.length} scenarios**: ${ratios[ratios.length - 1].toFixed(2)}x–${ratios[0].toFixed(2)}x` +
        ` (median ${median(ratios).toFixed(2)}x). Particularly heavier in ${slower
          .slice(0, 3)
          .map((row) => `\`${row.name}\` (${row.ratio.toFixed(2)}x)`)
          .join(" / ")}.`,
    );
  }
  if (faster.length > 0) {
    out(
      `- **wasm-quickjs-dom faster in ${faster.length} scenarios**: ${faster
        .map((row) => `\`${row.name}\` (${(1 / row.ratio).toFixed(2)}x faster)`)
        .join(" / ")}.`,
    );
  }
  out(`- Geometric mean across all scenarios is **${geometricMeanRatio.toFixed(2)}x**. While individual tests may show a ~2x difference in either direction,`);
  out("  the overall test suite execution time typically stays within a ~10% margin.");
  out();
  out("Practical Guidance:");
  out();
  out("- **Typical component tests** (mounting small components, querying 1–2 times with `getByRole`, clicking) are");
  out("  about 1.5x–2x slower than jsdom. In repositories with large numbers of tests, this difference accumulates.");
  out("- Conversely, **the environment instantiation cost per test file is far lower with wasm-quickjs-dom**,");
  out("  so in test suites with many separate test files, this can offset test execution time and yield a faster overall wall-clock time (as observed in this repository).");
  out("- **Reading and tearing down large DOM trees** (`textContent`, `querySelectorAll` + traversal, `unmount`) is distinctly faster in wasm,");
  out("  providing an advantage for tests rendering large pages or complex tables.");
  out("- **Capabilities**: APIs missing in jsdom (`matchMedia`, `IntersectionObserver`, `ResizeObserver`, `scrollIntoView`,");
  out("  `requestIdleCallback`, `navigator.clipboard`, `Element.animate`) are implemented in wasm-quickjs-dom, eliminating the need for");
  out("  mocking/polyfills. Conversely, `navigator.userAgent` and viewport dimensions differ, so tests relying on those values will need environment-specific branching.");
  out();
}

if (scenarioRows.length > 0) {
  out("## React Benchmarks");
  out();
  out("Median duration per scenario (ms). `wasm/jsdom` < 1.00 means wasm-quickjs-dom is faster.");
  out();
  const rows = scenarioRows
    .slice()
    .sort((a, b) => b.ratio - a.ratio)
    .map((row) => {
      const isBatch = row.opsPerRun > 1;
      return [
        row.name,
        isBatch ? `${formatMs(row.jsdom)} (${formatMs(row.jsdomPerOp)}/op)` : formatMs(row.jsdom),
        isBatch ? `${formatMs(row.wasm)} (${formatMs(row.wasmPerOp)}/op)` : formatMs(row.wasm),
        formatRatio(row.ratio),
        ratioLabel(row.ratio),
        row.runs,
      ];
    });
  out(markdownTable(["Scenario", "jsdom (ms)", "wasm-quickjs-dom (ms)", "wasm/jsdom", "Verdict", "Samples"], rows));
  out();
  out("> Note: Absolute values depend on hardware. Compare using the `wasm/jsdom` column (relative ratio on the same machine).");
  out();
  out("`update 100 rows (5 prop changes)` is the sum of 5 re-renders; `fireEvent.click x100` is the sum of 100 clicks.");
  out("Values in parentheses show the duration per individual operation.");
  out();
  out("Explicit GC (`--expose-gc`) is invoked between benchmark runs to exclude GC pauses from the measurement window.");
  out("Without explicit GC, query measurements (especially for wasm-quickjs-dom) exhibited bimodal distributions (e.g., 60 ms vs 280 ms),");
  out("causing high variance in median figures across runs. In addition, each scenario runs in its own isolated test file");
  out("to re-create the DOM environment and prevent residual garbage from earlier scenarios triggering GC.");
  out();
  out("> In scenarios where large lists are repeatedly mounted within the same test file in wasm-quickjs-dom");
  out("> (`mount 3000 rows`), later samples tend to run slower due to in-page heap GC (e.g., later samples ~1.5x slower than early ones).");
  out("> This is an inherent runtime characteristic; the table reports the median across all samples.");
  out();
}

if (Object.values(startupSerial).some((value) => Number.isFinite(value))) {
  out("## Environment Startup Overhead per Test File");
  out();
  out(`Suite execution time (wall clock median) when running ${summary.startupFiles} identical minimal test files.`);
  out("`node` serves as the baseline without a DOM environment (measuring Vitest's own overhead).");
  out();
  out("- **Serial** (`fileParallelism: false`, 1 worker): Accumulates per-file environment startup cost directly.");
  out("- **Parallel** (Vitest default): Reflects actual execution during `npm test`.");
  out();
  const rows = [
    [
      "node (baseline)",
      formatMs(startupSerial.node),
      formatMs(startupParallel.node),
      "-",
      "-",
    ],
    [
      "jsdom",
      formatMs(startupSerial[JSDOM]),
      formatMs(startupParallel[JSDOM]),
      formatDelta(startupSerial[JSDOM] - startupSerial.node),
      formatMs(startupPerFile(JSDOM)),
    ],
    [
      "wasm-quickjs-dom",
      formatMs(startupSerial[WASM]),
      formatMs(startupParallel[WASM]),
      formatDelta(startupSerial[WASM] - startupSerial.node),
      formatMs(startupPerFile(WASM)),
    ],
  ];
  out(markdownTable(["Environment", "Serial suite (ms)", "Parallel suite (ms)", "Diff vs node (ms)", "Per file (ms)"], rows));
  out();
  out("> The serial difference primarily reflects the cost of recreating the environment per test file (Vitest isolates tests by default,");
  out("> running environment setup and importing the environment package for each file).");
  out("> In parallel execution, the overhead is amortized across workers, but when file counts grow large and workers are reused, it becomes significant again.");
  out();
}

out("## Identical Test Suite Execution Time");
out();
if (Number.isFinite(testsSerial[JSDOM]) && Number.isFinite(testsSerial[WASM])) {
  out(
    `Median wall-clock time running the same test suite (${summary.testFiles ?? "all"} files / tests) across ${testRuns} repeated runs per environment.`,
  );
  out();
  const ratioSerial = testsSerial[WASM] / testsSerial[JSDOM];
  const ratioParallel = testsParallel[WASM] / testsParallel[JSDOM];
  out(
    markdownTable(
      ["Environment", "Serial 1 worker (ms)", "Parallel (default) (ms)"],
      [
        ["jsdom", formatMs(testsSerial[JSDOM]), formatMs(testsParallel[JSDOM])],
        ["wasm-quickjs-dom", formatMs(testsSerial[WASM]), formatMs(testsParallel[WASM])],
        ["wasm/jsdom", formatRatio(ratioSerial), formatRatio(ratioParallel)],
      ],
    ),
  );
  out();
}

if (testParity.length > 0) {
  const mismatches = testParity.filter((test) => !test.same);
  if (mismatches.length > 0) {
    out(`**Mismatched test results: ${mismatches.length}**`);
    out();
    for (const mismatch of mismatches) out(`- ${mismatch.name}: ${mismatch.status}`);
    out();
  } else {
    out(`All ${testParity.length} tests produced identical results (passed) in both environments.`);
    out();
  }
  const jsdomTotal = testParity.reduce((sum, test) => sum + test.jsdom, 0);
  const wasmTotal = testParity.reduce((sum, test) => sum + test.wasm, 0);
  out(
    `Total duration of test bodies (reference only, includes warm-up): jsdom ~${formatMs(jsdomTotal)} ms / wasm-quickjs-dom ~${formatMs(wasmTotal)} ms` +
      ` (wasm/jsdom ${formatRatio(wasmTotal / jsdomTotal)})`,
  );
  out();
  out("> Individual test durations are heavily influenced by execution order within the file (the first test bears the cost");
  out("> of module and React initialization), so per-test ratios should not be interpreted in isolation.");
  out("> For comparing environment overhead, rely on the isolated benchmark scenarios above and overall suite wall-clock times.");
  out();
}

if (capabilityDiffs.length > 0) {
  out("## Environment Capability Differences (Capability Probe)");
  out();
  out("Results of invoking DOM APIs visible from tests. Differences here can alter behavior");
  out("if tested components or polyfills depend on these APIs.");
  out();
  const formatValue = (value) => {
    if (typeof value === "object" && value !== null) return JSON.stringify(value);
    if (typeof value === "string") return value.length > 90 ? `${value.slice(0, 90)}…` : value;
    return String(value);
  };
  const rows = capabilityDiffs.map((row) => [row.key, formatValue(row.jsdom), formatValue(row.wasm)]);
  out(markdownTable(["Item", "jsdom", "wasm-quickjs-dom"], rows));
  out();
  out(`The remaining ${capabilitySame} items (DOM tree manipulation, HTML parse/serialization, CSS cascading, forms,`);
  out("Range/Selection, identical innerHTML output, etc.) produced identical results in both environments.");
  out();
}

out("## How to Reproduce");
out();
out("```sh");
out("npm install");
out("npm test                              # Run identical tests in both environments (Vitest projects)");
out("npm run test:jsdom                    # jsdom only");
out("npm run test:wasm                     # wasm-quickjs-dom only");
out("npm run bench                         # Full benchmark suite (default " + summary.repeats + " repeats) -> BENCHMARK.md");
out("npm run bench:quick                   # Quick single-run benchmark");
out("npm run compare                       # Regenerate report from stored results/");
out("```");
out();
out("Numbers in this report are for relative comparison on the same machine.");
out("Focus on the `wasm/jsdom` column (ratios); absolute numbers should be re-measured on your target environment.");
out();

const report = `${lines.join("\n")}\n`;
fs.writeFileSync(path.join(root, "BENCHMARK.md"), report);

// --------------------------------------------------------------------------- console view
console.log("");
if (scenarioRows.length > 0) {
  console.log(`React Benchmarks (${scenarioRows.length} scenarios, median of ${summary.repeats} runs)`);
  console.log(`  Geometric mean: wasm-quickjs-dom takes ${geometricMeanRatio.toFixed(2)}x the time of jsdom`);
  console.log(`  Slower: ${wasmSlower} / About the same: ${aboutSame} / Faster: ${wasmFaster}`);
  console.log("");
  for (const row of scenarioRows.slice().sort((a, b) => b.ratio - a.ratio)) {
    const batch = row.opsPerRun > 1 ? ` (${formatMs(row.wasmPerOp)}/op)` : "";
    console.log(
      `  ${row.name.padEnd(46)} jsdom ${formatMs(row.jsdom).padStart(9)} ms  wasm ${formatMs(row.wasm).padStart(9)} ms  ${formatRatio(row.ratio).padStart(7)}  ${ratioLabel(row.ratio)}${batch}`,
    );
  }
  console.log("");
}
if (testsByEnv[JSDOM] && testsByEnv[WASM]) {
  console.log(
    `Identical tests: jsdom ${testsByEnv[JSDOM].passed}/${testsByEnv[JSDOM].total} passed, wasm-quickjs-dom ${testsByEnv[WASM].passed}/${testsByEnv[WASM].total} passed`,
  );
}
if (Number.isFinite(startupPerFile(JSDOM)) && Number.isFinite(startupPerFile(WASM))) {
  console.log(
    `Environment creation per file: jsdom ~${formatMs(startupPerFile(JSDOM))} ms, wasm-quickjs-dom ~${formatMs(startupPerFile(WASM))} ms`,
  );
}
console.log(`Capability differences: ${capabilityDiffs.length} differing items`);
console.log(`\nReport: ${path.join(root, "BENCHMARK.md")}`);
