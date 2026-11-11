import { describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

describe("events", () => {
  it("handles double click", () => {
    const onDouble = vi.fn();
    render(
      <button type="button" onDoubleClick={onDouble}>
        twice
      </button>,
    );
    fireEvent.doubleClick(screen.getByRole("button"));
    expect(onDouble).toHaveBeenCalledTimes(1);
  });

  it("handles context menu", () => {
    const onContext = vi.fn((event: React.MouseEvent) => event.preventDefault());
    render(
      <div data-testid="area" onContextMenu={onContext}>
        area
      </div>,
    );
    fireEvent.contextMenu(screen.getByTestId("area"));
    expect(onContext).toHaveBeenCalledTimes(1);
    expect(onContext.mock.calls[0][0].defaultPrevented).toBe(true);
  });

  it("dispatches pointer events in order", () => {
    const log: string[] = [];
    const record = (name: string) => () => log.push(name);
    render(
      <button
        type="button"
        onPointerDown={record("pointerdown")}
        onPointerUp={record("pointerup")}
        onClick={record("click")}
      >
        press
      </button>,
    );
    const button = screen.getByRole("button");
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    expect(log).toEqual(["pointerdown", "pointerup", "click"]);
  });

  it("handles mouse enter/leave", () => {
    const log: string[] = [];
    render(
      <div data-testid="hover" onMouseEnter={() => log.push("enter")} onMouseLeave={() => log.push("leave")}>
        hover
      </div>,
    );
    const target = screen.getByTestId("hover");
    fireEvent.mouseOver(target);
    fireEvent.mouseOut(target);
    expect(log).toEqual(["enter", "leave"]);
  });

  it("handles wheel and scroll events", () => {
    const onWheel = vi.fn();
    const onScroll = vi.fn();
    render(
      <div data-testid="scroller" onWheel={onWheel} onScroll={onScroll} style={{ overflow: "auto" }}>
        content
      </div>,
    );
    const scroller = screen.getByTestId("scroller");
    fireEvent.wheel(scroller, { deltaY: 120 });
    fireEvent.scroll(scroller);
    expect(onWheel).toHaveBeenCalledTimes(1);
    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it("bubbles to ancestors and can be stopped", () => {
    const log: string[] = [];
    function App() {
      const [stop, setStop] = useState(false);
      return (
        <div onClick={() => log.push("outer")}>
          <div
            onClick={(event) => {
              log.push("middle");
              if (stop) event.stopPropagation();
            }}
          >
            <button type="button" onClick={() => log.push("inner")}>
              target
            </button>
          </div>
          <button type="button" onClick={() => setStop(true)}>
            enable stop
          </button>
        </div>
      );
    }
    render(<App />);
    // first click bubbles all the way up
    fireEvent.click(screen.getByRole("button", { name: "target" }));
    expect(log).toEqual(["inner", "middle", "outer"]);
    // after enabling, the middle handler stops propagation before the outer one
    fireEvent.click(screen.getByRole("button", { name: "enable stop" }));
    log.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "target" }));
    expect(log).toEqual(["inner", "middle"]);
  });

  it("runs capture handlers before bubble handlers", () => {
    const log: string[] = [];
    render(
      <div onClickCapture={() => log.push("capture")} onClick={() => log.push("bubble")}>
        <span>target</span>
      </div>,
    );
    fireEvent.click(screen.getByText("target"));
    expect(log).toEqual(["capture", "bubble"]);
  });

  it("prevents default navigation on link clicks", () => {
    let prevented = false;
    render(
      <a
        href="/somewhere"
        onClick={(event) => {
          event.preventDefault();
          prevented = event.defaultPrevented;
        }}
      >
        link
      </a>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(prevented).toBe(true);
  });

  it("updates state on the input event", () => {
    function Echo() {
      const [value, setValue] = useState("");
      return (
        <div>
          <input aria-label="echo" value={value} onChange={(event) => setValue(event.target.value)} />
          <output>{value}</output>
        </div>
      );
    }
    render(<Echo />);
    fireEvent.input(screen.getByLabelText("echo"), { target: { value: "typed" } });
    expect(document.querySelector("output")).toHaveTextContent("typed");
  });

  it("moves a selection with arrow keys", () => {
    function Selection() {
      const [active, setActive] = useState(0);
      const options = ["one", "two", "three"];
      return (
        <div>
          <ul
            role="listbox"
            aria-label="options"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") setActive((index) => Math.min(options.length - 1, index + 1));
              if (event.key === "ArrowUp") setActive((index) => Math.max(0, index - 1));
            }}
          >
            {options.map((option, index) => (
              <li key={option} role="option" aria-selected={index === active}>
                {option}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setActive(0)}>
            reset
          </button>
        </div>
      );
    }
    render(<Selection />);
    const listbox = screen.getByRole("listbox");
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "three" })).toHaveAttribute("aria-selected", "true");
  });

  it("dispatches custom events to DOM listeners", () => {
    const received: string[] = [];
    render(<div data-testid="target">target</div>);
    const target = screen.getByTestId("target");
    target.addEventListener("my-event", (event) => received.push((event as CustomEvent).detail));
    target.dispatchEvent(new CustomEvent("my-event", { detail: "payload", bubbles: true }));
    expect(received).toEqual(["payload"]);
  });

  it("reports focus and blur through React handlers", () => {
    const log: string[] = [];
    render(<input aria-label="focusable" onFocus={() => log.push("focus")} onBlur={() => log.push("blur")} />);
    const input = screen.getByLabelText("focusable");
    input.focus();
    expect(log).toEqual(["focus"]);
    input.blur();
    expect(log).toEqual(["focus", "blur"]);
  });
});
