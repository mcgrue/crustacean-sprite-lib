import { assertEquals } from "@std/assert";
import { withWebGLPage } from "./webgl_helpers.ts";

Deno.test("WebGL example loads all animations, controls playback and restores its context", () =>
  withWebGLPage(async (page) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/examples/webgl/index.html", page.url()).href);
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes(
        "valid_looping_1",
      )
    );
    assertEquals(await page.locator("#animation option").count(), 22);
    await page.locator("#pause").click();
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes("paused")
    );
    await page.locator("#animation").selectOption("valid_static_2");
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes("frame 7")
    );
    await page.locator("#restart").click();
    await page.locator("#pause").click();
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes("playing")
    );
    const extension = await page.evaluateHandle(() =>
      document.querySelector<HTMLCanvasElement>("#sprite")!.getContext(
        "webgl2",
      )!.getExtension("WEBGL_lose_context")!
    );
    await page.evaluate(async (extension) => {
      const canvas = document.querySelector<HTMLCanvasElement>("#sprite")!;
      const lost = new Promise<void>((resolve) =>
        canvas.addEventListener("webglcontextlost", () => resolve(), {
          once: true,
        })
      );
      extension.loseContext();
      await lost;
    }, extension);
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes(
        "Graphics context lost",
      )
    );
    await page.evaluate(async (extension) => {
      const canvas = document.querySelector<HTMLCanvasElement>("#sprite")!;
      const restored = new Promise<void>((resolve) =>
        canvas.addEventListener("webglcontextrestored", () => resolve(), {
          once: true,
        })
      );
      extension.restoreContext();
      await restored;
    }, extension);
    await extension.dispose();
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes("frame 7")
    );
    await page.screenshot({ path: ".build/webgl-example.png" });
    assertEquals(errors, []);
  }));
