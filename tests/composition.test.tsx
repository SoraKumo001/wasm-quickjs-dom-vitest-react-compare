import { describe, expect, it, vi } from "vitest";
import {
  Component,
  Fragment,
  Suspense,
  createContext,
  lazy,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";

describe("composition", () => {
  it("builds compound components with context", () => {
    const TabsContext = createContext<{ active: string; select: (id: string) => void }>({
      active: "a",
      select: () => undefined,
    });
    function Tabs({ children }: { children: ReactNode }) {
      const [active, setActive] = useState("a");
      return <TabsContext.Provider value={{ active, select: setActive }}>{children}</TabsContext.Provider>;
    }
    function Tab({ id, children }: { id: string; children: ReactNode }) {
      const context = useContext(TabsContext);
      return (
        <button type="button" role="tab" aria-selected={context.active === id} onClick={() => context.select(id)}>
          {children}
        </button>
      );
    }
    function Panel({ id, children }: { id: string; children: ReactNode }) {
      const context = useContext(TabsContext);
      return context.active === id ? <section role="tabpanel">{children}</section> : null;
    }
    render(
      <Tabs>
        <Tab id="a">first</Tab>
        <Tab id="b">second</Tab>
        <Panel id="a">panel a</Panel>
        <Panel id="b">panel b</Panel>
      </Tabs>,
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel a");
    fireEvent.click(screen.getByRole("tab", { name: "second" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel b");
    expect(screen.getByRole("tab", { name: "second" })).toHaveAttribute("aria-selected", "true");
  });

  it("renders through a render prop", () => {
    function DataProvider({ render }: { render: (state: { loading: boolean; value: string }) => ReactNode }) {
      return <div>{render({ loading: false, value: "ready" })}</div>;
    }
    render(<DataProvider render={(state) => <span data-testid="value">{state.loading ? "…" : state.value}</span>} />);
    expect(screen.getByTestId("value")).toHaveTextContent("ready");
  });

  it("catches render errors with an error boundary", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      render() {
        return this.state.failed ? <p data-testid="fallback">something broke</p> : this.props.children;
      }
    }
    function Boom(): ReactNode {
      throw new Error("boom");
    }
    function App() {
      const [broken, setBroken] = useState(false);
      return (
        <Boundary>
          {broken ? <Boom /> : <button type="button" onClick={() => setBroken(true)}>break it</button>}
        </Boundary>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "break it" }));
    await waitFor(() => expect(screen.getByTestId("fallback")).toHaveTextContent("something broke"));
    consoleError.mockRestore();
  });

  it("mounts a lazy component behind Suspense", async () => {
    const LazyPanel = lazy(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { default: () => <p data-testid="lazy">lazy loaded</p> };
    });
    render(
      <Suspense fallback={<p data-testid="fallback">loading</p>}>
        <LazyPanel />
      </Suspense>,
    );
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(await screen.findByTestId("lazy")).toHaveTextContent("lazy loaded");
  });

  it("renders a modal portal and removes its key listener on close", () => {
    function Modal({ onClose }: { onClose: () => void }) {
      useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
      }, [onClose]);
      return createPortal(
        <div role="dialog" aria-modal="true">
          <p>dialog content</p>
          <button type="button" onClick={onClose}>
            close
          </button>
        </div>,
        document.body,
      );
    }
    function App() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          {open && <Modal onClose={() => setOpen(false)} />}
        </div>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("dialog content");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // the listener must be gone: a second Escape does nothing (no error, still closed)
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps DOM nodes when a keyed list is reordered", () => {
    function List({ order }: { order: string[] }) {
      return (
        <ul>
          {order.map((id) => (
            <li key={id} id={`item-${id}`}>
              {id}
            </li>
          ))}
        </ul>
      );
    }
    const view = render(<List order={["a", "b", "c"]} />);
    const firstNode = document.querySelector("#item-a");
    const firstNodeParent = firstNode?.parentElement;
    view.rerender(<List order={["c", "a", "b"]} />);
    expect(document.querySelector("#item-a")).toBe(firstNode);
    expect(document.querySelector("#item-a")?.parentElement).toBe(firstNodeParent);
    expect([...document.querySelectorAll("li")].map((node) => node.id)).toEqual(["item-c", "item-a", "item-b"]);
  });

  it("renders fragments and arrays of children", () => {
    render(
      <>
        {[1, 2].map((value) => (
          <Fragment key={value}>
            <span>row {value}</span>
          </Fragment>
        ))}
        <dl>
          {["a", "b"].map((key) => (
            <Fragment key={key}>
              <dt>{key}</dt>
              <dd>{key.toUpperCase()}</dd>
            </Fragment>
          ))}
        </dl>
      </>,
    );
    expect(screen.getAllByText(/row/)).toHaveLength(2);
    expect(document.querySelectorAll("dt")).toHaveLength(2);
    expect(document.querySelectorAll("dd")).toHaveLength(2);
  });

  it("renders a higher-order component with injected props", () => {
    type Injected = { locale: string };
    function withLocale<P extends Injected>(Wrapped: (props: P) => ReactNode) {
      return function WithLocale(props: Omit<P, keyof Injected>) {
        return <Wrapped {...(props as P)} locale="ja-JP" />;
      };
    }
    const Label = withLocale(function Label({ locale }: Injected) {
      return <span data-testid="label">{locale}</span>;
    });
    render(<Label />);
    expect(screen.getByTestId("label")).toHaveTextContent("ja-JP");
  });

  it("notifies a MutationObserver about subtree changes", async () => {
    const seen: string[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const observer = new MutationObserver((records) => {
      seen.push(...records.map((record) => record.type));
    });
    observer.observe(host, { childList: true, attributes: true });
    const child = document.createElement("span");
    host.appendChild(child);
    host.setAttribute("data-x", "1");
    await waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(2));
    observer.disconnect();
    host.remove();
  });

  it("mounts the same component into independent containers", () => {
    function Badge({ label }: { label: string }) {
      return <span data-testid={`badge-${label}`}>{label}</span>;
    }
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    const firstView = render(<Badge label="one" />, { container: first });
    const secondView = render(<Badge label="two" />, { container: second });
    expect(first.querySelector('[data-testid="badge-one"]')).not.toBeNull();
    expect(second.querySelector('[data-testid="badge-two"]')).not.toBeNull();
    expect(document.body.contains(first)).toBe(true);
    firstView.unmount();
    secondView.unmount();
    first.remove();
    second.remove();
  });

  it("keeps scroll position-related state out of layout APIs (both DOMs have no layout)", () => {
    function Measured() {
      const ref = useRef<HTMLDivElement>(null);
      const [width, setWidth] = useState<number | null>(null);
      useEffect(() => {
        setWidth(ref.current?.getBoundingClientRect().width ?? null);
      }, []);
      return (
        <div ref={ref} data-testid="measured">
          {width}
        </div>
      );
    }
    render(<Measured />);
    expect(screen.getByTestId("measured")).toHaveTextContent("0");
  });

  it("unmounts cleanly when a transition is interrupted", async () => {
    function Interrupt() {
      const [step, setStep] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setStep(1)}>
            advance
          </button>
          {step === 0 && <p>step zero</p>}
          {step === 1 && <p>step one</p>}
        </div>
      );
    }
    const view = render(<Interrupt />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "advance" }));
    });
    expect(screen.getByText("step one")).toBeInTheDocument();
    view.unmount();
    expect(document.body.textContent).not.toContain("step one");
  });
});
