import type { SpriteDefinition } from "./types.js";
/** Validate unknown data and copy it into a deeply frozen definition. */
export declare function validateCrusty(value: unknown): SpriteDefinition;
/** Parse JSON with string-aware // comment handling; other JSON extensions are rejected. */
export declare function parseCrusty(text: string): SpriteDefinition;
//# sourceMappingURL=parse.d.ts.map