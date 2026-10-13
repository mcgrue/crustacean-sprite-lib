import { validateCrusty } from "../../src/mod.ts";
export function authored(
  animations: Record<string, unknown> = {
    a: [[[0, 5], [1, 7], [2, 11]], "Looping"],
  },
): Record<string, unknown> {
  return {
    version: 1,
    image: "atlas.png",
    dims: [2, 2],
    hitbox: [0, 0, 2, 2],
    frames: 28,
    per_row: 7,
    inner_pad: 0,
    outer_pad: 0,
    animations,
  };
}
export function definition(animations?: Record<string, unknown>) {
  return validateCrusty(authored(animations));
}
