import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((n) => n + 1)}>
      count: {count}
    </button>
  );
}

describe("smoke", () => {
  it("renders a React component and exposes the DOM globals", () => {
    expect(process.env.TEST_ENV).toBeTruthy();
    expect(typeof document).toBe("object");
    expect(typeof window).toBe("object");

    render(<Counter />);
    expect(screen.getByRole("button")).toHaveTextContent("count: 0");
  });
});
