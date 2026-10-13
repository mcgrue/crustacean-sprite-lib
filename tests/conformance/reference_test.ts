import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  CrustyError,
  parseCrusty,
  SpritePlayer,
  validateAtlas,
  validateCrusty,
} from "../../src/mod.ts";
import { authored } from "../unit/helpers.ts";

Deno.test("checked-in pinned reference vectors (source evidence, not executed C++)", async () => {
  const vectors = JSON.parse(
    await Deno.readTextFile("tests/fixtures/vectors.json"),
  );
  for (const v of vectors) {
    const d = validateCrusty(authored({ a: [v.pairs, v.mode] }));
    const p = new SpritePlayer(d);
    for (const operation of v.operations) {
      p.advance(operation.delta, operation.speed);
    }
    assertEquals(p.snapshot(), v.expected, v.name);
    assert(["source-assertion", "source-derived"].includes(v.evidence));
  }
});
Deno.test("Lord Stan all notation metadata matches inspected assertions", async () => {
  const d = parseCrusty(
    await Deno.readTextFile("assets/lord-stan/lord_stan.json"),
  );
  assertEquals(
    [d.width, d.height, d.frames, d.perRow, d.innerPad, d.outerPad],
    [48, 48, 28, 7, 0, 0],
  );
  assertEquals(Object.keys(d.animations).length, 22);
  for (const [suffix, frame] of [[1, 0], [2, 7], [3, 14], [4, 21]] as const) {
    assertEquals(d.animations[`valid_static_${suffix}`]!.instructions, [{
      frame,
      delayMs: 2147483647,
    }]);
  }
  const loop = [2, 3, 2, 4, 5, 6, 5, 4];
  for (
    const key of ["valid_looping_1", "valid_looping_1a", "valid_looping_3"]
  ) {
    assertEquals(
      d.animations[key]!.instructions,
      loop.map((frame) => ({ frame, delayMs: 70 })),
    );
  }
  for (
    const key of ["valid_looping_2", "valid_looping_2a", "valid_looping_4"]
  ) {
    assertEquals(
      d.animations[key]!.instructions,
      loop.map((frame, i) => ({ frame, delayMs: i < 3 ? 70 : 150 })),
    );
  }
  assertEquals(
    d.animations.valid_looping_5!.instructions.map((i) => i.delayMs),
    [70, 50, 70, 150, 50, 150, 50, 150],
  );
  assertEquals(
    d.animations.Random_1!.instructions,
    [16, 17, 16, 18, 19, 20, 19, 18].map((frame) => ({ frame, delayMs: 100 })),
  );
  for (
    const key of [
      "valid_back_and_forth_1",
      "valid_back_and_forth_1a",
      "valid_back_and_forth_3",
    ]
  ) {
    assertEquals(
      d.animations[key]!.instructions,
      [12, 13, 12, 14, 15, 16, 15, 14].map((frame) => ({ frame, delayMs: 75 })),
    );
  }
  for (
    const key of [
      "valid_back_and_forth_2",
      "valid_back_and_forth_2a",
      "valid_back_and_forth_4",
    ]
  ) {
    assertEquals(
      d.animations[key]!.instructions,
      [12, 13, 12, 14, 15, 16, 15, 14].map((frame, i) => ({
        frame,
        delayMs: i < 3 ? 75 : 175,
      })),
    );
  }
  for (const key of ["valid_once_1", "valid_once_3"]) {
    assertEquals(
      d.animations[key]!.instructions,
      [22, 23, 22, 24, 25, 26, 25, 24].map((frame) => ({ frame, delayMs: 50 })),
    );
  }
  for (const key of ["valid_once_2", "valid_once_4"]) {
    assertEquals(
      d.animations[key]!.instructions,
      [22, 23, 22, 24, 25, 26, 25, 24].map((frame, i) => ({
        frame,
        delayMs: i < 3 ? 50 : 250,
      })),
    );
  }
  validateAtlas(d, 336, 192);
});
Deno.test("alternate metadata fixtures intentionally exceed the shipped atlas", async () => {
  for (const name of ["lord_stan_2.json", "lord_stan_3.json"]) {
    const d = parseCrusty(await Deno.readTextFile(`tests/fixtures/${name}`));
    assertEquals([d.width, d.height, d.innerPad, d.outerPad], [48, 49, 1, 2]);
    assertEquals(d.hitbox, { x: 50, y: 51, width: 52, height: 53 });
    const p = new SpritePlayer(d);
    assertEquals(p.frame, name === "lord_stan_2.json" ? 19 : 18);
    assertThrows(() => validateAtlas(d, 336, 192), CrustyError);
  }
});
Deno.test("StaticRandom and palette fixtures retain candidates and metadata", async () => {
  const d = parseCrusty(
    await Deno.readTextFile("tests/fixtures/static_random.json"),
  );
  assertEquals(
    d.animations.full!.instructions,
    [1, 2, 3].map((frame) => ({ frame, delayMs: 2147483647 })),
  );
  const palette = parseCrusty(
    await Deno.readTextFile("tests/fixtures/hero_atk_axe_d.spr.json"),
  );
  assertEquals(palette.palette!.length, 27);
  assertEquals(palette.palette![26], [85, 75, 95]);
  assertEquals(palette.animations["hero_atk_axe_d.png"]!.facing, "down");
  assertEquals(
    palette.animations["hero_atk_axe_d.png"]!.instructions.map((i) =>
      i.delayMs
    ),
    [30, 30, 30, 60, 60, 150, 60, 45, 60, 60, 60, 80],
  );
});
Deno.test("shipped fixture pair hashes equal pinned git blobs", async () => {
  const provenance = JSON.parse(
    await Deno.readTextFile("tests/fixtures/provenance.json"),
  );
  assertEquals(provenance.revision, "371bbfd5674f245437d215ebbc0ad639daf69a58");
  for (const name of ["lord_stan.json", "lord_stan.png"]) {
    const bytes = await Deno.readFile(`assets/lord-stan/${name}`);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(
      new Uint8Array(hash),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    assertEquals(
      hex,
      provenance.hashes[`test/resources/atlas_sprites/parsing/${name}`],
    );
  }
});

Deno.test("all inspected assertion groups have coverage or a justified exclusion", async () => {
  const baseline = JSON.parse(
    await Deno.readTextFile("tests/fixtures/provenance.json"),
  );
  const inventory = JSON.parse(
    await Deno.readTextFile("tests/fixtures/contract-inventory.json"),
  );
  assertEquals(inventory.length, baseline.inventory.length);
  assertEquals(
    inventory.map((i: { source: string; assertion: string }) => ({
      source: i.source,
      assertion: i.assertion,
    })),
    baseline.inventory,
  );
  for (const item of inventory) {
    assert(item.coverage?.length || item.exclusion?.length, item.assertion);
  }
});

Deno.test("checked-in executed isolated C++ clocks match library states", async () => {
  const record = JSON.parse(
    await Deno.readTextFile("tests/fixtures/executed-cpp.json"),
  );
  assertEquals(record.evidence, "executed-cpp-isolated-playback");
  for (const trace of record.traces) {
    if (trace.name === "held-random") {
      assertEquals({
        frame: trace.frame,
        step: trace.step,
        remainingMs: trace.remainingMs,
      }, { frame: 2, step: 3, remainingMs: 100 });
      continue;
    }
    const mode = trace.name === "once"
      ? "Once"
      : trace.name === "ping"
      ? "BackAndForth"
      : "Looping";
    const pairs = ["quantized", "speed-carry"].includes(trace.name)
      ? [[0, 75], [1, 75], [2, 75]]
      : [[0, 5], [1, 7], [2, 11]];
    const p = new SpritePlayer(validateCrusty(authored({ a: [pairs, mode] })));
    switch (trace.name) {
      case "uneven":
        p.advance(10);
        p.advance(23);
        break;
      case "once":
        p.advance(23);
        p.advance(200);
        break;
      case "quantized":
        p.advance(37, 2);
        break;
      case "speed-carry":
        p.advance(60);
        p.advance(0, 2);
        p.advance(0, 1);
        break;
      case "ping":
        p.advance(24);
        break;
      default:
        throw new Error(`Unknown trace ${trace.name}`);
    }
    const s = p.snapshot();
    assertEquals({ frame: s.frame, step: s.step, remainingMs: s.remainingMs }, {
      frame: trace.frame,
      step: trace.step,
      remainingMs: trace.remainingMs,
    });
  }
});
