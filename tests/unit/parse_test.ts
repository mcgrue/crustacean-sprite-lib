import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  CrustyError,
  frameRect,
  parseCrusty,
  validateAtlas,
  validateCrusty,
} from "../../src/mod.ts";
import { authored, definition } from "./helpers.ts";

for (const body of [14, "14", [14], ["14"], [14, 30]]) {
  Deno.test(`Static notation ${JSON.stringify(body)}`, () => {
    assertEquals(
      definition({ a: [body, "sTaTiC"] }).animations.a!.instructions,
      [{ frame: 14, delayMs: 2147483647 }],
    );
  });
}
for (
  const body of ["T70 2 3 T 150 4", "t 70\t2   3 t150 4", [[2, 70], [3, 70], [
    4,
    150,
  ]], [["t", 70], ["f", 2], ["F", 3], ["T", 150], ["F", 4]]]
) {
  Deno.test(`timed notation ${JSON.stringify(body)}`, () => {
    assertEquals(
      definition({ a: [body, "Looping"] }).animations.a!.instructions,
      [{ frame: 2, delayMs: 70 }, { frame: 3, delayMs: 70 }, {
        frame: 4,
        delayMs: 150,
      }],
    );
  });
}
Deno.test("comments preserve URL strings, escapes, and newline syntax", () => {
  const data = authored();
  data.image = 'https://example.com/a//b"c.png';
  assertEquals(
    parseCrusty("// header\n" + JSON.stringify(data) + " // end").image,
    data.image,
  );
  assertThrows(() => parseCrusty("{/*block*/}"), CrustyError);
  assertThrows(() => parseCrusty('{"version":1,}'), CrustyError);
});
Deno.test("case folding, aliases, prototype keys, immutable copied data", () => {
  const rows = Object.create(null);
  rows.__proto__ = [0, "Static"];
  const data = {
    ...authored(rows),
    dims: { w: 2, height: 3 },
    hitbox: { x: 4, y: 5, width: 6, h: 7 },
  };
  const d = validateCrusty(
    Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k.toUpperCase(), v]),
    ),
  );
  assertEquals(d.animations.__proto__!.instructions[0]!.frame, 0);
  rows.__proto__[0] = 1;
  assertEquals(d.animations.__proto__!.instructions[0]!.frame, 0);
  assert(Object.isFrozen(d));
  assert(Object.isFrozen(d.animations));
  assert(Object.isFrozen(d.animations.__proto__!.instructions[0]));
  assertEquals(d.hitbox, { x: 4, y: 5, width: 6, height: 7 });
});
Deno.test("options, completion targets, and palette are normalized", () => {
  const d = validateCrusty({
    ...authored({
      dying: [[[0, 10]], "Once", { Facing: "DoWn", ON_COMPLETE: "dead" }],
      dead: [1, "Static"],
    }),
    original_image_palette: [[0, 255, 2]],
  });
  assertEquals(d.animations.dying!.facing, "down");
  assertEquals(d.animations.dying!.onComplete, "dead");
  assertEquals(d.palette, [[0, 255, 2]]);
  assert(Object.isFrozen(d.palette![0]));
});
const malformed: [string, unknown][] = [
  ["null", null],
  ["array", []],
  ["missing version", { ...authored(), version: undefined }],
  ["wrong version", { ...authored(), version: 2 }],
  ["case conflict", { ...authored(), VERSION: 1 }],
  ["alias conflict", { ...authored(), dims: { w: 2, width: 2, h: 2 } }],
  ["missing field", { ...authored(), inner_pad: undefined }],
  ["unsafe field", { ...authored(), frames: Number.MAX_SAFE_INTEGER }],
  ["empty rows", authored({})],
  ["zero dimensions", { ...authored(), dims: [0, 2] }],
  ["bad palette", { ...authored(), original_image_palette: [[256, 0, 0]] }],
  ...[
    [],
    [0, "Unknown"],
    [0, "Static", 1],
    [[28], "StaticRandom"],
    [100, [], "Random"],
    [0, [1], "Random"],
    [100, [1], "Random", { facing: "down" }],
    ["T10 1", "Looping", { facing: "up" }],
    ["1 T10 2", "Looping"],
    ["T10 1 T", "Once"],
    ["T10 1 T20", "Once"],
    ["T0 1", "Looping"],
    [[["F", 0]], "Looping"],
    [[["T", 10]], "Looping"],
    [[["X", 1]], "Once"],
    [[[0, 0]], "Once"],
    [[], "Looping"],
    [[0, 1, 2], "Static"],
    [0, "Static", { facing: "diagonal" }],
    [0, "Static", { facing: null }],
    [0, "Static", { facing: "up", direction: "up" }],
    [0, "Static", { mystery: "up" }],
    [0, "Static", { on_complete: "a" }],
    [[[0, 1]], "Once", { on_complete: "missing" }],
  ].map((row, i): [string, unknown] => [`row ${i}`, authored({ a: row })]),
  [
    "cycle",
    authored({
      a: [[[0, 1]], "Once", { on_complete: "b" }],
      b: [[[1, 1]], "Once", { on_complete: "a" }],
    }),
  ],
];
for (const [name, data] of malformed) {
  Deno.test(`reject ${name} with field path`, () => {
    const error = assertThrows(() => validateCrusty(data), CrustyError);
    assertEquals(error.code, "validation");
    assert(error.path?.startsWith("$"));
  });
}
Deno.test("atlas partial rows, padding, and extra pixels", () => {
  const d = validateCrusty({
    ...authored(),
    frames: 5,
    per_row: 3,
    inner_pad: 1,
    outer_pad: 2,
  });
  assertEquals(frameRect(d, 4), { x: 5, y: 5, width: 2, height: 2 });
  validateAtlas(d, 10, 9);
  validateAtlas(d, 100, 100);
  assertThrows(() => validateAtlas(d, 9, 9), CrustyError);
  assertThrows(() => validateAtlas(d, 10, 6), CrustyError);
  assertThrows(() => frameRect(d, 5), CrustyError);
  assertThrows(() => frameRect(d, -1), CrustyError);
});
