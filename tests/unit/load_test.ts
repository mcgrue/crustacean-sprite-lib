import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { CrustyError, SpritePlayer } from "../../src/mod.ts";
import { loadSpriteDefinition } from "../../src/load.ts";
import { drawSprite, loadCanvasSprite } from "../../src/canvas2d.ts";
import type { CanvasSprite } from "../../src/canvas2d.ts";
import { authored } from "./helpers.ts";

const url = "https://example.test/original/sprite.json";
function resources(data = authored(), status = 200): typeof fetch {
  return ((input: string | URL | Request) =>
    Promise.resolve(
      new Response(
        String(input).endsWith(".json") ? JSON.stringify(data) : new Blob(),
        { status },
      ),
    )) as typeof fetch;
}
Deno.test("redirect URL, backslashes, authored spelling and resolver", async () => {
  const data = { ...authored(), image: "..\\images\\atlas.png" };
  const response = new Response(JSON.stringify(data));
  Object.defineProperty(response, "url", {
    value: "https://cdn.test/final/sprite.json",
  });
  const loaded = await loadSpriteDefinition(url, {
    fetch: () => Promise.resolve(response),
  });
  assertEquals(loaded.imageUrl, "https://cdn.test/images/atlas.png");
  assertEquals(loaded.definition.image, data.image);
  const virtual = await loadSpriteDefinition(url, {
    fetch: resources(),
    resolveImage: (image, source) => {
      assertEquals(source, url);
      return `https://virtual.test/${image}`;
    },
  });
  assertEquals(virtual.imageUrl, "https://virtual.test/atlas.png");
});
Deno.test("HTTP, network, syntax and decoder failures are typed with source", async () => {
  for (
    const fetcher of [
      resources(authored(), 404),
      (() => Promise.reject(new Error("offline"))) as typeof fetch,
    ]
  ) {
    const e = await assertRejects(
      () => loadSpriteDefinition(url, { fetch: fetcher }),
      CrustyError,
    );
    assertEquals(e.code, "fetch");
    assertEquals(e.sourceUrl, url);
  }
  const e = await assertRejects(
    () =>
      loadSpriteDefinition(url, {
        fetch: () => Promise.resolve(new Response("bad")),
      }),
    CrustyError,
  );
  assertEquals(e.code, "syntax");
  assertEquals(e.sourceUrl, url);
  const e2 = await assertRejects(
    () =>
      loadCanvasSprite(url, {
        fetch: resources(),
        decodeImage: () => Promise.reject(new Error("bad png")),
      }),
    CrustyError,
  );
  assertEquals(e2.code, "image-decode");
  const e3 = await assertRejects(
    () =>
      loadCanvasSprite(url, {
        fetch: (input, init) =>
          String(input).endsWith("png")
            ? Promise.resolve(new Response(null, { status: 404 }))
            : resources()(input, init),
      }),
    CrustyError,
  );
  assertEquals(e3.code, "fetch");
});
Deno.test("owned atlas disposed once; borrowed atlas has no close", async () => {
  let closes = 0;
  const asset = await loadCanvasSprite(url, {
    fetch: resources(),
    decodeImage: () =>
      Promise.resolve({
        image: {} as CanvasImageSource,
        width: 14,
        height: 8,
        close: () => {
          closes++;
        },
      }),
  });
  assertEquals(closes, 0);
  asset.dispose();
  asset.dispose();
  assertEquals(closes, 1);
  assert(asset.disposed);
  assertThrows(
    () =>
      drawSprite(
        {} as CanvasRenderingContext2D,
        asset,
        new SpritePlayer(asset.definition),
      ),
    CrustyError,
  );
  const borrowed = await loadCanvasSprite(url, {
    fetch: resources(),
    decodeImage: () =>
      Promise.resolve({ image: {} as CanvasImageSource, width: 14, height: 8 }),
  });
  borrowed.dispose();
  assert(borrowed.disposed);
});
Deno.test("atlas bounds failure releases decoded resource", async () => {
  let closes = 0;
  const e = await assertRejects(
    () =>
      loadCanvasSprite(url, {
        fetch: resources(),
        decodeImage: () =>
          Promise.resolve({
            image: {} as CanvasImageSource,
            width: 1,
            height: 1,
            close: () => {
              closes++;
            },
          }),
      }),
    CrustyError,
  );
  assertEquals(e.code, "atlas-bounds");
  assertEquals(closes, 1);
});
Deno.test("abort before fetch and during decode preserves abort and closes late image", async () => {
  const before = new AbortController();
  before.abort();
  await assertRejects(
    () =>
      loadSpriteDefinition(url, { signal: before.signal, fetch: resources() }),
    DOMException,
    "aborted",
  );
  const during = new AbortController();
  let closes = 0;
  await assertRejects(() =>
    loadCanvasSprite(url, {
      fetch: resources(),
      signal: during.signal,
      decodeImage: () => {
        during.abort();
        return Promise.resolve({
          image: {} as CanvasImageSource,
          width: 14,
          height: 8,
          close: () => {
            closes++;
          },
        });
      },
    }), DOMException);
  assertEquals(closes, 1);
});
Deno.test("abort during text read and fetch failure remains cancellation", async () => {
  const control = new AbortController();
  const response = new Response();
  Object.defineProperty(response, "text", {
    value: () => {
      control.abort();
      return Promise.resolve("{}");
    },
  });
  await assertRejects(
    () =>
      loadSpriteDefinition(url, {
        signal: control.signal,
        fetch: () => Promise.resolve(response),
      }),
    DOMException,
  );
  const second = new AbortController();
  await assertRejects(
    () =>
      loadSpriteDefinition(url, {
        signal: second.signal,
        fetch: () => {
          second.abort();
          return Promise.reject(new Error("network cancelled"));
        },
      }),
    DOMException,
  );
});

Deno.test("atlas body AbortError is preserved without an explicit signal", async () => {
  const atlas = new Response();
  Object.defineProperty(atlas, "blob", {
    value: () =>
      Promise.reject(new DOMException("cancelled body", "AbortError")),
  });
  const error = await assertRejects(() =>
    loadCanvasSprite(url, {
      fetch: (input, init) =>
        String(input).endsWith("png")
          ? Promise.resolve(atlas)
          : resources()(input, init),
    }), DOMException);
  assertEquals(error.name, "AbortError");
});
Deno.test("recording context crop/transforms and restoration even after draw failure", async () => {
  const asset: CanvasSprite = await loadCanvasSprite(url, {
    fetch: resources(),
    decodeImage: () =>
      Promise.resolve({ image: {} as CanvasImageSource, width: 14, height: 8 }),
  });
  const p = new SpritePlayer(asset.definition);
  p.advance(5);
  const calls: unknown[][] = [];
  let restored = false;
  const context = {
    globalAlpha: 0.5,
    imageSmoothingEnabled: true,
    save: () => calls.push(["save"]),
    restore: () => {
      restored = true;
    },
    translate: (...a: number[]) => calls.push(["translate", ...a]),
    rotate: (...a: number[]) => calls.push(["rotate", ...a]),
    scale: (...a: number[]) => calls.push(["scale", ...a]),
    drawImage: (...a: unknown[]) => {
      calls.push(["draw", ...a.slice(1)]);
      throw new Error("draw failed");
    },
  } as unknown as CanvasRenderingContext2D;
  assertThrows(() =>
    drawSprite(context, asset, p, {
      x: 10,
      y: 20,
      originX: 1,
      scaleX: 2,
      flipY: true,
      opacity: 0.5,
    })
  );
  assert(restored);
  assertEquals(context.globalAlpha, 0.25);
  assertEquals(calls.at(-1), ["draw", 2, 0, 2, 2, -1, 0, 2, 2]);
  assertEquals(calls[3], ["scale", 2, -1]);
  assertThrows(() => drawSprite(context, asset, p, { x: NaN }), CrustyError);
  assertThrows(() => drawSprite(context, asset, p, { scaleX: 0 }), CrustyError);
});
