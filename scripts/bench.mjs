#!/usr/bin/env node
/**
 * Benchmark runner.
 *
 * Phases (all sequential; the two environments never run at the same time, so they never
 * compete for CPU):
 *   0. capability probes            -> results/capabilities-<env>.json
 *   1. correctness suite            -> results/tests-<env>.json  (+ wall time)
 *   2. React scenarios, R repeats   -> results/react-bench-<env>-<repeat>.json (+ wall time)
 *   3. N-file startup suite, R reps -> results/startup-wall.json  (+ wall time)
 *   4. comparison report            -> BENCHMARK.md (via scripts/compare.mjs)
 *
 * Usage:
 *   node scripts/bench.mjs                 # 3 repeats (default)
 *   node scripts/bench.mjs --repeats 1     # quick pass
 *   node scripts/bench.mjs --skip-startup  # skip phase 3
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const argv = process.argv.slice(2);
function flag(name, fallback = undefined) {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

const repeats = Math.max(1, Number(flag("repeats", 2)));
const startupFiles = Math.max(1, Number(flag("startup-files", 8)));
const skipStartup = Boolean(flag("skip-startup", false));
const ENVIRONMENTS = ["jsdom", "wasm-quickjs-dom"];
const VITEST = path.join(root, "node_modules", "vitest", "vitest.mjs");
const RESULTS = path.join(root, "results");

if (!fs.existsSync(VITEST)) {
  console.error(`vitest が見つかりません: ${VITEST}\n先に npm install を実行してください。`);
  process.exit(1);
}
fs.mkdirSync(RESULTS, { recursive: true });
fs.mkdirSync(path.join(root, "bench", "generated"), { recursive: true });

function runVitest(extraArgs, envVars = {}) {
  const started = performance.now();
  const nodeOptions = [process.env.NODE_OPTIONS, "--expose-gc"].filter(Boolean).join(" ");
  const result = spawnSync(process.execPath, [VITEST, "run", ...extraArgs], {
    cwd: root,
    stdio: "inherit",
    // --expose-gc: the benchmark collects between iterations so GC pauses stay outside the
    // measured window (otherwise the samples are bimodal).
    env: { ...process.env, NODE_OPTIONS: nodeOptions, ...envVars },
    timeout: 30 * 60 * 1000,
  });
  const wallMs = performance.now() - started;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`vitest が失敗しました (exit ${result.status}): vitest run ${extraArgs.join(" ")}`);
  }
  return wallMs;
}

function phase(title) {
  console.log(`\n=== ${title} ===`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  cpu: os.cpus()[0]?.model ?? "unknown",
  cpuCount: os.cpus().length,
  totalMemoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
  repeats,
  startupFiles,
  wall: { testsSerial: {}, testsParallel: {}, bench: {}, startupSerial: {}, startupParallel: {} },
};

try {
  // ------------------------------------------------------------------ phase 0: probes
  phase("phase 0: capability probes");
  for (const env of ENVIRONMENTS) {
    runVitest(["--config", "vitest.probes.config.ts", "--project", env]);
  }

  // ------------------------------------------------------- phase 1: correctness suite
  phase("phase 1: correctness suite (per test file durations)");
  const testRepeats = Math.max(2, Math.min(3, repeats));
  for (const env of ENVIRONMENTS) summary.wall.testsSerial[env] = [];
  for (let repeat = 1; repeat <= testRepeats; repeat += 1) {
    for (const env of ENVIRONMENTS) {
      const wall = runVitest([
        "--project",
        env,
        "--reporter=json",
        "--outputFile",
        path.join(RESULTS, `tests-${env}-run-${repeat}.json`),
        "--no-file-parallelism",
        "--maxWorkers=1",
      ]);
      summary.wall.testsSerial[env].push(wall);
      console.log(`  serial   repeat ${repeat}/${testRepeats} ${env}: ${(wall / 1000).toFixed(1)} s`);
    }
  }
  for (const env of ENVIRONMENTS) summary.wall.testsParallel[env] = [];
  for (let repeat = 1; repeat <= testRepeats; repeat += 1) {
    // How long the same suite takes with Vitest's default file parallelism.
    for (const env of ENVIRONMENTS) {
      const wall = runVitest([
        "--project",
        env,
        "--reporter=json",
        "--outputFile",
        path.join(RESULTS, `tests-parallel-${env}-run-${repeat}.json`),
      ]);
      summary.wall.testsParallel[env].push(wall);
      console.log(`  parallel repeat ${repeat}/${testRepeats} ${env}: ${(wall / 1000).toFixed(1)} s`);
    }
  }

  // --------------------------------------------------------- phase 2: React scenarios
  phase(`phase 2: React scenarios x ${repeats} repeats (one fresh environment per scenario)`);
  const fragments = path.join(RESULTS, "fragments");
  fs.rmSync(fragments, { recursive: true, force: true });
  for (const env of ENVIRONMENTS) summary.wall.bench[env] = [];
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    for (const env of ENVIRONMENTS) {
      const wall = runVitest(["--config", "vitest.bench.config.ts", "--project", env], {
        BENCH_OUT_DIR: path.join(fragments, env, `run-${repeat}`),
      });
      summary.wall.bench[env].push(wall);
      console.log(`  repeat ${repeat}/${repeats} ${env}: ${(wall / 1000).toFixed(1)} s`);
    }
  }

  // ------------------------------------------------------------- phase 3: startup suite
  if (!skipStartup) {
    phase(`phase 3: environment startup (${startupFiles} tiny test files x ${repeats} repeats)`);
    const generatedDir = path.join(root, "bench", "generated");
    fs.rmSync(generatedDir, { recursive: true, force: true });
    fs.mkdirSync(generatedDir, { recursive: true });
    for (let index = 1; index <= startupFiles; index += 1) {
      const name = `case-${String(index).padStart(2, "0")}.case.ts`;
      fs.writeFileSync(
        path.join(generatedDir, name),
        `import { expect, it } from "vitest";

// One of ${startupFiles} identical files: the only work is creating the DOM environment and
// touching it once, so a whole-suite run measures the per-file environment cost.
it("case ${index}", () => {
  if (typeof document === "undefined") {
    expect(true).toBe(true);
    return;
  }
  const element = document.createElement("div");
  element.innerHTML = "<p>case</p>";
  document.body.append(element);
  expect(document.body.contains(element)).toBe(true);
});
`,
      );
    }

    const projects = ["node", ...ENVIRONMENTS];
    for (const mode of ["serial", "parallel"]) {
      const key = mode === "serial" ? "startupSerial" : "startupParallel";
      for (const project of projects) summary.wall[key][project] = [];
      for (let repeat = 1; repeat <= repeats; repeat += 1) {
        for (const project of projects) {
          const wall = runVitest(
            [
              "--config",
              "vitest.startup.config.ts",
              "--project",
              project,
              "--reporter=json",
              "--outputFile",
              path.join(RESULTS, `startup-${mode}-${project}.json`),
            ],
            { STARTUP_MODE: mode },
          );
          summary.wall[key][project].push(wall);
          console.log(`  ${mode.padEnd(8)} repeat ${repeat}/${repeats} ${project}: ${(wall / 1000).toFixed(2)} s`);
        }
      }
    }
  }

  fs.writeFileSync(path.join(RESULTS, "bench-summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\nsummary: ${path.join(RESULTS, "bench-summary.json")}`);

  // -------------------------------------------------------------------- phase 4: report
  phase("phase 4: comparison report");
  const compare = spawnSync(process.execPath, [path.join(root, "scripts", "compare.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  if (compare.status !== 0) throw new Error("compare.mjs が失敗しました");
} catch (error) {
  console.error(`\nベンチマーク失敗: ${error.message}`);
  process.exit(1);
}
