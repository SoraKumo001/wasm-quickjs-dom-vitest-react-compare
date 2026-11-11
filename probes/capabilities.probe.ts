/**
 * Capability probe: runs under both DOM environments and records what the *test-visible* globals
 * can actually do. Output: `results/capabilities-<env>.json`.
 *
 * The point is to be able to diff the two environments (API surface, layout, observers, CSS,
 * serialization, user-agent, ...) instead of guessing from the docs.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const envName = process.env.TEST_ENV ?? "unknown";
const results: Record<string, unknown> = {};

function probe(name: string, fn: () => unknown): void {
  try {
    results[name] = fn();
  } catch (error) {
    results[name] = { error: String((error as Error)?.message ?? error) };
  }
}

function normalize(value: unknown): unknown {
  if (typeof value === "function") return `function ${value.name || "(anonymous)"}`;
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "object" && value !== null) return JSON.parse(JSON.stringify(value));
  return value;
}

const styleTag = `<style>
  .box { display: flex; color: rgb(0, 128, 0); margin-top: 8px; --gap: 12px; padding: var(--gap); }
  .box .inner { color: inherit; }
  @media (min-width: 1px) { .box { border-top-width: 3px; } }
</style>`;

describe("capabilities", () => {
  it("collects the environment capability matrix", () => {
    // --- window / navigator / viewport -------------------------------------
    probe("navigator.userAgent", () => navigator.userAgent);
    probe("navigator.platform", () => (navigator as unknown as Record<string, unknown>).platform);
    probe("window.innerWidth", () => window.innerWidth);
    probe("window.innerHeight", () => window.innerHeight);
    probe("window.devicePixelRatio", () => (window as unknown as Record<string, unknown>).devicePixelRatio);
    probe("location.href", () => location.href);
    probe("document.compatMode", () => document.compatMode);
    probe("document.characterSet", () => document.characterSet);

    // --- timers / scheduler primitives React uses --------------------------
    probe("typeof requestAnimationFrame", () => typeof requestAnimationFrame);
    probe("typeof requestIdleCallback", () => typeof (window as unknown as Record<string, unknown>).requestIdleCallback);
    probe("typeof MessageChannel", () => typeof MessageChannel);
    probe("typeof queueMicrotask", () => typeof queueMicrotask);
    probe("typeof structuredClone", () => typeof structuredClone);
    probe("typeof setImmediate", () => typeof (globalThis as unknown as Record<string, unknown>).setImmediate);

    // --- observers / browser APIs ------------------------------------------
    probe("typeof MutationObserver", () => typeof MutationObserver);
    probe("typeof IntersectionObserver", () => typeof (globalThis as unknown as Record<string, unknown>).IntersectionObserver);
    probe("typeof ResizeObserver", () => typeof (globalThis as unknown as Record<string, unknown>).ResizeObserver);
    probe("typeof matchMedia", () => typeof window.matchMedia);
    probe("matchMedia('(min-width: 1px)').matches", () => window.matchMedia?.("(min-width: 1px)").matches);
    probe("typeof window.getSelection", () => typeof window.getSelection);
    probe("typeof document.createRange", () => typeof document.createRange);
    probe("typeof customElements", () => typeof (window as unknown as Record<string, unknown>).customElements);
    probe("typeof attachShadow", () => typeof Element.prototype.attachShadow);
    probe("typeof Element.animate", () => typeof (Element.prototype as unknown as Record<string, unknown>).animate);
    probe("typeof navigator.clipboard", () => typeof (navigator as unknown as Record<string, unknown>).clipboard);
    probe("typeof URL.createObjectURL", () => typeof URL.createObjectURL);
    probe("typeof fetch", () => typeof fetch);
    probe("typeof localStorage", () => typeof localStorage);
    probe("localStorage roundtrip", () => {
      localStorage.setItem("probe", "1");
      return localStorage.getItem("probe");
    });

    // --- layout / scrolling (the classic jsdom pain points) -----------------
    const layoutTarget = document.createElement("div");
    layoutTarget.style.cssText = "width: 100px; height: 50px; padding: 5px;";
    layoutTarget.textContent = "layout";
    document.body.appendChild(layoutTarget);
    probe("getBoundingClientRect().width", () => layoutTarget.getBoundingClientRect().width);
    probe("getBoundingClientRect().height", () => layoutTarget.getBoundingClientRect().height);
    probe("offsetWidth", () => layoutTarget.offsetWidth);
    probe("offsetHeight", () => layoutTarget.offsetHeight);
    probe("clientWidth", () => layoutTarget.clientWidth);
    probe("getClientRects().length", () => layoutTarget.getClientRects().length);
    probe("typeof scrollIntoView + call", () => {
      layoutTarget.scrollIntoView();
      return typeof layoutTarget.scrollIntoView;
    });
    probe("typeof window.scrollTo + call", () => {
      window.scrollTo(0, 0);
      return typeof window.scrollTo;
    });
    probe("document.elementFromPoint(0,0)", () => document.elementFromPoint?.(0, 0)?.nodeName ?? null);

    // --- CSS / computed style ----------------------------------------------
    document.head.insertAdjacentHTML("beforeend", styleTag);
    const box = document.createElement("div");
    box.className = "box";
    box.innerHTML = `<span class="inner">inner</span>`;
    document.body.appendChild(box);
    probe("computed display (from <style>)", () => getComputedStyle(box).display);
    probe("computed color (from <style>)", () => getComputedStyle(box).color);
    probe("computed margin-top (from <style>)", () => getComputedStyle(box).marginTop);
    probe("computed padding (var())", () => getComputedStyle(box).padding);
    probe("computed border-top-width (@media)", () => getComputedStyle(box).borderTopWidth);
    probe("computed child color (inherit)", () => getComputedStyle(box.querySelector(".inner")!).color);
    probe("document.styleSheets.length", () => document.styleSheets.length);
    probe("typeof CSS.escape", () => typeof (globalThis as unknown as Record<string, unknown>).CSS);
    probe("CSS.escape escape", () => {
      const CSSNamespace = (globalThis as unknown as Record<string, unknown>).CSS as { escape?: (v: string) => string } | undefined;
      return CSSNamespace?.escape?.("a b") ?? "no CSS.escape";
    });

    // --- serialization / parser edge cases (snapshot-test relevant) ---------
    const original = document.body.innerHTML;
    document.body.innerHTML = `<div id=a class=b data-x=1 hidden><p>Hi &amp; bye &lt;3</p><input type=checkbox checked><br><img src="x.png" alt=""><svg viewBox="0 0 10 10"><circle r="1"/></svg><!--c--><table><tr><td>1</table><textarea>x &amp; y</textarea></div>`;
    probe("serialized innerHTML", () => document.body.innerHTML);
    probe("table auto-tbody", () => document.querySelectorAll("table > tbody > tr > td").length);
    probe("textarea value", () => document.querySelector("textarea")?.value);
    probe("checkbox.checked", () => document.querySelectorAll("input")[0]?.checked);
    probe("svg namespace", () => document.querySelector("svg")?.namespaceURI);
    document.body.innerHTML = original;

    // --- form-control APIs user-event relies on ----------------------------
    const input = document.createElement("input");
    input.value = "abcdef";
    document.body.appendChild(input);
    probe("input.setSelectionRange", () => {
      input.setSelectionRange(1, 3);
      return [input.selectionStart, input.selectionEnd];
    });
    probe("form.elements length", () => {
      const form = document.createElement("form");
      form.innerHTML = `<input name="a"><select name="b"><option>x</option></select>`;
      document.body.appendChild(form);
      return form.elements.length;
    });
    probe("select.selectedOptions", () => {
      const select = document.createElement("select");
      select.innerHTML = `<option value="a">A</option><option value="b" selected>B</option>`;
      document.body.appendChild(select);
      return select.selectedOptions?.[0]?.value ?? null;
    });

    // --- DOM core used by React's reconciler -------------------------------
    probe("compareDocumentPosition", () => {
      const parent = document.createElement("div");
      const first = document.createElement("span");
      const second = document.createElement("span");
      parent.append(first, second);
      return first.compareDocumentPosition(second);
    });
    probe("template.content", () => {
      const template = document.createElement("template");
      template.innerHTML = "<p>x</p>";
      return template.content.childNodes.length;
    });
    probe("cloneNode(true)", () => {
      const source = document.createElement("div");
      source.innerHTML = "<b>a</b><i>b</i>";
      return source.cloneNode(true).childNodes.length;
    });
    probe("DocumentFragment append", () => {
      const fragment = document.createDocumentFragment();
      fragment.append(document.createElement("p"), document.createElement("p"));
      document.body.append(fragment);
      return document.body.querySelectorAll("p").length;
    });
    probe("getRootNode", () => typeof layoutTarget.getRootNode);
    probe("Node.isConnected", () => layoutTarget.isConnected);

    fs.mkdirSync(path.resolve("results"), { recursive: true });
    fs.writeFileSync(
      path.resolve("results", `capabilities-${envName}.json`),
      JSON.stringify({ environment: envName, node: process.version, results }, null, 2),
    );

    expect(Object.keys(results).length).toBeGreaterThan(30);
  });
});
