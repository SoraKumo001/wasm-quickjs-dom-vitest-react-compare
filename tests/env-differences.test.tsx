/**
 * The two environments are not identical: this file records the differences that matter to React
 * tests and asserts them *per environment*, so `npm test` stays green while the difference is
 * documented and regression-checked. `scripts/compare.mjs` prints the same difference table from
 * `results/capabilities-<env>.json`.
 */
import { describe, expect, it } from "vitest";

const env = process.env.TEST_ENV;
const isJsdom = env === "jsdom";
const isWasm = env === "wasm-quickjs-dom";

describe("environment differences", () => {
  it("knows which environment it is", () => {
    expect([isJsdom, isWasm].filter(Boolean)).toHaveLength(1);
  });

  it("exposes matchMedia only in wasm-quickjs-dom", () => {
    if (isJsdom) {
      expect(typeof window.matchMedia).toBe("undefined");
    } else {
      expect(typeof window.matchMedia).toBe("function");
      expect(window.matchMedia("(min-width: 1px)").matches).toBe(true);
    }
  });

  it("exposes IntersectionObserver / ResizeObserver only in wasm-quickjs-dom", () => {
    const globalWithObservers = globalThis as unknown as Record<string, unknown>;
    if (isJsdom) {
      expect(globalWithObservers.IntersectionObserver).toBeUndefined();
      expect(globalWithObservers.ResizeObserver).toBeUndefined();
    } else {
      expect(typeof globalWithObservers.IntersectionObserver).toBe("function");
      expect(typeof globalWithObservers.ResizeObserver).toBe("function");
    }
  });

  it("supports scrollIntoView only in wasm-quickjs-dom", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    if (isJsdom) {
      expect(typeof (element as unknown as Record<string, unknown>).scrollIntoView).toBe("undefined");
    } else {
      expect(() => element.scrollIntoView()).not.toThrow();
    }
    element.remove();
  });

  it("reports a different user agent per environment", () => {
    expect(navigator.userAgent).toContain(isJsdom ? "jsdom" : "wasm-html-to-image");
  });

  it("reports a different default viewport per environment", () => {
    if (isJsdom) {
      expect([window.innerWidth, window.innerHeight]).toEqual([1024, 768]);
    } else {
      expect([window.innerWidth, window.innerHeight]).toEqual([800, 600]);
    }
  });

  it("offers extra browser APIs in wasm-quickjs-dom", () => {
    const globalWithExtras = globalThis as unknown as Record<string, unknown>;
    expect(typeof Element.prototype.animate).toBe(isJsdom ? "undefined" : "function");
    expect(typeof globalWithExtras.requestIdleCallback).toBe(isJsdom ? "undefined" : "function");
    expect(typeof navigator.clipboard).toBe(isJsdom ? "undefined" : "object");
  });

  it("has no layout in either environment", () => {
    const element = document.createElement("div");
    element.style.cssText = "width: 100px; height: 50px;";
    document.body.appendChild(element);
    expect(element.getBoundingClientRect().width).toBe(0);
    expect(element.getBoundingClientRect().height).toBe(0);
    expect(element.offsetWidth).toBe(0);
    element.remove();
  });

  it("serializes and parses markup identically", () => {
    const original = document.body.innerHTML;
    document.body.innerHTML = `<div id="a" class="b" hidden><p>Hi &amp; bye &lt;3</p><input type="checkbox" checked><br><table><tr><td>1</td></tr></table></div>`;
    expect(document.body.innerHTML).toBe(
      '<div id="a" class="b" hidden=""><p>Hi &amp; bye &lt;3</p><input type="checkbox" checked=""><br><table><tbody><tr><td>1</td></tr></tbody></table></div>',
    );
    expect(document.querySelectorAll("table > tbody > tr > td")).toHaveLength(1);
    document.body.innerHTML = original;
  });

  it("supports the same DOM core operations", () => {
    const host = document.createElement("div");
    host.innerHTML = "<span>a</span><span>b</span>";
    document.body.appendChild(host);
    const [first, second] = [...host.querySelectorAll("span")];
    expect(first.compareDocumentPosition(second)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(host.cloneNode(true).childNodes).toHaveLength(2);
    expect(host.contains(second)).toBe(true);
    const template = document.createElement("template");
    template.innerHTML = "<p>templated</p>";
    expect(template.content.childNodes).toHaveLength(1);
    host.remove();
  });
});
