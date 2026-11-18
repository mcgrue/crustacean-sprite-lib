import { CrustyError, safeInteger } from "./errors.js";
export function frameRect(definition, frame) {
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
export function resolveVisualAnchor(definition, frame, name) {
    safeInteger(frame, "frame");
    if (frame >= definition.frames) {
        throw new CrustyError("validation", "Frame outside definition", "frame");
    }
    const anchors = definition.visualAnchors;
    const overrides = anchors?.frames?.[frame];
    if (overrides && Object.hasOwn(overrides, name))
        return overrides[name];
    if (anchors?.defaults && Object.hasOwn(anchors.defaults, name)) {
        return anchors.defaults[name];
    }
    return undefined;
}
export function validateAtlas(definition, width, height) {
    safeInteger(width, "atlas.width", 1);
    safeInteger(height, "atlas.height", 1);
    const rightmost = frameRect(definition, Math.min(definition.perRow, definition.frames) - 1);
    const bottom = frameRect(definition, definition.frames - 1);
    if (rightmost.x + rightmost.width > width || bottom.y + bottom.height > height) {
        throw new CrustyError("atlas-bounds", "Declared frames do not fit decoded atlas");
    }
}
//# sourceMappingURL=atlas.js.map