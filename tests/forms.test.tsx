import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(() => {
  vi.useRealTimers();
});

describe("forms", () => {
  it("validates on submit and shows errors", async () => {
    const user = userEvent.setup();
    function Signup() {
      const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
      const [done, setDone] = useState(false);
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const next: typeof errors = {};
            if (!String(data.get("email") ?? "").includes("@")) next.email = "invalid email";
            if (String(data.get("password") ?? "").length < 8) next.password = "too short";
            setErrors(next);
            if (Object.keys(next).length === 0) setDone(true);
          }}
        >
          <label htmlFor="email">email</label>
          <input id="email" name="email" aria-invalid={errors.email ? true : undefined} />
          {errors.email && <p role="alert">{errors.email}</p>}
          <label htmlFor="password">password</label>
          <input id="password" name="password" type="password" />
          {errors.password && <p role="alert">{errors.password}</p>}
          <button type="submit">sign up</button>
          {done && <p data-testid="done">registered</p>}
        </form>
      );
    }
    render(<Signup />);
    await user.click(screen.getByRole("button", { name: "sign up" }));
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByLabelText("email")).toHaveAttribute("aria-invalid", "true");

    await user.type(screen.getByLabelText("email"), "a@b.c");
    await user.type(screen.getByLabelText("password"), "longenough");
    await user.click(screen.getByRole("button", { name: "sign up" }));
    expect(screen.getByTestId("done")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("selects radios by clicking their labels", async () => {
    const user = userEvent.setup();
    function Radios() {
      const [value, setValue] = useState("a");
      return (
        <fieldset>
          <legend>plan</legend>
          {["a", "b", "c"].map((option) => (
            <label key={option}>
              <input type="radio" name="plan" value={option} checked={value === option} onChange={() => setValue(option)} />
              plan {option}
            </label>
          ))}
          <output>{value}</output>
        </fieldset>
      );
    }
    render(<Radios />);
    expect(screen.getByRole("radio", { name: "plan a" })).toBeChecked();
    await user.click(screen.getByText("plan c"));
    expect(screen.getByRole("radio", { name: "plan c" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "plan a" })).not.toBeChecked();
    expect(document.querySelector("output")).toHaveTextContent("c");
  });

  it("toggles a checkbox group", async () => {
    const user = userEvent.setup();
    function Checks() {
      const [picked, setPicked] = useState<string[]>([]);
      return (
        <div>
          {["x", "y", "z"].map((item) => (
            <label key={item}>
              <input
                type="checkbox"
                checked={picked.includes(item)}
                onChange={(event) =>
                  setPicked((current) =>
                    event.target.checked ? [...current, item] : current.filter((value) => value !== item),
                  )
                }
              />
              {item}
            </label>
          ))}
          <span data-testid="picked">{picked.join(",")}</span>
        </div>
      );
    }
    render(<Checks />);
    await user.click(screen.getByLabelText("y"));
    await user.click(screen.getByLabelText("z"));
    expect(screen.getByTestId("picked")).toHaveTextContent("y,z");
    await user.click(screen.getByLabelText("y"));
    expect(screen.getByTestId("picked")).toHaveTextContent("z");
  });

  it("handles a multiple select", async () => {
    const user = userEvent.setup();
    function Multi() {
      const [values, setValues] = useState<string[]>([]);
      return (
        <div>
          <select
            aria-label="tags"
            multiple
            value={values}
            onChange={(event) => setValues([...event.target.selectedOptions].map((option) => option.value))}
          >
            <option value="a">A</option>
            <option value="b">B</option>
            <option value="c">C</option>
          </select>
          <span data-testid="values">{values.join(",")}</span>
        </div>
      );
    }
    render(<Multi />);
    await user.selectOptions(screen.getByLabelText("tags"), ["a", "c"]);
    expect(screen.getByTestId("values")).toHaveTextContent("a,c");
  });

  it("reads number inputs through valueAsNumber", async () => {
    const user = userEvent.setup();
    function Quantity() {
      const [quantity, setQuantity] = useState(1);
      const [lastParsed, setLastParsed] = useState(1);
      return (
        <div>
          <label htmlFor="qty">quantity</label>
          <input
            id="qty"
            type="number"
            value={quantity}
            onChange={(event) => {
              setQuantity(Number(event.target.value));
              setLastParsed(event.target.valueAsNumber);
            }}
          />
          <output>{Number.isNaN(lastParsed) ? "nan" : lastParsed * 2}</output>
        </div>
      );
    }
    render(<Quantity />);
    await user.clear(screen.getByLabelText("quantity"));
    await user.type(screen.getByLabelText("quantity"), "21");
    await waitFor(() => expect(document.querySelector("output")).toHaveTextContent("42"));
  });

  it("resets uncontrolled form fields", () => {
    render(
      <form data-testid="form">
        <label htmlFor="name">name</label>
        <input id="name" defaultValue="initial" />
        <label>
          agree
          <input type="checkbox" defaultChecked={false} />
        </label>
      </form>,
    );
    const form = screen.getByTestId("form") as HTMLFormElement;
    const input = screen.getByLabelText("name") as HTMLInputElement;
    const checkbox = screen.getByLabelText("agree") as HTMLInputElement;
    input.value = "typed";
    checkbox.checked = true;
    form.reset();
    expect(input.value).toBe("initial");
    expect(checkbox.checked).toBe(false);
  });

  it("disables controls inside a disabled fieldset", () => {
    render(
      <fieldset disabled>
        <legend>locked</legend>
        <input aria-label="inside" />
        <button type="button">press</button>
      </fieldset>,
    );
    expect(screen.getByLabelText("inside")).toBeDisabled();
    expect(screen.getByRole("button", { name: "press" })).toBeDisabled();
  });

  it("focuses the input when its label is clicked", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <label htmlFor="focus-me">focus me</label>
        <input id="focus-me" />
      </div>,
    );
    await user.click(screen.getByText("focus me"));
    expect(screen.getByLabelText("focus me")).toHaveFocus();
  });

  it("tabs through form controls in DOM order", async () => {
    const user = userEvent.setup();
    render(
      <form>
        <input aria-label="first" />
        <input aria-label="second" />
        <button type="button">third</button>
      </form>,
    );
    await user.tab();
    expect(screen.getByLabelText("first")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("second")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button")).toHaveFocus();
  });

  it("submits the form's values with FormData", () => {
    let submitted: Record<string, FormDataEntryValue | null> = {};
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          submitted = { name: data.get("name"), role: data.get("role") };
        }}
      >
        <input name="name" defaultValue="Ada" aria-label="name" />
        <select name="role" defaultValue="admin" aria-label="role">
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit">send</button>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "send" }));
    expect(submitted).toEqual({ name: "Ada", role: "admin" });
  });
});
