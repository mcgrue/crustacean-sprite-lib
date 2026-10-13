import { assert, assertEquals } from "@std/assert";
import { withWebGLPage } from "./webgl_helpers.ts";

Deno.test("WebGL pixels: atlas crop, transforms, alpha, logical viewport and ordered batches", () =>
  withWebGLPage(async (page) => {
    const result = await page.evaluate(async () => {
      const { SpritePlayer } = await import("/dist/mod.js");
      const { WebGLSpriteRenderer } = await import("/dist/webgl.js");
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const gl = canvas.getContext("webgl2", {
        antialias: false,
        preserveDrawingBuffer: true,
      })!;
      if (!gl) throw new Error("WebGL 2 unavailable");
      const renderer = new WebGLSpriteRenderer(gl);
      const atlas = document.createElement("canvas");
      atlas.width = 7;
      atlas.height = 4;
      const context = atlas.getContext("2d")!;
      context.fillStyle = "#ff00ff";
      context.fillRect(0, 0, 7, 4);
      context.clearRect(1, 1, 2, 2);
      context.fillStyle = "#ff0000";
      context.fillRect(1, 1, 1, 1);
      context.fillStyle = "#00ff00";
      context.fillRect(2, 1, 1, 1);
      context.fillStyle = "#0000ff";
      context.fillRect(1, 2, 1, 1);
      context.fillStyle = "#ffff00";
      context.fillRect(4, 1, 2, 2);
      const data = {
        version: 1,
        image: "test.png",
        dims: [2, 2],
        hitbox: [0, 0, 2, 2],
        frames: 2,
        per_row: 2,
        inner_pad: 1,
        outer_pad: 1,
        animations: { a: [[[0, 1], [1, 1]], "Looping"] },
      };
      const load = () =>
        renderer.loadSprite("https://test.invalid/sprite.json", {
          fetch: () => Promise.resolve(new Response(JSON.stringify(data))),
          decodeImage: () =>
            Promise.resolve({ image: atlas, width: 7, height: 4 }),
        });
      const asset = await load();
      const otherAsset = await load();
      const player = new SpritePlayer(asset.definition);
      const otherPlayer = new SpritePlayer(otherAsset.definition);
      const pixel = (x: number, y: number) => {
        const output = new Uint8Array(4);
        gl.readPixels(x, 15 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, output);
        return Array.from(output);
      };
      const begin = () =>
        renderer.beginFrame({
          width: 16,
          height: 16,
          clearColor: [0, 0, 0, 0],
        });
      begin();
      renderer.draw(asset, player);
      renderer.endFrame();
      const crop = [pixel(0, 0), pixel(1, 0), pixel(0, 1), pixel(1, 1)];
      begin();
      renderer.draw(asset, player, { scaleX: 2, scaleY: 2 });
      renderer.endFrame();
      const scale = [pixel(1, 1), pixel(3, 1), pixel(1, 3), pixel(3, 3)];
      begin();
      renderer.draw(asset, player, { x: 2, flipX: true });
      renderer.endFrame();
      const flipX = [pixel(0, 0), pixel(1, 0)];
      begin();
      renderer.draw(asset, player, { y: 2, flipY: true });
      renderer.endFrame();
      const flipY = [pixel(0, 0), pixel(0, 1)];
      begin();
      renderer.draw(asset, player, { x: 3, y: 3, originX: 1, originY: 1 });
      renderer.endFrame();
      const origin = pixel(2, 2);
      begin();
      renderer.draw(asset, player, { x: 4, y: 2, rotation: Math.PI / 2 });
      renderer.endFrame();
      const rotation = pixel(3, 2);
      begin();
      renderer.draw(asset, player, { opacity: 0.25 });
      renderer.endFrame();
      const alpha = pixel(0, 0);
      renderer.beginFrame({ width: 8, height: 8, clearColor: [0, 0, 0, 0] });
      renderer.draw(asset, player);
      renderer.endFrame();
      const logical = pixel(1, 1);
      // Snapshot at submission; two adjacent assets batch; switching and returning keeps order.
      let draws = 0;
      const counts: number[] = [];
      const drawArrays = gl.drawArrays.bind(gl);
      gl.drawArrays = (mode, first, count) => {
        draws++;
        counts.push(count);
        drawArrays(mode, first, count);
      };
      begin();
      renderer.draw(asset, player);
      renderer.draw(asset, player, { x: 5 });
      otherPlayer.advance(1);
      renderer.draw(otherAsset, otherPlayer, { opacity: 0.5 });
      renderer.draw(asset, player, { opacity: 0.5 });
      player.advance(1);
      renderer.endFrame();
      const overlap = pixel(0, 0);
      gl.drawArrays = drawArrays;
      // Fractional scale/rotation geometric assertion: visible output stays inside the canvas.
      begin();
      player.restart();
      renderer.draw(asset, player, {
        x: 8,
        y: 8,
        scaleX: 1.5,
        scaleY: 1.5,
        originX: 1,
        originY: 1,
        rotation: Math.PI / 4,
      });
      renderer.endFrame();
      const rgba = new Uint8Array(16 * 16 * 4);
      gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      const visible: number[][] = [];
      for (let i = 0; i < 256; i++) {
        if (rgba[i * 4 + 3]) visible.push([i % 16, 15 - Math.floor(i / 16)]);
      }
      const fractional = visible.length > 0 &&
        visible.every(([x, y]) => x! >= 5 && x! <= 10 && y! >= 5 && y! <= 10);
      asset.dispose();
      otherAsset.dispose();
      renderer.dispose();
      return {
        crop,
        scale,
        flipX,
        flipY,
        origin,
        rotation,
        alpha,
        logical,
        overlap,
        draws,
        counts,
        fractional,
        error: gl.getError(),
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
    assertEquals(result.alpha, [64, 0, 0, 64]);
    assertEquals(result.logical, [255, 0, 0, 255]);
    assertEquals(result.overlap, [255, 64, 0, 255]);
    assertEquals(result.draws, 3);
    assertEquals(result.counts, [12, 6, 6]);
    assert(result.fractional);
    assertEquals(result.error, 0);
  }));

Deno.test("WebGL upload and frames restore shared GL state; ImageBitmap/fallback alpha match", () =>
  withWebGLPage(async (page) => {
    const result = await page.evaluate(async () => {
      const { SpritePlayer } = await import("/dist/mod.js");
      const { WebGLSpriteRenderer } = await import("/dist/webgl.js");
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const gl = canvas.getContext("webgl2", {
        antialias: false,
        preserveDrawingBuffer: true,
      })!;
      const texture = gl.createTexture();
      const sampler = gl.createSampler();
      const buffer = gl.createBuffer();
      const unpack = gl.createBuffer();
      const vao = gl.createVertexArray();
      const framebuffer = gl.createFramebuffer();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.bindSampler(0, sampler);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpack);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 12);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 2);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 3);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
      gl.viewport(2, 3, 4, 5);
      gl.enable(gl.SCISSOR_TEST);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.STENCIL_TEST);
      gl.enable(gl.CULL_FACE);
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.disable(gl.BLEND);
      gl.colorMask(false, true, false, true);
      gl.clearColor(0.1, 0.2, 0.3, 0.4);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
      gl.blendEquationSeparate(gl.FUNC_SUBTRACT, gl.FUNC_REVERSE_SUBTRACT);
      const keys = [
        gl.ACTIVE_TEXTURE,
        gl.ARRAY_BUFFER_BINDING,
        gl.PIXEL_UNPACK_BUFFER_BINDING,
        gl.VERTEX_ARRAY_BINDING,
        gl.DRAW_FRAMEBUFFER_BINDING,
        gl.READ_FRAMEBUFFER_BINDING,
        gl.CURRENT_PROGRAM,
        gl.VIEWPORT,
        gl.COLOR_WRITEMASK,
        gl.COLOR_CLEAR_VALUE,
        gl.BLEND_SRC_RGB,
        gl.BLEND_DST_RGB,
        gl.BLEND_SRC_ALPHA,
        gl.BLEND_DST_ALPHA,
        gl.BLEND_EQUATION_RGB,
        gl.BLEND_EQUATION_ALPHA,
        gl.UNPACK_ALIGNMENT,
        gl.UNPACK_FLIP_Y_WEBGL,
        gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
        gl.UNPACK_ROW_LENGTH,
        gl.UNPACK_SKIP_PIXELS,
        gl.UNPACK_SKIP_ROWS,
      ];
      const before = keys.map((key) => gl.getParameter(key));
      const unchanged = () =>
        keys.every((key, i) => {
          const value = gl.getParameter(key);
          const expected = before[i];
          return ArrayBuffer.isView(value) || Array.isArray(value)
            ? String(value) === String(expected)
            : value === expected;
        }) && gl.isEnabled(gl.SCISSOR_TEST) && gl.isEnabled(gl.DEPTH_TEST) &&
        gl.isEnabled(gl.STENCIL_TEST) && gl.isEnabled(gl.CULL_FACE) &&
        gl.isEnabled(gl.RASTERIZER_DISCARD) && !gl.isEnabled(gl.BLEND);
      const renderer = new WebGLSpriteRenderer(gl);
      const setup = unchanged();
      // Alpha-bearing PNG tests both the bitmap-specific decode flags and HTMLImage fallback.
      const atlas = document.createElement("canvas");
      atlas.width = 2;
      atlas.height = 2;
      const context = atlas.getContext("2d")!;
      context.fillStyle = "rgba(255,0,0,0.5)";
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = "#00ff00";
      context.fillRect(0, 1, 1, 1);
      const blob = await new Promise<Blob>((resolve) =>
        atlas.toBlob((blob) => resolve(blob!), "image/png")
      );
      const data = {
        version: 1,
        image: "atlas.png",
        dims: [2, 2],
        hitbox: [0, 0, 2, 2],
        frames: 1,
        per_row: 1,
        inner_pad: 0,
        outer_pad: 0,
        animations: { a: [0, "Static"] },
      };
      const fetcher = (input: string | URL | Request) =>
        Promise.resolve(
          new Response(
            String(input).endsWith("json") ? JSON.stringify(data) : blob,
          ),
        );
      const first = await renderer.loadSprite("https://test.invalid/a.json", {
        fetch: fetcher,
      });
      const upload = unchanged();
      const original = globalThis.createImageBitmap;
      Object.defineProperty(globalThis, "createImageBitmap", {
        configurable: true,
        value: undefined,
      });
      let fallback;
      try {
        fallback = await renderer.loadSprite("https://test.invalid/a.json", {
          fetch: fetcher,
        });
      } finally {
        Object.defineProperty(globalThis, "createImageBitmap", {
          configurable: true,
          value: original,
        });
      }
      const colors: number[][] = [];
      for (const asset of [first, fallback]) {
        renderer.beginFrame({ width: 8, height: 8, clearColor: [0, 0, 0, 0] });
        renderer.draw(asset, new SpritePlayer(asset.definition));
        renderer.endFrame();
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 7, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        colors.push(Array.from(pixel));
        gl.readPixels(0, 6, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        colors.push(Array.from(pixel));
      }
      const frame = unchanged();
      gl.activeTexture(gl.TEXTURE0);
      const bindings = gl.getParameter(gl.TEXTURE_BINDING_2D) === texture &&
        gl.getParameter(gl.SAMPLER_BINDING) === sampler;
      gl.activeTexture(gl.TEXTURE3);
      renderer.dispose();
      const disposed = unchanged();
      const error = gl.getError();
      gl.deleteTexture(texture);
      gl.deleteSampler(sampler);
      gl.deleteBuffer(buffer);
      gl.deleteBuffer(unpack);
      gl.deleteVertexArray(vao);
      gl.deleteFramebuffer(framebuffer);
      return { setup, upload, frame, bindings, disposed, colors, error };
    });
    assert(result.setup);
    assert(result.upload);
    assert(result.frame);
    assert(result.bindings);
    assert(result.disposed);
    assertEquals(result.colors, [[128, 0, 0, 128], [0, 255, 0, 255], [
      128,
      0,
      0,
      128,
    ], [0, 255, 0, 255]]);
    assertEquals(result.error, 0);
  }));
