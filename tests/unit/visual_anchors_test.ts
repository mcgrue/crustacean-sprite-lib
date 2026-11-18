import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  CrustyError,
  resolveVisualAnchor,
  validateCrusty,
} from "../../src/mod.ts";
import { authored } from "./helpers.ts";

const anchors = {
  defaults: { body: [1, 0], head: [0, 0] },
  frames: {
    "1": { body: [0, 1] },
  },
};

Deno.test("format two accepts sprite defaults and sparse frame anchors", () => {
  const definition = validateCrusty({
    ...authored(),
    version: 2,
    visual_anchors: anchors,
  });
  assertEquals(definition.version, 2);
  assertEquals(resolveVisualAnchor(definition, 1, "body"), [0, 1]);
  assertEquals(resolveVisualAnchor(definition, 0, "body"), [1, 0]);
  assertEquals(resolveVisualAnchor(definition, 1, "head"), [0, 0]);
  assertEquals(resolveVisualAnchor(definition, 1, "feet"), undefined);
  assertEquals(resolveVisualAnchor(definition, 1, "__proto__"), undefined);
  assert(Object.isFrozen(resolveVisualAnchor(definition, 1, "body")));
  assertEquals(validateCrusty({ ...authored(), version: 2 }).version, 2);
});

Deno.test("anchor fields require version two and valid cell coordinates", () => {
  assertThrows(
    () => validateCrusty({ ...authored(), visual_anchors: anchors }),
    CrustyError,
  );
  for (
    const visual_anchors of [
      { defaults: { body: [2, 1] } },
      { defaults: { body: [0.5, 1] } },
      { frames: { "28": { body: [0, 1] } } },
      { frames: { "01": { body: [0, 1] } } },
    ]
  ) {
    const error = assertThrows(
      () => validateCrusty({ ...authored(), version: 2, visual_anchors }),
      CrustyError,
    );
    assert(error.path?.startsWith("$.visual_anchors"));
  }
});

Deno.test("format two reads the shipped hero's unset hitbox", () => {
  const definition = validateCrusty({
    ...authored(),
    version: 2,
    hitbox: [0, 0, 0, 0],
    visual_anchors: anchors,
  });
  assertEquals(definition.hitbox, { x: 0, y: 0, width: 0, height: 0 });
  assertEquals(resolveVisualAnchor(definition, 1, "body"), [0, 1]);
  assertThrows(() =>
    validateCrusty({ ...authored(), version: 2, hitbox: [0, 0, 0, 1] })
  );
});
