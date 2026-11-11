import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("interaction", () => {
  it("updates state on fireEvent.click", () => {
    function Counter() {
      const [count, setCount] = useState(0);
      return (
        <button type="button" onClick={() => setCount((n) => n + 1)}>
          {count}
        </button>
      );
    }
    render(<Counter />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveTextContent("2");
  });

  it("updates a controlled input on fireEvent.change", () => {
    function Input() {
      const [value, setValue] = useState("");
      return (
        <div>
          <input aria-label="q" value={value} onChange={(e) => setValue(e.target.value)} />
          <output>{value}</output>
        </div>
      );
    }
    render(<Input />);
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "wasm" } });
    expect(screen.getByLabelText("q")).toHaveValue("wasm");
    expect(document.querySelector("output")?.textContent).toBe("wasm");
  });

  it("fires keydown handlers", () => {
    const onEnter = vi.fn();
    render(
      <input
        aria-label="kd"
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter(event.key);
        }}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText("kd"), { key: "Enter", code: "Enter" });
    expect(onEnter).toHaveBeenCalledWith("Enter");
  });

  it("moves focus and reports document.activeElement", () => {
    render(
      <div>
        <input aria-label="a" />
        <input aria-label="b" />
      </div>,
    );
    const second = screen.getByLabelText("b");
    second.focus();
    expect(document.activeElement).toBe(second);
    second.blur();
    expect(document.activeElement).not.toBe(second);
  });

  it("toggles a checkbox", () => {
    function Box() {
      const [checked, setChecked] = useState(false);
      return <input type="checkbox" aria-label="cb" checked={checked} onChange={(e) => setChecked(e.target.checked)} />;
    }
    render(<Box />);
    const box = screen.getByLabelText("cb");
    fireEvent.click(box);
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
  });

  it("submits a form and can prevent the default", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <button type="submit">send</button>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "send" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("handles userEvent.click", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <button type="button" onClick={onClick}>
        press
      </button>,
    );
    await user.click(screen.getByRole("button", { name: "press" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("handles userEvent.type into a controlled input", async () => {
    const user = userEvent.setup();
    function Field() {
      const [value, setValue] = useState("");
      return <input aria-label="f" value={value} onChange={(e) => setValue(e.target.value)} />;
    }
    render(<Field />);
    await user.type(screen.getByLabelText("f"), "abc");
    expect(screen.getByLabelText("f")).toHaveValue("abc");
  });

  it("handles userEvent.selectOptions", async () => {
    const user = userEvent.setup();
    function Pick() {
      const [value, setValue] = useState("a");
      return (
        <select aria-label="pick" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
      );
    }
    render(<Pick />);
    await user.selectOptions(screen.getByLabelText("pick"), "b");
    expect(screen.getByLabelText("pick")).toHaveValue("b");
  });
});
