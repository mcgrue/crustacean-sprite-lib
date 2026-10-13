import { assert, assertEquals } from "@std/assert";
import { dirname, join, resolve } from "node:path";

async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<string> {
  const result = await new Deno.Command(command, { args, cwd }).output();
  assert(
    result.success,
    new TextDecoder().decode(result.stdout) +
      new TextDecoder().decode(result.stderr),
  );
  return new TextDecoder().decode(result.stdout);
}

Deno.test("packed WebGL subpath imports without browser globals and preserves shared/Canvas types", async () => {
  const stage = (await Deno.readTextFile(".build/latest.txt")).trim();
  const nodePath = (await run("node", ["-p", "process.execPath"], stage))
    .trim();
  const npmCli = Deno.env.get("NPM_CLI_JS") ??
    (Deno.build.os === "windows"
      ? join(dirname(nodePath), "node_modules/npm/bin/npm-cli.js")
      : undefined);
  const packed = npmCli
    ? await run("node", [npmCli, "pack", "--json", "--ignore-scripts"], stage)
    : await run("npm", ["pack", "--json", "--ignore-scripts"], stage);
  const manifest = JSON.parse(packed)[0];
  for (
    const name of [
      "dist/webgl.js",
      "dist/webgl.d.ts",
      "dist/browser-image.js",
      "dist/webgl-state.js",
    ]
  ) assert(manifest.files.some((file: { path: string }) => file.path === name));
  const consumer = resolve(`.build/webgl-consumer-${crypto.randomUUID()}`);
  const module = join(consumer, "node_modules/crustacean-sprite-lib");
  await Deno.mkdir(module, { recursive: true });
  const tar = Deno.build.os === "windows"
    ? join(Deno.env.get("SystemRoot") ?? "C:/Windows", "System32/tar.exe")
    : "tar";
  await run(tar, [
    "-xzf",
    manifest.filename,
    "--strip-components=1",
    "-C",
    module,
  ], stage);
  await Deno.writeTextFile(
    join(consumer, "package.json"),
    JSON.stringify({
      type: "module",
      dependencies: { "crustacean-sprite-lib": "0.1.0" },
    }),
  );
  await Deno.writeTextFile(
    join(consumer, "runtime.js"),
    `globalThis.fetch = () => { throw new Error("Import started I/O"); };
const { WebGLSpriteRenderer } = await import("crustacean-sprite-lib/webgl");
if (typeof WebGLSpriteRenderer !== "function") throw new Error("Missing renderer export");
console.log("webgl import ok");`,
  );
  assertEquals(
    (await run("node", ["runtime.js"], consumer)).trim(),
    "webgl import ok",
  );
  assertEquals(
    (await run(Deno.execPath(), [
      "run",
      "--node-modules-dir=manual",
      "runtime.js",
    ], consumer)).trim(),
    "webgl import ok",
  );
  await Deno.writeTextFile(
    join(consumer, "core.ts"),
    `import type { DrawOptions } from "crustacean-sprite-lib";
const draw: DrawOptions = { x: 1, flipX: true }; void draw;
// @ts-expect-error core declarations must not add DOM globals
window.document;`,
  );
  await Deno.writeTextFile(
    join(consumer, "browser.ts"),
    `import { SpritePlayer, type DrawOptions } from "crustacean-sprite-lib";
import type { DrawOptions as CanvasDrawOptions, DecodedAtlas } from "crustacean-sprite-lib/canvas2d";
import { WebGLSpriteRenderer, type WebGLSprite, type WebGLLoadOptions, type WebGLDecodedImage } from "crustacean-sprite-lib/webgl";
declare const gl: WebGL2RenderingContext;
const renderer = new WebGLSpriteRenderer(gl);
const options: WebGLLoadOptions = { signal: new AbortController().signal };
const asset: WebGLSprite = await renderer.loadSprite("https://example.test/a.json", options);
const draw: DrawOptions = { x: 1, scaleX: 2, rotation: 0.5 }; const canvasDraw: CanvasDrawOptions = draw;
renderer.beginFrame({width:128,height:128,clearColor:[0,0,0,0]}); renderer.draw(asset,new SpritePlayer(asset.definition),canvasDraw); renderer.endFrame(); renderer.restore(); asset.dispose(); renderer.dispose();
declare const bitmap: ImageBitmap;
declare module "crustacean-sprite-lib/canvas2d" { interface DecodedAtlas { readonly annotation?: string; } }
const shared = { image: bitmap, width: 1, height: 1 };
const decoded: WebGLDecodedImage = shared; const canvasDecoded: DecodedAtlas = shared; void decoded; void canvasDecoded;
// @ts-expect-error Canvas context is not a WebGL context
new WebGLSpriteRenderer(document.createElement("canvas").getContext("2d")!);
// @ts-expect-error clear color needs exactly four components
renderer.beginFrame({width:1,height:1,clearColor:[0,0,0]});
// @ts-expect-error scale is numeric
renderer.draw(asset,new SpritePlayer(asset.definition),{scaleX:"2"});`,
  );
  for (const resolution of ["NodeNext", "Bundler"]) {
    for (const target of ["core", "browser"]) {
      const config = `${resolution}-${target}.json`;
      await Deno.writeTextFile(
        join(consumer, config),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: resolution === "NodeNext" ? "NodeNext" : "ESNext",
            moduleResolution: resolution,
            lib: target === "core" ? ["ES2022"] : ["ES2022", "DOM"],
            types: [],
            strict: true,
            skipLibCheck: false,
            noEmit: true,
          },
          files: [`${target}.ts`],
        }),
      );
      await run(Deno.execPath(), [
        "run",
        "--allow-read",
        "--allow-env",
        "npm:typescript@5.9.3/tsc",
        "--project",
        config,
      ], consumer);
    }
  }
  const metadata = JSON.parse(
    await Deno.readTextFile(join(module, "package.json")),
  );
  assertEquals(Object.keys(metadata.exports["./webgl"]), ["types", "import"]);
});
