import { assert, assertEquals } from "@std/assert";
import { withWebGLPage } from "./webgl_helpers.ts";

Deno.test("WebGL contracts: invalid frames/assets/transforms, immutable queued draws and cleanup", () =>
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
      const renderer = new WebGLSpriteRenderer(gl);
      const foreign = new WebGLSpriteRenderer(gl);
      const image = new ImageData(
        new Uint8ClampedArray([255, 0, 0, 255]),
        1,
        1,
      );
      const data = {
        version: 1,
        image: "atlas.png",
        dims: [1, 1],
        hitbox: [0, 0, 1, 1],
        frames: 1,
        per_row: 1,
        inner_pad: 0,
        outer_pad: 0,
        animations: { a: [0, "Static"] },
      };
      let closes = 0;
      const options = {
        fetch: () => Promise.resolve(new Response(JSON.stringify(data))),
        decodeImage: () =>
          Promise.resolve({
            image,
            width: 1,
            height: 1,
            close: () => {
              closes++;
            },
          }),
      };
      const asset = await renderer.loadSprite(
        "https://test.invalid/a.json",
        options,
      );
      const foreignAsset = await foreign.loadSprite(
        "https://test.invalid/a.json",
        options,
      );
      const player = new SpritePlayer(asset.definition);
      const foreignPlayer = new SpritePlayer(foreignAsset.definition);
      const errors: string[] = [];
      const fails = (run: () => void) => {
        try {
          run();
          errors.push("no-error");
        } catch (e) {
          errors.push((e as { code: string }).code);
        }
      };
      fails(() => renderer.draw(asset, player));
      fails(() => renderer.endFrame());
      fails(() => renderer.beginFrame({ width: 0, height: 8 }));
      fails(() =>
        renderer.beginFrame({ width: 8, height: 8, clearColor: [0, 0, 0, 2] })
      );
      renderer.beginFrame({ width: 8, height: 8, clearColor: [0, 0, 0, 0] });
      fails(() => renderer.beginFrame({ width: 8, height: 8 }));
      renderer.draw(asset, player);
      fails(() => asset.dispose());
      fails(() => renderer.draw(foreignAsset, foreignPlayer));
      fails(() => renderer.draw(asset, foreignPlayer));
      fails(() => renderer.draw(asset, player, { x: NaN }));
      fails(() => renderer.draw(asset, player, { scaleX: 0 }));
      fails(() => renderer.draw(asset, player, { opacity: 2 }));
      fails(() => renderer.draw(asset, player, { scaleX: 1e100 }));
      renderer.endFrame();
      const rgba = new Uint8Array(4);
      gl.readPixels(0, 7, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      asset.dispose();
      asset.dispose();
      const assetCloses = closes;
      renderer.beginFrame({ width: 8, height: 8 });
      fails(() => renderer.draw(asset, player));
      renderer.endFrame();
      renderer.dispose();
      renderer.dispose();
      fails(() => renderer.beginFrame({ width: 8, height: 8 }));
      fails(() => renderer.restore());
      foreign.dispose();
      const disposed = asset.disposed && foreignAsset.disposed &&
        renderer.disposed;
      // dispose() inside a frame discards the queue and restores external state.
      const third = new WebGLSpriteRenderer(gl);
      const thirdAsset = await third.loadSprite(
        "https://test.invalid/a.json",
        options,
      );
      const thirdPlayer = new SpritePlayer(thirdAsset.definition);
      gl.viewport(1, 2, 3, 4);
      third.beginFrame({ width: 8, height: 8 });
      third.draw(thirdAsset, thirdPlayer);
      third.dispose();
      return {
        errors,
        rgba: Array.from(rgba),
        assetCloses,
        closes,
        disposed,
        activeDispose: Array.from(gl.getParameter(gl.VIEWPORT)),
        contextAlive: !gl.isContextLost(),
        error: gl.getError(),
      };
    });
    assertEquals(result.errors, [
      ...Array(12).fill("validation"),
      "disposed",
      "disposed",
      "disposed",
    ]);
    assertEquals(result.rgba, [255, 0, 0, 255]);
    assertEquals(result.assetCloses, 1);
    assertEquals(result.closes, 3);
    assert(result.disposed);
    assertEquals(result.activeDispose, [1, 2, 3, 4]);
    assert(result.contextAlive);
    assertEquals(result.error, 0);
  }));

Deno.test("WebGL late abort/disposal, malformed images, failed allocation/upload and shader cleanup", () =>
  withWebGLPage(async (page) => {
    const result = await page.evaluate(async () => {
      const { WebGLSpriteRenderer } = await import("/dist/webgl.js");
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2")!;
      const renderer = new WebGLSpriteRenderer(gl);
      const image = new ImageData(
        new Uint8ClampedArray([255, 0, 0, 255]),
        1,
        1,
      );
      const data = {
        version: 1,
        image: "atlas.png",
        dims: [1, 1],
        hitbox: [0, 0, 1, 1],
        frames: 1,
        per_row: 1,
        inner_pad: 0,
        outer_pad: 0,
        animations: { a: [0, "Static"] },
      };
      const fetcher = () => Promise.resolve(new Response(JSON.stringify(data)));
      const errors: string[] = [];
      const rejects = async (run: () => Promise<unknown>) => {
        try {
          await run();
          errors.push("no-error");
        } catch (e) {
          const error = e as { code?: string; name: string };
          errors.push(typeof error.code === "string" ? error.code : error.name);
        }
      };
      let closes = 0;
      const decoded = () => ({
        image,
        width: 1,
        height: 1,
        close: () => {
          closes++;
        },
      });
      const controller = new AbortController();
      await rejects(() =>
        renderer.loadSprite("https://test.invalid/a.json", {
          fetch: fetcher,
          signal: controller.signal,
          decodeImage: () => {
            controller.abort();
            return Promise.resolve(decoded());
          },
        })
      );
      await rejects(() =>
        renderer.loadSprite("https://test.invalid/a.json", {
          fetch: fetcher,
          decodeImage: () => Promise.resolve({ ...decoded(), width: 0 }),
        })
      );
      await rejects(() =>
        renderer.loadSprite("https://test.invalid/a.json", {
          fetch: () =>
            Promise.resolve(
              new Response(JSON.stringify({ ...data, dims: [2, 2] })),
            ),
          decodeImage: () => Promise.resolve(decoded()),
        })
      );
      await rejects(() =>
        renderer.loadSprite("https://test.invalid/a.json", {
          fetch: fetcher,
          decodeImage: () => Promise.reject(new Error("bad image")),
        })
      );
      const createTexture = gl.createTexture.bind(gl);
      Object.defineProperty(gl, "createTexture", {
        configurable: true,
        writable: true,
        value: () => null,
      });
      await rejects(() =>
        renderer.loadSprite("https://test.invalid/a.json", {
          fetch: fetcher,
          decodeImage: () => Promise.resolve(decoded()),
        })
      );
      gl.createTexture = createTexture;
      let textureDeletes = 0;
      const deleteTexture = gl.deleteTexture.bind(gl);
      gl.deleteTexture = (texture) => {
        textureDeletes++;
        deleteTexture(texture);
      };
      const texImage2D = gl.texImage2D.bind(gl);
      gl.texImage2D = () => {
        throw new Error("simulated upload failure");
      };
      await rejects(() =>
        renderer.loadSprite("https://test.invalid/a.json", {
          fetch: fetcher,
          decodeImage: () => Promise.resolve(decoded()),
        })
      );
      gl.texImage2D = texImage2D;
      const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      await rejects(() =>
        renderer.loadSprite("https://test.invalid/a.json", {
          fetch: fetcher,
          decodeImage: () => Promise.resolve({ ...decoded(), width: max + 1 }),
        })
      );
      // Disposal while decode is outstanding releases the late result without uploading it.
      let release: ((image: ReturnType<typeof decoded>) => void) | undefined;
      let started!: () => void;
      const ready = new Promise<void>((r) => {
        started = r;
      });
      const loading = renderer.loadSprite("https://test.invalid/a.json", {
        fetch: fetcher,
        decodeImage: () => {
          started();
          return new Promise((resolve) => {
            release = resolve;
          });
        },
      });
      await ready;
      renderer.dispose();
      release!(decoded());
      await rejects(() => loading);
      // Compile and link failures release all partially allocated GPU resources.
      let shaderDeletes = 0,
        programDeletes = 0,
        bufferDeletes = 0,
        vaoDeletes = 0;
      const deleteShader = gl.deleteShader.bind(gl),
        deleteProgram = gl.deleteProgram.bind(gl),
        deleteBuffer = gl.deleteBuffer.bind(gl),
        deleteVAO = gl.deleteVertexArray.bind(gl);
      gl.deleteShader = (x) => {
        shaderDeletes++;
        deleteShader(x);
      };
      gl.deleteProgram = (x) => {
        programDeletes++;
        deleteProgram(x);
      };
      gl.deleteBuffer = (x) => {
        bufferDeletes++;
        deleteBuffer(x);
      };
      gl.deleteVertexArray = (x) => {
        vaoDeletes++;
        deleteVAO(x);
      };
      const getShaderParameter = gl.getShaderParameter.bind(gl);
      gl.getShaderParameter = () => false;
      try {
        new WebGLSpriteRenderer(gl);
        errors.push("no-error");
      } catch (e) {
        errors.push((e as { code: string }).code);
      }
      gl.getShaderParameter = getShaderParameter;
      const getProgramParameter = gl.getProgramParameter.bind(gl);
      gl.getProgramParameter = () => false;
      try {
        new WebGLSpriteRenderer(gl);
        errors.push("no-error");
      } catch (e) {
        errors.push((e as { code: string }).code);
      }
      gl.getProgramParameter = getProgramParameter;
      gl.deleteShader = deleteShader;
      gl.deleteProgram = deleteProgram;
      gl.deleteBuffer = deleteBuffer;
      gl.deleteVertexArray = deleteVAO;
      gl.deleteTexture = deleteTexture;
      return {
        errors,
        closes,
        textureDeletes,
        shaderDeletes,
        programDeletes,
        bufferDeletes,
        vaoDeletes,
        error: gl.getError(),
      };
    });
    assertEquals(result.errors, [
      "AbortError",
      "numeric-limit",
      "atlas-bounds",
      "image-decode",
      "gpu",
      "gpu",
      "gpu",
      "disposed",
      "gpu",
      "gpu",
    ]);
    assertEquals(result.closes, 7);
    assertEquals(result.textureDeletes, 1);
    assertEquals(result.shaderDeletes, 3);
    assertEquals(result.programDeletes, 1);
    assertEquals(result.bufferDeletes, 1);
    assertEquals(result.vaoDeletes, 1);
    assertEquals(result.error, 0);
  }));

Deno.test("WebGL context loss discards queued draws and restores retained assets without I/O", () =>
  withWebGLPage(async (page) => {
    const result = await page.evaluate(async () => {
      const { SpritePlayer } = await import("/dist/mod.js");
      const { WebGLSpriteRenderer } = await import("/dist/webgl.js");
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      document.body.append(canvas);
      const gl = canvas.getContext("webgl2", {
        antialias: false,
        preserveDrawingBuffer: true,
      })!;
      const extension = gl.getExtension("WEBGL_lose_context")!;
      if (!extension) {
        throw new Error("WEBGL_lose_context is required for this gate");
      }
      canvas.addEventListener(
        "webglcontextlost",
        (event) => event.preventDefault(),
      );
      const waitEvent = (type: string) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Timed out waiting for ${type}; lost=${gl.isContextLost()}`,
                ),
              ),
            5000,
          );
          canvas.addEventListener(type, () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      const renderer = new WebGLSpriteRenderer(gl);
      let fetches = 0, closes = 0;
      const image = new ImageData(
        new Uint8ClampedArray([255, 0, 0, 255]),
        1,
        1,
      );
      const data = {
        version: 1,
        image: "atlas.png",
        dims: [1, 1],
        hitbox: [0, 0, 1, 1],
        frames: 1,
        per_row: 1,
        inner_pad: 0,
        outer_pad: 0,
        animations: { a: [0, "Static"] },
      };
      const fetcher = () => {
        fetches++;
        return Promise.resolve(new Response(JSON.stringify(data)));
      };
      const decoded = () => ({
        image,
        width: 1,
        height: 1,
        close: () => {
          closes++;
        },
      });
      const asset = await renderer.loadSprite("https://test.invalid/a.json", {
        fetch: fetcher,
        decodeImage: () => Promise.resolve(decoded()),
      });
      const player = new SpritePlayer(asset.definition);
      let release: ((image: ReturnType<typeof decoded>) => void) | undefined;
      let started!: () => void;
      const ready = new Promise<void>((r) => {
        started = r;
      });
      const loading = renderer.loadSprite("https://test.invalid/a.json", {
        fetch: fetcher,
        decodeImage: () => {
          started();
          return new Promise((resolve) => {
            release = resolve;
          });
        },
      });
      await ready;
      const beforeFetches = fetches;
      renderer.beginFrame({ width: 8, height: 8 });
      renderer.draw(asset, player);
      const lostEvent = waitEvent("webglcontextlost");
      extension.loseContext();
      await lostEvent;
      const errors: string[] = [];
      const fails = (fn: () => void) => {
        try {
          fn();
          errors.push("no-error");
        } catch (e) {
          errors.push((e as { code: string }).code);
        }
      };
      const lost = renderer.contextLost;
      fails(() => renderer.endFrame());
      fails(() => renderer.restore());
      fails(() => renderer.beginFrame({ width: 8, height: 8 }));
      const restoredEvent = waitEvent("webglcontextrestored");
      // Finish the lost event's dispatch before asking the browser to restore.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      extension.restoreContext();
      await restoredEvent;
      const awaitingRestore = renderer.contextLost;
      // Failed restore must clean up new allocations and allow a retry with original handles.
      const upload = gl.texImage2D.bind(gl);
      gl.texImage2D = () => {
        throw new Error("restore upload failure");
      };
      fails(() => renderer.restore());
      gl.texImage2D = upload;
      renderer.restore();
      renderer.restore();
      const restored = !renderer.contextLost;
      release!(decoded());
      try {
        await loading;
        errors.push("no-error");
      } catch (e) {
        errors.push((e as { code: string }).code);
      }
      renderer.beginFrame({ width: 8, height: 8, clearColor: [0, 0, 0, 0] });
      renderer.draw(asset, player);
      renderer.endFrame();
      const rgba = new Uint8Array(4);
      gl.readPixels(0, 7, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      const stable = !asset.disposed;
      const closeBefore = closes;
      renderer.dispose();
      return {
        lost,
        awaitingRestore,
        restored,
        stable,
        errors,
        fetches,
        beforeFetches,
        closeBefore,
        closes,
        rgba: Array.from(rgba),
        error: gl.getError(),
      };
    });
    assert(result.lost);
    assert(result.awaitingRestore);
    assert(result.restored);
    assert(result.stable);
    assertEquals(result.errors, [
      "context-lost",
      "context-lost",
      "context-lost",
      "gpu",
      "context-lost",
    ]);
    assertEquals(result.fetches, result.beforeFetches);
    assertEquals(result.closeBefore, 1);
    assertEquals(result.closes, 2);
    assertEquals(result.rgba, [255, 0, 0, 255]);
    assertEquals(result.error, 0);
  }));
