import { assert, assertEquals } from "@std/assert";
import { dirname, join, resolve } from "node:path";

async function copy(from: string, to: string): Promise<void> {
  await Deno.mkdir(to, { recursive: true });
  for await (const e of Deno.readDir(from)) {
    if (e.isDirectory) await copy(join(from, e.name), join(to, e.name));
    else if (e.isFile) {
      await Deno.copyFile(join(from, e.name), join(to, e.name));
    }
  }
}
async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<string> {
  const r = await new Deno.Command(command, { args, cwd }).output();
  assert(
    r.success,
    new TextDecoder().decode(r.stderr) + new TextDecoder().decode(r.stdout),
  );
  return new TextDecoder().decode(r.stdout);
}
async function tsc(config: string, cwd: string): Promise<void> {
  await run(Deno.execPath(), [
    "run",
    "--allow-read",
    "--allow-env",
    "npm:typescript@5.9.3/tsc",
    "--project",
    config,
  ], cwd);
}
Deno.test("actual npm tarball, isolated Node/Deno ESM, strict types, exports and map targets", async () => {
  const stage = (await Deno.readTextFile(".build/latest.txt")).trim();
  // npm pack creates a real local tarball; nothing is published or cleaned up.
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
  const paths = new Set<string>(
    manifest.files.map((f: { path: string }) => f.path),
  );
  for (
    const required of [
      "dist/mod.js",
      "dist/mod.d.ts",
      "dist/load.js",
      "dist/canvas2d.js",
      "assets/lord-stan/lord_stan.json",
      "assets/lord-stan/lord_stan.png",
      "LICENSE",
      "ASSET-ATTRIBUTION.md",
    ]
  ) assert(paths.has(required), required);
  for (const path of paths) {
    assert(
      /^(dist\/|src\/|assets\/lord-stan\/|README\.md$|LICENSE$|ASSET-ATTRIBUTION\.md$|package\.json$)/
        .test(path),
      `unwanted package file ${path}`,
    );
  }
  // Extract exactly the packed files into an isolated package, not the source checkout.
  const consumer = resolve(`.build/consumer-${crypto.randomUUID()}`);
  const module = join(consumer, "node_modules/crustacean-sprite-lib");
  await Deno.mkdir(module, { recursive: true });
  // Platform tar supports gzip on supported Windows/Linux CI runners.
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
  const source =
    `import { parseCrusty, SpritePlayer } from "crustacean-sprite-lib";
import { loadSpriteDefinition } from "crustacean-sprite-lib/load";
import { loadCanvasSprite } from "crustacean-sprite-lib/canvas2d";
const data = {version:1,image:"atlas.png",dims:[2,2],hitbox:[0,0,2,2],frames:3,per_row:3,inner_pad:0,outer_pad:0,animations:{a:[[[0,5],[1,7],[2,11]],"Looping"]}};
const player = new SpritePlayer(parseCrusty(JSON.stringify(data)));
player.advance(10); player.advance(23);
if (player.frame !== 1 || player.snapshot().step !== 4 || player.snapshot().remainingMs !== 2) throw new Error("Playback consumer failed");
if (typeof loadSpriteDefinition !== "function" || typeof loadCanvasSprite !== "function") throw new Error("Subpaths failed");
console.log("consumer ok");`;
  await Deno.writeTextFile(join(consumer, "consumer.js"), source);
  assertEquals(
    (await run("node", ["consumer.js"], consumer)).trim(),
    "consumer ok",
  );
  assertEquals(
    (await run(Deno.execPath(), [
      "run",
      "--node-modules-dir=manual",
      "consumer.js",
    ], consumer)).trim(),
    "consumer ok",
  );
  const core =
    `import { parseCrusty, SpritePlayer, type SpriteDefinition, type AnimationMode } from "crustacean-sprite-lib";
const d: SpriteDefinition = parseCrusty("{}"); const p = new SpritePlayer(d); p.advance(1);
const mode: AnimationMode = "StaticRandom"; void mode;
// @ts-expect-error elapsed time is numeric
p.advance("1");
// @ts-expect-error definitions are readonly
d.width = 1;
// @ts-expect-error unknown mode
const wrong: AnimationMode = "unknown"; void wrong;
// @ts-expect-error DOM is unavailable in the core environment
window.document;`;
  await Deno.writeTextFile(join(consumer, "core.ts"), core);
  await Deno.writeTextFile(
    join(consumer, "browser.ts"),
    `import { loadSpriteDefinition, type LoadedDefinition } from "crustacean-sprite-lib/load";
import { drawSprite, loadCanvasSprite, type CanvasSprite } from "crustacean-sprite-lib/canvas2d";
import { SpritePlayer } from "crustacean-sprite-lib";
const loaded: Promise<LoadedDefinition> = loadSpriteDefinition("https://example.test/a.json"); void loaded;
const asset: CanvasSprite = await loadCanvasSprite("https://example.test/a.json");
drawSprite(document.createElement("canvas").getContext("2d")!, asset, new SpritePlayer(asset.definition));
// @ts-expect-error draw coordinates are numbers
drawSprite(document.createElement("canvas").getContext("2d")!, asset, new SpritePlayer(asset.definition), { x: "wrong" });`,
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
      await tsc(config, consumer);
    }
  }
  const metadata = JSON.parse(
    await Deno.readTextFile(join(module, "package.json")),
  );
  for (const key of [".", "./load", "./canvas2d"]) {
    const exported = metadata.exports[key];
    assertEquals(Object.keys(exported)[0], "types");
    await Deno.stat(join(module, exported.types));
    await Deno.stat(join(module, exported.import));
  }
  for await (const e of Deno.readDir(join(module, "dist"))) {
    const path = join(module, "dist", e.name);
    const text = await Deno.readTextFile(path);
    if (e.name.endsWith(".map")) {
      const map = JSON.parse(text);
      for (const source of map.sources) {
        await Deno.stat(resolve(module, "dist", source));
      }
    } else {
      for (const match of text.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
        assert(!match[1]!.endsWith(".ts"), `unrewritten ${e.name}`);
        const target = resolve(module, "dist", match[1]!);
        await Deno.stat(target);
        if (e.name.endsWith(".d.ts")) {
          await Deno.stat(target.replace(/\.js$/, ".d.ts"));
        }
      }
    }
  }
  const fixture = await Deno.readTextFile(
    join(module, "assets/lord-stan/lord_stan.json"),
  );
  assert(fixture.includes('"image": "lord_stan.png"'));
  await Deno.stat(join(module, "assets/lord-stan/lord_stan.png"));
  // Leave all artifacts for inspection; deletion requires user approval.
  await copy(join(module, "assets/lord-stan"), join(consumer, "fixture-copy"));
});
