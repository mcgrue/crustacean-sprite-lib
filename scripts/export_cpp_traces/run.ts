/** Compile pinned production playback unchanged with isolated integration stubs. */
import { join, resolve } from "node:path";
import { SpritePlayer, validateCrusty } from "../../src/mod.ts";
const revision = "371bbfd5674f245437d215ebbc0ad639daf69a58";
const repository = Deno.args[0] ?? "D:/dev/breadbros/dredmor";
const compiler = Deno.args[1] ?? "clang++";
const directory = resolve(`.build/cpp-${crypto.randomUUID()}`);
await Deno.mkdir(directory, { recursive: true });
const paths = [
  "sprite_crustacean_state.cpp",
  "sprite_crustacean_state.h",
  "sprite_crustacean.h",
  "sprite_crustacean_data.h",
  "direction.h",
];
const hashes: Record<string, string> = {};
for (const name of paths) {
  const r = await new Deno.Command("git", {
    args: ["-C", repository, "show", `${revision}:src/${name}`],
  }).output();
  if (!r.success) throw new Error(new TextDecoder().decode(r.stderr));
  await Deno.writeFile(join(directory, name), r.stdout);
  hashes[name] = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", r.stdout)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
// Stubs are integration boundaries only; no production clock/parser code is rewritten.
const stubs = {
  "bob.h":
    "#pragma once\n#include <cassert>\n#include <cstdlib>\n#include <tuple>\nstruct Bob {};\n#define SDL_assert(x) assert(x)\n",
  "log.h": "#pragma once\n#define LOG(...) ((void)0)\n",
  "platform.h":
    "#pragma once\n#include <string>\ninline void public_platform_dialog(std::string const&, std::string const&) {}\n",
  "random.h":
    "#pragma once\n#include <cstddef>\ninline std::size_t random2(std::size_t) { return 0; }\n",
};
for (const [name, text] of Object.entries(stubs)) {
  await Deno.writeTextFile(join(directory, name), text);
}
await Deno.copyFile(
  new URL("main.cpp", import.meta.url),
  join(directory, "main.cpp"),
);
const executable = join(
  directory,
  Deno.build.os === "windows" ? "traces.exe" : "traces",
);
const args = [
  "-std=c++17",
  ...Deno.args.slice(2),
  "main.cpp",
  "sprite_crustacean_state.cpp",
  "-o",
  executable,
];
const version = await new Deno.Command(compiler, { args: ["--version"] })
  .output();
const compiled = await new Deno.Command(compiler, { args, cwd: directory })
  .output();
if (!compiled.success) {
  throw new Error(new TextDecoder().decode(compiled.stderr));
}
const output = await new Deno.Command(executable).output();
if (!output.success) throw new Error(new TextDecoder().decode(output.stderr));
const traces = JSON.parse(new TextDecoder().decode(output.stdout));
for (const trace of traces) {
  const mode = trace.name === "once"
    ? "Once"
    : trace.name === "ping"
    ? "BackAndForth"
    : "Looping";
  const pairs = trace.name === "quantized" || trace.name === "speed-carry"
    ? [[0, 75], [1, 75], [2, 75]]
    : [[0, 5], [1, 7], [2, 11]];
  if (trace.name === "held-random") continue; // intentional library timed-reroll difference
  const definition = validateCrusty({
    version: 1,
    image: "atlas.png",
    dims: [2, 2],
    hitbox: [0, 0, 2, 2],
    frames: 3,
    per_row: 3,
    inner_pad: 0,
    outer_pad: 0,
    animations: { a: [pairs, mode] },
  });
  const p = new SpritePlayer(definition);
  if (trace.name === "uneven") {
    p.advance(10);
    p.advance(23);
  }
  if (trace.name === "once") {
    p.advance(23);
    p.advance(200);
  }
  if (trace.name === "quantized") p.advance(37, 2);
  if (trace.name === "speed-carry") {
    p.advance(60);
    p.advance(0, 2);
    p.advance(0, 1);
  }
  if (trace.name === "ping") p.advance(24);
  const s = p.snapshot();
  for (const key of ["frame", "step", "remainingMs"] as const) {
    if (s[key] !== trace[key]) throw new Error(`Mismatch ${trace.name}.${key}`);
  }
}
await Deno.writeTextFile(
  "tests/fixtures/executed-cpp.json",
  JSON.stringify(
    {
      evidence: "executed-cpp-isolated-playback",
      revision,
      compiler: new TextDecoder().decode(version.stdout).trim(),
      command: [compiler, ...args],
      hashes,
      stubs,
      traces,
      limitation:
        "Production state code compiled unchanged. Bob/SDL/logging/RNG integrations stubbed; no full-game, parser, or RNG parity claim.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Five production C++ playback traces match; held Random divergence recorded.",
);
