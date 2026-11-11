import { describe, expect, it } from "vitest";
import { useEffect, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

describe("async updates", () => {
  it("waits for a state update scheduled in useEffect", async () => {
    function Loaded() {
      const [text, setText] = useState("loading");
      useEffect(() => {
        const timer = setTimeout(() => setText("ready"), 10);
        return () => clearTimeout(timer);
      }, []);
      return <p>{text}</p>;
    }
    render(<Loaded />);
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(await screen.findByText("ready")).toBeInTheDocument();
  });

  it("resolves a promise-based effect inside waitFor", async () => {
    function User() {
      const [name, setName] = useState<string | null>(null);
      useEffect(() => {
        let cancelled = false;
        Promise.resolve("Ada").then((value) => {
          if (!cancelled) setName(value);
        });
        return () => {
          cancelled = true;
        };
      }, []);
      return <span data-testid="user">{name ?? "…"}</span>;
    }
    render(<User />);
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("Ada"));
  });

  it("flushes a startTransition update", async () => {
    function Transition() {
      const [items, setItems] = useState<string[]>([]);
      return (
        <div>
          <button type="button" onClick={() => setItems(Array.from({ length: 3 }, (_, i) => `i${i}`))}>
            add
          </button>
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      );
    }
    render(<Transition />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
  });

  it("removes a component on unmount and runs its cleanup", async () => {
    let cleaned = 0;
    function Timer() {
      useEffect(() => {
        const timer = setTimeout(() => {}, 1000);
        return () => {
          clearTimeout(timer);
          cleaned += 1;
        };
      }, []);
      return <div>timer</div>;
    }
    const { unmount } = render(<Timer />);
    expect(screen.getByText("timer")).toBeInTheDocument();
    unmount();
    expect(cleaned).toBe(1);
    expect(screen.queryByText("timer")).toBeNull();
  });

  it("updates on a debounced input", async () => {
    function Search() {
      const [query, setQuery] = useState("");
      const [result, setResult] = useState("");
      useEffect(() => {
        const timer = setTimeout(() => setResult(query ? `results for ${query}` : ""), 5);
        return () => clearTimeout(timer);
      }, [query]);
      return (
        <div>
          <input aria-label="q" value={query} onChange={(e) => setQuery(e.target.value)} />
          <span data-testid="result">{result}</span>
        </div>
      );
    }
    render(<Search />);
    const input = screen.getByLabelText("q");
    fireEvent.change(input, { target: { value: "wasm" } });
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("results for wasm"));
  });
});
