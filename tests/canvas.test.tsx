import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useEffect, useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { installCanvasBridge, type CanvasBridge } from "wasm-html-to-image";

const isWasm = process.env.TEST_ENV === "wasm-quickjs-dom";

function pixelAt(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

describe("canvas", () => {
  it("renders <canvas> with width/height attributes and defaults identically", () => {
    render(
      <div>
        <canvas data-testid="default" />
        <canvas data-testid="sized" width={120} height={80} />
      </div>,
    );

    const def = screen.getByTestId("default") as HTMLCanvasElement;
    expect(def.tagName).toBe("CANVAS");
    expect(def.width).toBe(300);
    expect(def.height).toBe(150);

    const sized = screen.getByTestId("sized") as HTMLCanvasElement;
    expect(sized.width).toBe(120);
    expect(sized.height).toBe(80);
  });

  if (!isWasm) {
    it("exposes HTMLCanvasElement width/height setters in jsdom", () => {
      render(<canvas data-testid="c" width={40} height={40} />);
      const canvas = screen.getByTestId("c") as HTMLCanvasElement;
      canvas.width = 64;
      canvas.height = 32;
      expect(canvas.width).toBe(64);
      expect(canvas.height).toBe(32);
    });
    return;
  }

  describe("2D Canvas rendering via wasm-html-to-image bridge", () => {
    let bridge: CanvasBridge | undefined;

    beforeAll(async () => {
      bridge = await installCanvasBridge(window);
    });

    afterAll(() => {
      bridge?.dispose();
    });

    it("draws shapes and Path2D inside a React useEffect and verifies pixels via getImageData", () => {
      function Chart() {
        const ref = useRef<HTMLCanvasElement>(null);
        useEffect(() => {
          const ctx = ref.current?.getContext("2d");
          if (!ctx) return;
          ctx.fillStyle = "#ff0000";
          ctx.fillRect(0, 0, 60, 40);
          ctx.clearRect(20, 10, 20, 20);

          const square = new Path2D("M 45 5 H 55 V 15 H 45 Z");
          ctx.fillStyle = "#0000ff";
          ctx.fill(square);
        }, []);
        return <canvas ref={ref} data-testid="chart" width={60} height={40} />;
      }

      render(<Chart />);
      const canvas = screen.getByTestId("chart") as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      expect(ctx).not.toBeNull();
      expect(ctx.canvas).toBe(canvas);

      const img = ctx.getImageData(0, 0, 60, 40);
      expect(img).toBeInstanceOf(ImageData);
      expect(img.data).toBeInstanceOf(Uint8ClampedArray);
      expect(pixelAt(img.data, 60, 5, 5)).toEqual([255, 0, 0, 255]);
      expect(pixelAt(img.data, 60, 30, 20)).toEqual([0, 0, 0, 0]);
      expect(pixelAt(img.data, 60, 50, 10)).toEqual([0, 0, 255, 255]);
    });

    it("redraws canvas on React state updates and supports resize", () => {
      function InteractiveCanvas() {
        const [color, setColor] = useState("#00ff00");
        const [size, setSize] = useState(30);
        const ref = useRef<HTMLCanvasElement>(null);

        useEffect(() => {
          const ctx = ref.current?.getContext("2d");
          if (!ctx) return;
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, size, size);
        }, [color, size]);

        return (
          <div>
            <canvas ref={ref} data-testid="interactive" width={size} height={size} />
            <button type="button" onClick={() => setColor("#112233")}>
              recolor
            </button>
            <button type="button" onClick={() => setSize(50)}>
              resize
            </button>
          </div>
        );
      }

      render(<InteractiveCanvas />);
      const canvas = screen.getByTestId("interactive") as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;

      expect(Array.from(ctx.getImageData(10, 10, 1, 1).data)).toEqual([0, 255, 0, 255]);

      fireEvent.click(screen.getByRole("button", { name: "recolor" }));
      expect(Array.from(ctx.getImageData(10, 10, 1, 1).data)).toEqual([0x11, 0x22, 0x33, 255]);

      fireEvent.click(screen.getByRole("button", { name: "resize" }));
      expect(canvas.width).toBe(50);
      expect(canvas.height).toBe(50);
      expect(Array.from(ctx.getImageData(40, 40, 1, 1).data)).toEqual([0x11, 0x22, 0x33, 255]);
    });

    it("supports putImageData, gradients, drawImage between canvases, toDataURL, and toBlob", async () => {
      render(
        <div>
          <canvas data-testid="src" width={20} height={20} />
          <canvas data-testid="dst" width={20} height={20} />
        </div>,
      );

      const src = screen.getByTestId("src") as HTMLCanvasElement;
      const dst = screen.getByTestId("dst") as HTMLCanvasElement;
      const sctx = src.getContext("2d")!;
      const dctx = dst.getContext("2d")!;

      // Gradient fill
      const grad = sctx.createLinearGradient(0, 0, 20, 0);
      grad.addColorStop(0, "#ff0000");
      grad.addColorStop(1, "#0000ff");
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 20, 20);

      // putImageData patch at (5, 5)
      const patch = sctx.createImageData(2, 2);
      for (let i = 0; i < patch.data.length; i += 4) {
        patch.data[i] = 0;
        patch.data[i + 1] = 255;
        patch.data[i + 2] = 0;
        patch.data[i + 3] = 255;
      }
      sctx.putImageData(patch, 5, 5);

      // Copy src canvas into dst canvas
      dctx.drawImage(src, 0, 0);
      expect(Array.from(dctx.getImageData(5, 5, 1, 1).data)).toEqual([0, 255, 0, 255]);

      // toDataURL & toBlob
      const pngUrl = dst.toDataURL("image/png");
      expect(pngUrl.startsWith("data:image/png;base64,")).toBe(true);

      const blob = await new Promise<Blob | null>((resolve) => {
        dst.toBlob(resolve, "image/png");
      });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob!.type).toBe("image/png");
      expect(blob!.size).toBeGreaterThan(20);
    });

    it("supports OffscreenCanvas drawing and convertToBlob", async () => {
      const oc = new OffscreenCanvas(16, 16);
      const ctx = oc.getContext("2d")!;
      ctx.fillStyle = "#abcdef";
      ctx.fillRect(0, 0, 16, 16);

      expect(Array.from(ctx.getImageData(8, 8, 1, 1).data)).toEqual([0xab, 0xcd, 0xef, 255]);

      const blob = await oc.convertToBlob({ type: "image/png" });
      expect(blob.type).toBe("image/png");
      expect(blob.size).toBeGreaterThan(20);
    });
  });
});
