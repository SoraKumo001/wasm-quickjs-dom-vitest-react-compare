import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

describe("jest-dom matchers", () => {
  it("toBeInTheDocument / toBeEmptyDOMElement / toContainElement", () => {
    render(
      <div data-testid="outer">
        <span data-testid="inner">text</span>
        <div data-testid="empty" />
      </div>,
    );
    expect(screen.getByTestId("inner")).toBeInTheDocument();
    expect(screen.queryByTestId("missing")).not.toBeInTheDocument();
    expect(screen.getByTestId("empty")).toBeEmptyDOMElement();
    expect(screen.getByTestId("outer")).toContainElement(screen.getByTestId("inner"));
  });

  it("toHaveAttribute / toHaveClass / toHaveStyle", () => {
    render(
      <div
        data-testid="el"
        className="a b"
        title="hello"
        style={{ color: "rgb(255, 0, 0)", display: "block" }}
      />,
    );
    const el = screen.getByTestId("el");
    expect(el).toHaveAttribute("title", "hello");
    expect(el).toHaveClass("a", "b");
    expect(el).toHaveStyle({ display: "block" });
  });

  it("toHaveTextContent / toHaveValue / toBeDisabled / toBeRequired", () => {
    render(
      <div>
        <p data-testid="text">multi word text</p>
        <input aria-label="val" value="value" readOnly />
        <button type="button" disabled>
          off
        </button>
        <input aria-label="req" required />
      </div>,
    );
    expect(screen.getByTestId("text")).toHaveTextContent(/word text/);
    expect(screen.getByLabelText("val")).toHaveValue("value");
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByLabelText("req")).toBeRequired();
  });

  it("toHaveFocus / toHaveAccessibleName / toHaveAccessibleDescription", () => {
    render(
      <div>
        <button type="button" aria-describedby="hint">
          Save
        </button>
        <p id="hint">Saves the form</p>
        <input aria-label="field" />
      </div>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAccessibleName("Save");
    expect(button).toHaveAccessibleDescription("Saves the form");
    const field = screen.getByLabelText("field");
    field.focus();
    expect(field).toHaveFocus();
  });
});
