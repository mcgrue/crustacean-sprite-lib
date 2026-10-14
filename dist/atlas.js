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