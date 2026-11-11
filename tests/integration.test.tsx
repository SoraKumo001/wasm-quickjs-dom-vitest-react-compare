import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useMemo, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("integration", () => {
  it("filters a list after the debounce with fake timers", () => {
    vi.useFakeTimers();
    function Search() {
      const [query, setQuery] = useState("");
      const [applied, setApplied] = useState("");
      useEffect(() => {
        const timer = setTimeout(() => setApplied(query), 300);
        return () => clearTimeout(timer);
      }, [query]);
      const items = ["alpha", "beta", "gamma"].filter((item) => item.includes(applied));
      return (
        <div>
          <label htmlFor="search">search</label>
          <input id="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      );
    }
    render(<Search />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "a" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "et" } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("shows loading then data from fetch", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: ["one", "two"] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    function Users() {
      const [state, setState] = useState<{ loading: boolean; items: string[] }>({ loading: true, items: [] });
      useEffect(() => {
        let cancelled = false;
        fetch("/api/users")
          .then((response) => response.json())
          .then((data: { items: string[] }) => {
            if (!cancelled) setState({ loading: false, items: data.items });
          });
        return () => {
          cancelled = true;
        };
      }, []);
      return state.loading ? <p>loading…</p> : <ul>{state.items.map((item) => <li key={item}>{item}</li>)}</ul>;
    }
    render(<Users />);
    expect(screen.getByText("loading…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledWith("/api/users");
  });

  it("shows an error state when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    function ErrorState() {
      const [error, setError] = useState("");
      useEffect(() => {
        fetch("/api/broken")
          .then(() => setError(""))
          .catch((reason: Error) => setError(reason.message));
      }, []);
      return <p role="alert">{error || "no error"}</p>;
    }
    render(<ErrorState />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("network down"));
  });

  it("ignores a stale response when the query changes", async () => {
    const resolvers: Array<(value: { json: () => Promise<string> }) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve as (value: { json: () => Promise<string> }) => void);
          }),
      ),
    );
    function Search() {
      const [query, setQuery] = useState("");
      const [result, setResult] = useState("");
      useEffect(() => {
        let cancelled = false;
        void fetch(`/api/search?q=${query}`)
          .then((response) => response.json())
          .then((value: string) => {
            if (!cancelled) setResult(value);
          });
        return () => {
          cancelled = true;
        };
      }, [query]);
      return (
        <div>
          <input aria-label="q" value={query} onChange={(event) => setQuery(event.target.value)} />
          <span data-testid="result">{result}</span>
        </div>
      );
    }
    render(<Search />);
    // requests: "" on mount, then "first", then "second"
    await waitFor(() => expect(resolvers).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "first" } });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "second" } });
    await waitFor(() => expect(resolvers).toHaveLength(3));
    // the newest request resolves first ...
    resolvers[2]({ json: async () => "second result" });
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("second result"));
    // ... then the older ones resolve late and must be ignored
    resolvers[1]({ json: async () => "stale result" });
    resolvers[0]({ json: async () => "mount result" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("result")).toHaveTextContent("second result");
  });

  it("pages through results", async () => {
    const user = userEvent.setup();
    function Pager() {
      const [page, setPage] = useState(0);
      const items = useMemo(
        () => Array.from({ length: 3 }, (_, index) => `item ${page * 3 + index}`),
        [page],
      );
      return (
        <div>
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))}>
            prev
          </button>
          <button type="button" onClick={() => setPage((value) => value as number)}>
            page {page + 1}
          </button>
          <button type="button" onClick={() => setPage((value) => value + 1)}>
            next
          </button>
        </div>
      );
    }
    render(<Pager />);
    expect(screen.getByText("item 0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByText("item 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByText("item 6")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "prev" }));
    expect(screen.getByText("item 3")).toBeInTheDocument();
    expect(screen.queryByText("item 6")).toBeNull();
  });

  it("selects a detail panel from a master list", async () => {
    const user = userEvent.setup();
    const entries = [
      { id: "a", title: "Alpha", body: "first body" },
      { id: "b", title: "Beta", body: "second body" },
    ];
    function MasterDetail() {
      const [selected, setSelected] = useState(entries[0].id);
      const entry = entries.find((item) => item.id === selected)!;
      return (
        <div>
          <nav>
            {entries.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelected(item.id)}>
                {item.title}
              </button>
            ))}
          </nav>
          <article aria-label="detail">
            <h2>{entry.title}</h2>
            <p>{entry.body}</p>
          </article>
        </div>
      );
    }
    render(<MasterDetail />);
    expect(screen.getByRole("article")).toHaveTextContent("first body");
    await user.click(screen.getByRole("button", { name: "Beta" }));
    expect(screen.getByRole("article")).toHaveTextContent("second body");
    await user.click(screen.getByRole("button", { name: "Alpha" }));
    expect(screen.getByRole("article")).toHaveTextContent("first body");
  });

  it("persists a setting in localStorage", async () => {
    const user = userEvent.setup();
    function Settings() {
      const [theme, setTheme] = useState(() => localStorage.getItem("theme") ?? "light");
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <button
            type="button"
            onClick={() => {
              const next = theme === "light" ? "dark" : "light";
              localStorage.setItem("theme", next);
              setTheme(next);
            }}
          >
            toggle
          </button>
        </div>
      );
    }
    const first = render(<Settings />);
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    first.unmount();
    render(<Settings />);
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("routes with history.pushState and popstate", async () => {
    const user = userEvent.setup();
    function Router() {
      const [path, setPath] = useState(window.location.pathname);
      useEffect(() => {
        const onPopState = () => setPath(window.location.pathname);
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
      }, []);
      const navigate = (next: string) => {
        window.history.pushState({}, "", next);
        setPath(next);
      };
      return (
        <div>
          <span data-testid="path">{path}</span>
          <button type="button" onClick={() => navigate("/detail/1")}>
            open detail
          </button>
          {path === "/detail/1" && <p data-testid="detail">detail page</p>}
        </div>
      );
    }
    render(<Router />);
    expect(screen.getByTestId("path")).toHaveTextContent("/");
    await user.click(screen.getByRole("button", { name: "open detail" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/detail/1");
    expect(screen.getByTestId("detail")).toBeInTheDocument();
    act(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new Event("popstate"));
    });
    expect(screen.getByTestId("path")).toHaveTextContent("/");
    expect(screen.queryByTestId("detail")).toBeNull();
  });

  it("keeps two sibling interactive widgets independent", async () => {
    const user = userEvent.setup();
    function Counter({ label }: { label: string }) {
      const [count, setCount] = useState(0);
      return (
        <section aria-label={label}>
          <output>
            {label}: {count}
          </output>
          <button type="button" onClick={() => setCount((value) => value + 1)}>
            increment {label}
          </button>
        </section>
      );
    }
    render(
      <>
        <Counter label="left" />
        <Counter label="right" />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "increment left" }));
    await user.click(screen.getByRole("button", { name: "increment left" }));
    await user.click(screen.getByRole("button", { name: "increment right" }));
    expect(screen.getByLabelText("left")).toHaveTextContent("left: 2");
    expect(screen.getByLabelText("right")).toHaveTextContent("right: 1");
  });
});
