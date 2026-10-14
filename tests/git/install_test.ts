import { assert, assertEquals } from "@std/assert";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<string> {
  const result = await new Deno.Command(command, { args, cwd }).output();
  assert(
    result.success,
    new TextDecoder().decode(result.stderr) +
      new TextDecoder().decode(result.stdout),
  );
  return new TextDecoder().decode(result.stdout);
}

Deno.test("clean Git installation supplies all four entries and strict types without a build hook", async () => {
  const root = Deno.cwd();
  const scratch = resolve(`.build/git-install-${crypto.randomUUID()}`);
  await Deno.mkdir(scratch, { recursive: true });
  // CI reads a clean committed index. Locally, stage the intended changes to
  // validate their Git tree before committing. This test never changes that index.
  const tree = (await run("git", ["write-tree"], root)).trim();
  await run("git", [
    "archive",
    "--format=tar",
    `--output=${join(scratch, "source.tar")}`,
    tree,
  ], root);
  const source = join(scratch, "source checkout");
  await Deno.mkdir(source);
  const tar = Deno.build.os === "windows"
    ? join(Deno.env.get("SystemRoot") ?? "C:/Windows", "System32/tar.exe")
    : "tar";
  await run(tar, ["-xf", "source.tar", "-C", source], scratch);
  const metadata = JSON.parse(
    await Deno.readTextFile(join(source, "package.json")),
  );
  for (
    const name of ["prepare", "prepack", "preinstall", "install", "postinstall"]
  ) assert(!metadata.scripts?.[name], `Unexpected install/build hook ${name}`);
  assertEquals(Object.keys(metadata.dependencies ?? {}), []);
  assertEquals(Object.keys(metadata.devDependencies ?? {}), []);
  const entries = [".", "./load", "./canvas2d", "./webgl"];
  for (const key of entries) {
    await Deno.stat(join(source, metadata.exports[key].import));
    await Deno.stat(join(source, metadata.exports[key].types));
  }
  await run("git", ["init", "--quiet", "--initial-branch=main"], source);
  await run("git", ["-c", "core.autocrlf=false", "add", "--all"], source);
  await run("git", [
    "-c",
    "user.name=Git install test",
    "-c",
    "user.email=git-install@example.invalid",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "--quiet",
    "-m",
    "Consumer fixture",
  ], source);
  assertEquals(
    (await run("git", ["status", "--porcelain"], source)).trim(),
    "",
  );
  const commit = (await run("git", ["rev-parse", "HEAD"], source)).trim();
  const consumer = join(scratch, "consumer");
  await Deno.mkdir(consumer);
  await Deno.writeTextFile(
    join(consumer, "package.json"),
    '{"private":true,"type":"module"}\n',
  );
  const nodePath = (await run("node", ["-p", "process.execPath"], root)).trim();
  const npmCli = Deno.env.get("NPM_CLI_JS") ??
    (Deno.build.os === "windows"
      ? join(dirname(nodePath), "node_modules/npm/bin/npm-cli.js")
      : undefined);
  const spec = `git+${pathToFileURL(source).href}#${commit}`;
  const install = [
    "install",
    "--no-audit",
    "--no-fund",
    "--cache",
    join(scratch, "npm-cache"),
    spec,
  ];
  // Use normal npm lifecycle behavior. No compiler or Deno build is invoked.
  if (npmCli) await run("node", [npmCli, ...install], consumer);
  else await run("npm", install, consumer);
  assertEquals(
    (await run("git", ["status", "--porcelain"], source)).trim(),
    "",
  );
  const lock = JSON.parse(
    await Deno.readTextFile(join(consumer, "package-lock.json")),
  );
  const installed = lock.packages["node_modules/crustacean-sprite-lib"];
  assert(installed.resolved.includes(commit));
  assert(!installed.hasInstallScript);
  assertEquals(Object.keys(lock.packages).sort(), [
    "",
    "node_modules/crustacean-sprite-lib",
  ]);
  const module = join(consumer, "node_modules/crustacean-sprite-lib");
  for (const key of entries) {
    assertEquals(
      await Deno.readFile(join(module, metadata.exports[key].import)),
      await Deno.readFile(join(source, metadata.exports[key].import)),
    );
  }
  await Deno.writeTextFile(
    join(consumer, "consumer.js"),
    `import {parseCrusty, SpritePlayer} from "crustacean-sprite-lib";
import {loadSpriteDefinition} from "crustacean-sprite-lib/load";
import {loadCanvasSprite} from "crustacean-sprite-lib/canvas2d";
import {WebGLSpriteRenderer} from "crustacean-sprite-lib/webgl";
const definition = parseCrusty(JSON.stringify({version:1,image:"atlas.png",dims:[1,1],hitbox:[0,0,1,1],frames:2,per_row:2,inner_pad:0,outer_pad:0,animations:{a:[[[0,1],[1,1]],"Looping"]}}));
const player = new SpritePlayer(definition); player.advance(1);
if (player.frame !== 1) throw new Error("Playback import failed");
if ([loadSpriteDefinition,loadCanvasSprite,WebGLSpriteRenderer].some(value => typeof value !== "function")) throw new Error("Missing subpath export");
console.log("git consumer ok");`,
  );
  assertEquals(
    (await run("node", ["consumer.js"], consumer)).trim(),
    "git consumer ok",
  );
  assertEquals(
    (await run(Deno.execPath(), [
      "run",
      "--node-modules-dir=manual",
      "consumer.js",
    ], consumer)).trim(),
    "git consumer ok",
  );
  await Deno.writeTextFile(
    join(consumer, "core.ts"),
    `import {SpritePlayer, parseCrusty, type DrawOptions} from "crustacean-sprite-lib";
declare const text: string; const p = new SpritePlayer(parseCrusty(text)); p.advance(1);
const options: DrawOptions = {scaleX:2}; void options;
// @ts-expect-error elapsed time is numeric
p.advance("1");
// @ts-expect-error core consumer must stay free of DOM globals
window.document;`,
  );
  await Deno.writeTextFile(
    join(consumer, "browser.ts"),
    `import {SpritePlayer} from "crustacean-sprite-lib";
import {loadSpriteDefinition} from "crustacean-sprite-lib/load";
import {drawSprite,loadCanvasSprite} from "crustacean-sprite-lib/canvas2d";
import {WebGLSpriteRenderer} from "crustacean-sprite-lib/webgl";
declare const context: CanvasRenderingContext2D; declare const gl:WebGL2RenderingContext;
await loadSpriteDefinition("https://example.invalid/s.json");
const canvasAsset = await loadCanvasSprite("https://example.invalid/s.json"); drawSprite(context,canvasAsset,new SpritePlayer(canvasAsset.definition));
const renderer = new WebGLSpriteRenderer(gl); const asset = await renderer.loadSprite("https://example.invalid/s.json");
renderer.beginFrame({width:128,height:128}); renderer.draw(asset,new SpritePlayer(asset.definition)); renderer.endFrame();
// @ts-expect-error renderer needs WebGL 2
new WebGLSpriteRenderer(context);`,
  );
  // Explicit consumer type checking occurs after installation, using the dev tool.
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
});
