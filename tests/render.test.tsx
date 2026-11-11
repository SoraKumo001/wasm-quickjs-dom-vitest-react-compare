import { describe, expect, it } from "vitest";
import { createContext, useContext, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";

describe("rendering", () => {
  it("renders static markup", () => {
    render(
      <main>
        <h1>Hello</h1>
        <p id="lead">wasm-quickjs-dom vs jsdom</p>
      </main>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hello");
    expect(document.querySelector("#lead")?.textContent).toBe("wasm-quickjs-dom vs jsdom");
  });

  it("renders a list with keys", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `item-${i}` }));
    render(
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    expect(screen.getByText("item-49")).toBeInTheDocument();
  });

  it("renders conditionals from state", () => {
    function Toggle() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen((v) => !v)}>
            toggle
          </button>
          {open ? <p>open</p> : <p>closed</p>}
        </div>
      );
    }
    render(<Toggle />);
    expect(screen.getByText("closed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("applies class names, attributes and inline styles", () => {
    render(
      <section className="card wide" data-testid="card" title="t" hidden={false} style={{ marginTop: 4 }}>
        <span className="label">x</span>
      </section>,
    );
    const card = screen.getByTestId("card");
    expect(card).toHaveClass("card", "wide");
    expect(card).toHaveAttribute("title", "t");
    expect(card.style.marginTop).toBe("4px");
  });

  it("renders table structure that the HTML parser must fix up", () => {
    render(
      <table>
        <tbody>
          <tr>
            <td>a</td>
            <td>b</td>
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelectorAll("table > tbody > tr > td")).toHaveLength(2);
    expect(document.querySelector("table")?.outerHTML).toContain("<tbody>");
  });

  it("renders SVG elements and attributes", () => {
    render(
      <svg viewBox="0 0 10 10" width="10" height="10" data-testid="svg">
        <circle cx="5" cy="5" r="4" className="dot" />
      </svg>,
    );
    const svg = screen.getByTestId("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 10 10");
    const circle = svg.querySelector("circle");
    expect(circle).not.toBeNull();
    expect(circle?.getAttribute("r")).toBe("4");
    expect(circle?.getAttribute("class")).toBe("dot");
  });

  it("renders a portal into document.body", () => {
    const { container } = render(
      <div>
        <span>inline</span>
        {createPortal(<div data-testid="portal">portal</div>, document.body)}
      </div>,
    );
    expect(screen.getByTestId("portal")).toBeInTheDocument();
    expect(container.contains(screen.getByTestId("portal"))).toBe(false);
    expect(document.body.contains(screen.getByTestId("portal"))).toBe(true);
  });

  it("passes context through nested consumers", () => {
    const Theme = createContext("light");
    function Leaf() {
      return <span data-testid="theme">{useContext(Theme)}</span>;
    }
    render(
      <Theme.Provider value="dark">
        <div>
          <Leaf />
        </div>
      </Theme.Provider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("renders controlled form controls with values", () => {
    render(
      <form>
        <label htmlFor="name">name</label>
        <input id="name" value="typed" readOnly />
        <input type="checkbox" checked readOnly aria-label="agree" />
        <select aria-label="pick" value="b" readOnly>
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
        <textarea aria-label="note" value="hello" readOnly />
      </form>,
    );
    expect(screen.getByLabelText("name")).toHaveValue("typed");
    expect(screen.getByLabelText("agree")).toBeChecked();
    expect(screen.getByLabelText("pick")).toHaveValue("b");
    expect(screen.getByLabelText("note")).toHaveValue("hello");
  });

  it("renders dangerouslySetInnerHTML", () => {
    render(<div data-testid="html" dangerouslySetInnerHTML={{ __html: "<b>bold</b><i>italic</i>" }} />);
    const el = screen.getByTestId("html");
    expect(el.querySelectorAll("b, i")).toHaveLength(2);
    expect(el.innerHTML).toBe("<b>bold</b><i>italic</i>");
  });
});
