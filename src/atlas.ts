import { CrustyError, safeInteger } from "./errors.ts";
import type { Rect, SpriteDefinition, VisualAnchor } from "./types.ts";

export function frameRect(definition: SpriteDefinition, frame: number): Rect {
  safeInteger(frame, "frame");
  if (frame >= definition.frames) {
    throw new CrustyError("validation", "Frame outside definition", "frame");
  }
  return Object.freeze({
    x: definition.outerPad +
      frame % definition.perRow * (definition.width + definition.innerPad),
    y: definition.outerPad +
      Math.floor(frame / definition.perRow) *
        (definition.height + definition.innerPad),
    width: definition.width,
    height: definition.height,
  });
}

/** Return a point in unscaled cell pixels for the given atlas frame. */
export function resolveVisualAnchor(
  definition: SpriteDefinition,
  frame: number,
  name: string,
): VisualAnchor | undefined {
  safeInteger(frame, "frame");
  if (frame >= definition.frames) {
    throw new CrustyError("validation", "Frame outside definition", "frame");
  }
  const anchors = definition.visualAnchors;
  const overrides = anchors?.frames?.[frame];
  if (overrides && Object.hasOwn(overrides, name)) return overrides[name];
  if (anchors?.defaults && Object.hasOwn(anchors.defaults, name)) {
    return anchors.defaults[name];
  }
  return undefined;
}

export function validateAtlas(
  definition: SpriteDefinition,
  width: number,
  height: number,
): void {
  safeInteger(width, "atlas.width", 1);
  safeInteger(height, "atlas.height", 1);
  const rightmost = frameRect(
    definition,
    Math.min(definition.perRow, definition.frames) - 1,
  );
  const bottom = frameRect(definition, definition.frames - 1);
  if (
    rightmost.x + rightmost.width > width || bottom.y + bottom.height > height
  ) {
    throw new CrustyError(
      "atlas-bounds",
      "Declared frames do not fit decoded atlas",
    );
  }
}
