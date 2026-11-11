/**
 * Benchmark harness.
 *
 * Each scenario lives in its own test file (`scenarios/NN-*.bench.tsx` -> `runScenario(N)`) so that
 * Vitest creates a fresh DOM environment for it. That matters: rendering thousands of nodes in one
 * long test file leaves garbage behind in the page's heap (jsdom: V8, wasm-quickjs-dom: QuickJS), and
 * queries measured after that suffer from GC pauses that belong to the *previous* scenario.
 *
 * The runner (`scripts/bench.mjs`) sets `BENCH_OUT_DIR`; each scenario writes its raw samples there
 * and `scripts/compare.mjs` merges the repeats into the report.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createContext, useContext, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const envName = process.env.TEST_ENV ?? "unknown";
const outDir = process.env.BENCH_OUT_DIR ?? path.resolve("results", "fragments", envName, "manual");

/** `scripts/bench.mjs` starts Vitest with `NODE_OPTIONS=--expose-gc`; collecting between
 *  iterations keeps V8 GC pauses out of the measured window. */
const collectGarbage = (globalThis as unknown as { gc?: () => void }).gc ?? (() => {});

// --- fixtures -------------------------------------------------------------------------------

export function RowList({ count, seed = 0 }: { count: number; seed?: number }) {
  return (
    <ul data-testid="list">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="row" data-id={index} data-seed={seed}>
          <span className="label">Item {index}</span>
          <a href={`#/${index}`}>open</a>
          <button type="button" onClick={() => undefined}>
            act
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SimpleList({ count }: { count: number }) {
  return (
    <ul>
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>Item {index}</li>
      ))}
    </ul>
  );
}

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        count: {count}
      </button>
      <p>clicked {count} times</p>
    </div>
  );
}

export function Field() {
  const [value, setValue] = useState("");
  return <input aria-label="field" value={value} onChange={(event) => setValue(event.target.value)} />;
}

export const Theme = createContext<"light" | "dark">("light");

export function ThemedList({ count }: { count: number }) {
  const theme = useContext(Theme);
  return (
    <div data-theme={theme}>
      <RowList count={count} />
    </div>
  );
}

export function ProfileForm() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
    >
      <label htmlFor="profile-name">name</label>
      <input id="profile-name" name="name" />
      <label htmlFor="profile-email">email</label>
      <input id="profile-email" name="email" type="email" />
      <label htmlFor="profile-role">role</label>
      <select id="profile-role" name="role">
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
      <button type="submit">submit</button>
      {submitted && <output>saved</output>}
    </form>
  );
}

export const CARDS = 300;
const TYPED = "abcdefghij";

export function CardGrid({ count }: { count: number }) {
  return (
    <section>
      {Array.from({ length: count }, (_, index) => (
        <article key={index} className="card">
          <h2>Card {index}</h2>
          <a href={`#/card-${index}`}>open card {index}</a>
          <button type="button" onClick={() => undefined}>
            action {index}
          </button>
          <label>
            field {index}
            <input aria-label={`field ${index}`} defaultValue="" />
          </label>
        </article>
      ))}
    </section>
  );
}

// --- measurement ----------------------------------------------------------------------------

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

export interface Scenario {
  name: string;
  runs: number;
  /** Operations inside one measured sample (e.g. 100 clicks) -> per-op time. */
  opsPerRun?: number;
  warmup?: number;
  /** `setup()` builds the fixture and returns the function to measure. */
  setup: () => () => void | Promise<void>;
}

async function measure(scenario: Scenario): Promise<number[]> {
  const warmup = scenario.warmup ?? 2;
  for (let index = 0; index < warmup; index += 1) {
    const timed = scenario.setup();
    await timed();
    cleanup();
    collectGarbage();
  }
  const samples: number[] = [];
  for (let index = 0; index < scenario.runs; index += 1) {
    collectGarbage();
    const timed = scenario.setup();
    const start = performance.now();
    await timed();
    samples.push(performance.now() - start);
    cleanup();
    collectGarbage();
  }
  return samples;
}

export const SCENARIOS: Scenario[] = [
  // --- a single tiny component (the shape of a normal component test) ------------------------
  {
    name: "render <Counter/>",
    runs: 20,
    opsPerRun: 5,
    warmup: 4,
    setup: () => () => {
      for (let index = 0; index < 5; index += 1) {
        const view = render(<Counter />);
        view.unmount();
      }
    },
  },
  // --- mount ---------------------------------------------------------------------------------
  {
    name: "mount 100 rows",
    runs: 8,
    opsPerRun: 3,
    warmup: 4,
    setup: () => () => {
      for (let index = 0; index < 3; index += 1) {
        const view = render(<RowList count={100} />);
        view.unmount();
      }
    },
  },
  {
    name: "mount 1000 simple rows",
    runs: 5,
    warmup: 3,
    setup: () => () => void render(<SimpleList count={1000} />),
  },
  {
    name: "mount 1000 rows",
    runs: 5,
    warmup: 4,
    setup: () => () => void render(<RowList count={1000} />),
  },
  {
    name: "mount 3000 rows",
    runs: 3,
    warmup: 3,
    setup: () => () => void render(<RowList count={3000} />),
  },
  {
    name: "unmount 1000 rows",
    runs: 5,
    setup: () => {
      const view = render(<RowList count={1000} />);
      return () => void view.unmount();
    },
  },
  // --- updates -------------------------------------------------------------------------------
  {
    name: "update 100 rows (5 prop changes)",
    runs: 8,
    opsPerRun: 5,
    warmup: 8,
    setup: () => {
      const view = render(<RowList count={100} seed={0} />);
      return () => {
        for (let seed = 1; seed <= 5; seed += 1) view.rerender(<RowList count={100} seed={seed} />);
      };
    },
  },
  {
    name: "rerender 1000 rows",
    runs: 10,
    opsPerRun: 2,
    warmup: 6,
    setup: () => {
      const view = render(<RowList count={1000} />);
      return () => {
        for (let seed = 1; seed <= 2; seed += 1) view.rerender(<RowList count={1000} seed={seed} />);
      };
    },
  },
  // --- events --------------------------------------------------------------------------------
  {
    name: "fireEvent.click x100",
    runs: 5,
    opsPerRun: 100,
    warmup: 3,
    setup: () => {
      render(<Counter />);
      const button = screen.getByRole("button");
      return () => {
        for (let index = 0; index < 100; index += 1) fireEvent.click(button);
      };
    },
  },
  {
    name: "userEvent.click x5",
    runs: 3,
    opsPerRun: 5,
    warmup: 1,
    setup: () => {
      const user = userEvent.setup();
      render(<Counter />);
      const button = screen.getByRole("button", { name: /count:/ });
      return async () => {
        for (let index = 0; index < 5; index += 1) await user.click(button);
      };
    },
  },
  {
    name: "userEvent.type 10 chars",
    runs: 3,
    opsPerRun: TYPED.length,
    warmup: 1,
    setup: () => {
      const user = userEvent.setup();
      render(<Field />);
      const input = screen.getByLabelText("field");
      return async () => {
        await user.type(input, TYPED);
      };
    },
  },
  // --- DOM reads from the host ---------------------------------------------------------------
  {
    name: "querySelectorAll('.row') + iterate, 1000 rows",
    runs: 5,
    setup: () => {
      render(<RowList count={1000} />);
      return () => {
        let total = 0;
        for (const row of document.querySelectorAll(".row")) total += row.className.length;
        return total;
      };
    },
  },
  {
    name: "read textContent of 1000 rows",
    runs: 5,
    setup: () => {
      render(<RowList count={1000} />);
      return () => void (document.querySelector('[data-testid="list"]') as HTMLElement).textContent;
    },
  },
  // --- @testing-library/dom queries ----------------------------------------------------------
  {
    name: `getByText on ${CARDS} cards`,
    runs: 6,
    warmup: 3,
    setup: () => {
      render(<CardGrid count={CARDS} />);
      return () => void screen.getByText("Card 150");
    },
  },
  {
    name: `getAllByRole('link') on ${CARDS} cards`,
    runs: 5,
    warmup: 3,
    setup: () => {
      render(<CardGrid count={CARDS} />);
      return () => void screen.getAllByRole("link");
    },
  },
  {
    name: `getByRole('button', {name}) on ${CARDS} cards`,
    runs: 5,
    warmup: 3,
    setup: () => {
      render(<CardGrid count={CARDS} />);
      return () => void screen.getByRole("button", { name: "action 150" });
    },
  },
  {
    name: `getByLabelText on ${CARDS} cards`,
    runs: 5,
    warmup: 3,
    setup: () => {
      render(<CardGrid count={CARDS} />);
      return () => void screen.getByLabelText("field 150");
    },
  },
  // --- typical higher-level component-test flows ----------------------------------------------
  {
    name: "mount 100 rows under a context provider",
    runs: 6,
    opsPerRun: 3,
    warmup: 3,
    setup: () => () => {
      for (let index = 0; index < 3; index += 1) {
        const view = render(
          <Theme.Provider value="dark">
            <ThemedList count={100} />
          </Theme.Provider>,
        );
        view.unmount();
      }
    },
  },
  {
    name: "fireEvent.input x50",
    runs: 5,
    opsPerRun: 50,
    warmup: 2,
    setup: () => {
      render(<Field />);
      const input = screen.getByLabelText("field");
      return () => {
        for (let index = 0; index < 50; index += 1) fireEvent.input(input, { target: { value: `v${index}` } });
      };
    },
  },
  {
    name: "form fill + submit (userEvent)",
    runs: 3,
    warmup: 1,
    setup: () => {
      const user = userEvent.setup();
      render(<ProfileForm />);
      return async () => {
        await user.type(screen.getByLabelText("name"), "Ada");
        await user.type(screen.getByLabelText("email"), "ada@example.com");
        await user.selectOptions(screen.getByLabelText("role"), "admin");
        await user.click(screen.getByRole("button", { name: "submit" }));
      };
    },
  },
  {
    name: "rerender <Counter/> x100",
    runs: 5,
    opsPerRun: 100,
    warmup: 2,
    setup: () => {
      const view = render(<Counter />);
      return () => {
        for (let index = 0; index < 100; index += 1) view.rerender(<Counter />);
      };
    },
  },
  {
    name: `findByText (async query) on ${CARDS} cards`,
    runs: 5,
    warmup: 2,
    setup: () => {
      render(<CardGrid count={CARDS} />);
      return async () => {
        await screen.findByText("Card 150");
      };
    },
  },
  {
    name: "expect(...).toHaveTextContent on 1000 rows",
    runs: 5,
    warmup: 2,
    setup: () => {
      render(<RowList count={1000} />);
      const list = document.querySelector('[data-testid="list"]') as HTMLElement;
      return () => {
        expect(list).toHaveTextContent("Item 999");
      };
    },
  },
];

/** Registers and runs scenario `index`; called from each `bench/scenarios/*.bench.tsx` file. */
export function runScenario(index: number): void {
  const scenario = SCENARIOS[index];
  if (!scenario) throw new Error(`シナリオ ${index} は存在しません`);
  it(
    scenario.name,
    async () => {
      const samples = await measure(scenario);
      expect(samples).toHaveLength(scenario.runs);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, `scenario-${String(index).padStart(2, "0")}.json`),
        JSON.stringify(
          {
            environment: envName,
            index,
            name: scenario.name,
            opsPerRun: scenario.opsPerRun ?? 1,
            runs: scenario.runs,
            samples,
          },
          null,
          2,
        ),
      );
      // Keep the sorted sample in the log so a suspicious median is visible without the JSON.
      const sorted = [...samples].sort((a, b) => a - b);
      console.log(
        `[${envName}] ${scenario.name}: median ${percentile(sorted, 0.5).toFixed(2)} ms` +
          ` (min ${sorted[0].toFixed(2)}, max ${sorted[sorted.length - 1].toFixed(2)}, n=${samples.length})`,
      );
    },
    180_000,
  );
}
