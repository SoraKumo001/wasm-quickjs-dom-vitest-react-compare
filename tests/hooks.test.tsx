import { describe, expect, it, vi } from "vitest";
import {
  createContext,
  forwardRef,
  memo,
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

describe("hooks", () => {
  it("updates with useReducer", () => {
    type Action = { type: "inc" } | { type: "dec" } | { type: "reset" };
    function reducer(state: number, action: Action) {
      if (action.type === "inc") return state + 1;
      if (action.type === "dec") return state - 1;
      return 0;
    }
    function Reducer() {
      const [count, dispatch] = useReducer(reducer, 10);
      return (
        <div>
          <span data-testid="count">{count}</span>
          <button type="button" onClick={() => dispatch({ type: "inc" })}>
            inc
          </button>
          <button type="button" onClick={() => dispatch({ type: "dec" })}>
            dec
          </button>
        </div>
      );
    }
    render(<Reducer />);
    fireEvent.click(screen.getByRole("button", { name: "inc" }));
    fireEvent.click(screen.getByRole("button", { name: "dec" }));
    fireEvent.click(screen.getByRole("button", { name: "dec" }));
    expect(screen.getByTestId("count")).toHaveTextContent("9");
  });

  it("keeps a mutable value in useRef without re-rendering", () => {
    let renders = 0;
    function Refs() {
      renders += 1;
      const ref = useRef(0);
      return (
        <button
          type="button"
          onClick={() => {
            ref.current += 1;
          }}
        >
          {ref.current}
        </button>
      );
    }
    render(<Refs />);
    const before = renders;
    fireEvent.click(screen.getByRole("button"));
    expect(renders).toBe(before);
  });

  it("runs layout effects before passive effects", () => {
    const order: string[] = [];
    function Effects() {
      useLayoutEffect(() => {
        order.push("layout");
      }, []);
      useEffect(() => {
        order.push("passive");
      }, []);
      return <span>effects</span>;
    }
    render(<Effects />);
    expect(order).toEqual(["layout", "passive"]);
  });

  it("cleans up effects on unmount", () => {
    const log: string[] = [];
    function Effects() {
      useEffect(() => {
        log.push("mount");
        return () => log.push("cleanup");
      }, []);
      return <p>mounted</p>;
    }
    const view = render(<Effects />);
    expect(log).toEqual(["mount"]);
    view.unmount();
    expect(log).toEqual(["mount", "cleanup"]);
  });

  it("keeps useId stable and unique", () => {
    function Ids() {
      const first = useId();
      const second = useId();
      return (
        <div>
          <span data-testid="first">{first}</span>
          <span data-testid="second">{second}</span>
        </div>
      );
    }
    const view = render(<Ids />);
    const first = screen.getByTestId("first").textContent;
    const second = screen.getByTestId("second").textContent;
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
    view.rerender(<Ids />);
    expect(screen.getByTestId("first").textContent).toBe(first);
  });

  it("memoizes derived values with useMemo", () => {
    let computations = 0;
    function Memo({ items }: { items: number[] }) {
      const total = useMemo(() => {
        computations += 1;
        return items.reduce((sum, value) => sum + value, 0);
      }, [items]);
      return <span data-testid="total">{total}</span>;
    }
    const items = [1, 2, 3];
    const view = render(<Memo items={items} />);
    view.rerender(<Memo items={items} />);
    expect(computations).toBe(1);
    view.rerender(<Memo items={[4, 5]} />);
    expect(computations).toBe(2);
    expect(screen.getByTestId("total")).toHaveTextContent("9");
  });

  it("skips re-rendering memoized children with unchanged props", () => {
    let childRenders = 0;
    const Child = memo(function Child({ label }: { label: string }) {
      childRenders += 1;
      return <span>{label}</span>;
    });
    function Parent() {
      const [count, setCount] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setCount((value) => value + 1)}>
            {count}
          </button>
          <Child label="stable" />
        </div>
      );
    }
    render(<Parent />);
    const initial = childRenders;
    fireEvent.click(screen.getByRole("button"));
    expect(childRenders).toBe(initial);
  });

  it("exposes an imperative handle through forwardRef", () => {
    const FancyInput = forwardRef<{ focusField: () => void }, { label: string }>(function FancyInput(props, ref) {
      const inputRef = useRef<HTMLInputElement>(null);
      useImperativeHandle(ref, () => ({ focusField: () => inputRef.current?.focus() }), []);
      return (
        <label>
          {props.label}
          <input ref={inputRef} aria-label={props.label} />
        </label>
      );
    });
    const holder: { current: { focusField: () => void } | null } = { current: null };
    function Consumer() {
      return (
        <div>
          <FancyInput label="fancy" ref={(instance) => (holder.current = instance)} />
          <button type="button" onClick={() => holder.current?.focusField()}>
            focus
          </button>
        </div>
      );
    }
    render(<Consumer />);
    fireEvent.click(screen.getByRole("button", { name: "focus" }));
    expect(screen.getByLabelText("fancy")).toHaveFocus();
  });

  it("subscribes to an external store with useSyncExternalStore", () => {
    let value = 0;
    const listeners = new Set<() => void>();
    const store = {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => value,
      set: (next: number) => {
        value = next;
        for (const listener of listeners) listener();
      },
    };
    function External() {
      const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
      return <span data-testid="external">{snapshot}</span>;
    }
    render(<External />);
    expect(screen.getByTestId("external")).toHaveTextContent("0");
    act(() => store.set(7));
    expect(screen.getByTestId("external")).toHaveTextContent("7");
  });

  it("composes context, reducer and derived state", () => {
    const Theme = createContext<"light" | "dark">("light");
    function Themed() {
      const theme = useContext(Theme);
      return <span data-testid="theme">{theme}</span>;
    }
    function App() {
      const [dark, setDark] = useState(false);
      const theme = dark ? "dark" : "light";
      const label = useMemo(() => `theme is ${theme}`, [theme]);
      return (
        <Theme.Provider value={theme}>
          <button type="button" onClick={() => setDark((value) => !value)}>
            toggle
          </button>
          <p data-testid="label">{label}</p>
          <Themed />
        </Theme.Provider>
      );
    }
    render(<App />);
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("label")).toHaveTextContent("theme is dark");
  });

  it("renders deferred values after the urgent update", async () => {
    function Deferred() {
      const [query, setQuery] = useState("");
      const deferred = useDeferredValue(query);
      return (
        <div>
          <input aria-label="query" value={query} onChange={(event) => setQuery(event.target.value)} />
          <span data-testid="deferred">{deferred}</span>
        </div>
      );
    }
    render(<Deferred />);
    fireEvent.change(screen.getByLabelText("query"), { target: { value: "abc" } });
    expect(screen.getByLabelText("query")).toHaveValue("abc");
    await vi.waitFor(() => expect(screen.getByTestId("deferred")).toHaveTextContent("abc"));
  });
});
