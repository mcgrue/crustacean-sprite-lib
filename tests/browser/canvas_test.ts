import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";

Deno.test("Chromium built JS: crop, transparency, scale, flips, origin, rotation, alpha and state", async () => {
  const root = new URL("../../", import.meta.url);
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    async (request) => {
      const path = decodeURIComponent(new URL(request.url).pathname).slice(1);
      if (path.includes("..")) return new Response(null, { status: 403 });
      if (!path) {
        return new Response('<canvas id="c" width="16" height="16"></canvas>', {
          headers: { "content-type": "text/html" },
        });
      }
      try {
        const bytes = await Deno.readFile(new URL(path, root));
        return new Response(bytes, {
          headers: {
            "content-type": path.endsWith(".js")
              ? "text/javascript"
              : path.endsWith(".png")
              ? "image/png"
              : path.endsWith(".html")
              ? "text/html"
              : "application/json",
          },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    },
  );
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ channel: "chromium" });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.addr.port}/`);
    const result = await page.evaluate(async () => {
      const core = await import("/dist/mod.js");
      const adapter = await import("/dist/canvas2d.js");
      const atlas = document.createElement("canvas");
      atlas.width = 7;
      atlas.height = 4;
      const a = atlas.getContext("2d")!;
      a.fillStyle = "#ff00ff";
      a.fillRect(0, 0, 7, 4);
      a.clearRect(1, 1, 2, 2);
      a.fillStyle = "#ff0000";
      a.fillRect(1, 1, 1, 1);
      a.fillStyle = "#00ff00";
      a.fillRect(2, 1, 1, 1);
      a.fillStyle = "#0000ff";
      a.fillRect(1, 2, 1, 1);
      a.fillStyle = "#ffff00";
      a.fillRect(4, 1, 2, 2);
      const d = core.validateCrusty({
        version: 1,
        image: "synthetic.png",
        dims: [2, 2],
        hitbox: [0, 0, 2, 2],
        frames: 2,
        per_row: 2,
        inner_pad: 1,
        outer_pad: 1,
        animations: { first: [0, "Static"], second: [1, "Static"] },
      });
      const asset = {
        definition: d,
        atlas: { image: atlas, width: 7, height: 4 },
        disposed: false,
      };
      const p = new core.SpritePlayer(d, { animation: "first" });
      const canvas = document.querySelector<HTMLCanvasElement>("#c")!;
      const c = canvas.getContext("2d")!;
      const pixel = (x: number, y: number) =>
        Array.from(c.getImageData(x, y, 1, 1).data);
      const reset = () => {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalAlpha = 1;
        c.clearRect(0, 0, 16, 16);
      };
      adapter.drawSprite(c, asset, p);
      const crop = [pixel(0, 0), pixel(1, 0), pixel(0, 1), pixel(1, 1)];
      reset();
      adapter.drawSprite(c, asset, p, { scaleX: 2, scaleY: 2 });
      const scale = [pixel(1, 1), pixel(3, 1), pixel(1, 3), pixel(3, 3)];
      reset();
      adapter.drawSprite(c, asset, p, { x: 2, flipX: true });
      const flipX = [pixel(0, 0), pixel(1, 0)];
      reset();
      adapter.drawSprite(c, asset, p, { y: 2, flipY: true });
      const flipY = [pixel(0, 0), pixel(0, 1)];
      reset();
      adapter.drawSprite(c, asset, p, { x: 3, y: 3, originX: 1, originY: 1 });
      const origin = pixel(2, 2);
      reset();
      adapter.drawSprite(c, asset, p, { x: 4, y: 2, rotation: Math.PI / 2 });
      const rotation = pixel(3, 2);
      reset();
      c.translate(2, 3);
      c.globalAlpha = 0.5;
      c.imageSmoothingEnabled = true;
      const old = Array.from([
        c.getTransform().a,
        c.getTransform().b,
        c.getTransform().c,
        c.getTransform().d,
        c.getTransform().e,
        c.getTransform().f,
      ]);
      adapter.drawSprite(c, asset, p, { opacity: 0.5 });
      const alpha = pixel(2, 3);
      const restored = c.globalAlpha === 0.5 && c.imageSmoothingEnabled &&
        JSON.stringify(old) ===
          JSON.stringify([
            c.getTransform().a,
            c.getTransform().b,
            c.getTransform().c,
            c.getTransform().d,
            c.getTransform().e,
            c.getTransform().f,
          ]);
      reset();
      p.select("second");
      adapter.drawSprite(c, asset, p);
      const second = pixel(0, 0);
      reset();
      c.beginPath();
      c.rect(0, 0, 1, 1);
      c.clip();
      adapter.drawSprite(c, asset, p);
      const clip = [pixel(0, 0), pixel(1, 0)];
      const stan = await adapter.loadCanvasSprite(
        new URL("/assets/lord-stan/lord_stan.json", location.href),
      );
      const stanPlayer = new core.SpritePlayer(stan.definition, {
        animation: "valid_looping_1",
      });
      const dimensions = [stan.atlas.width, stan.atlas.height];
      stan.dispose();
      // Exercise Image fallback separately from the default ImageBitmap route.
      const originalBitmap = globalThis.createImageBitmap;
      Object.defineProperty(globalThis, "createImageBitmap", {
        configurable: true,
        value: undefined,
      });
      let fallback;
      try {
        fallback = await adapter.loadCanvasSprite(
          new URL("/assets/lord-stan/lord_stan.json", location.href),
        );
      } finally {
        Object.defineProperty(globalThis, "createImageBitmap", {
          configurable: true,
          value: originalBitmap,
        });
      }
      const fallbackDims = [fallback.atlas.width, fallback.atlas.height];
      fallback.dispose();
      return {
        crop,
        scale,
        flipX,
        flipY,
        origin,
        rotation,
        alpha,
        restored,
        second,
        clip,
        dimensions,
        fallbackDims,
        initial: stanPlayer.frame,
      };
    });
    assertEquals(result.crop, [[255, 0, 0, 255], [0, 255, 0, 255], [
      0,
      0,
      255,
      255,
    ], [0, 0, 0, 0]]);
    assertEquals(result.scale, result.crop);
    assertEquals(result.flipX, [[0, 255, 0, 255], [255, 0, 0, 255]]);
    assertEquals(result.flipY, [[0, 0, 255, 255], [255, 0, 0, 255]]);
    assertEquals(result.origin, [255, 0, 0, 255]);
    assertEquals(result.rotation, [255, 0, 0, 255]);
    assertEquals(result.alpha, [255, 0, 0, 64]);
    assert(result.restored);
    assertEquals(result.second, [255, 255, 0, 255]);
    assertEquals(result.clip, [[255, 255, 0, 255], [0, 0, 0, 0]]);
    assertEquals(result.dimensions, [336, 192]);
    assertEquals(result.fallbackDims, result.dimensions);
    assertEquals(result.initial, 2);
    await page.goto(
      `http://127.0.0.1:${server.addr.port}/examples/canvas2d/index.html`,
    );
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
    await page.screenshot({
      path: new URL(".build/lord-stan-example.png", root).pathname.replace(
        /^\/(\w:)/,
        "$1",
      ),
    });
    const fractionalPage = await browser.newPage();
    await fractionalPage.goto(`http://127.0.0.1:${server.addr.port}/`);
    const deltas = await fractionalPage.evaluate(async () => {
      document.body.innerHTML =
        '<select id="animation"></select><button id="pause"></button><button id="restart"></button><canvas id="sprite" width="480" height="320"></canvas><output id="status"></output>';
      const { SpritePlayer } = await import("/dist/mod.js");
      const advance = SpritePlayer.prototype.advance;
      const values: number[] = [];
      SpritePlayer.prototype.advance = function (delta: number) {
        values.push(delta);
        return advance.call(this, delta);
      };
      const original = globalThis.requestAnimationFrame;
      let callback: FrameRequestCallback | undefined;
      globalThis.requestAnimationFrame = (fn) => {
        callback = fn;
        return 1;
      };
      try {
        await import("/examples/canvas2d/main.js");
        for (const time of [0, 0.4, 0.8, 1.2, 2.1]) callback!(time);
        return values;
      } finally {
        globalThis.requestAnimationFrame = original;
        SpritePlayer.prototype.advance = advance;
      }
    });
    assertEquals(deltas, [0, 0, 1, 1]);
  } finally {
    await browser?.close();
    await server.shutdown();
  }
});
