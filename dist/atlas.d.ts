import type { Rect, SpriteDefinition, VisualAnchor } from "./types.js";
export declare function frameRect(definition: SpriteDefinition, frame: number): Rect;
/** Return a point in unscaled cell pixels for the given atlas frame. */
export declare function resolveVisualAnchor(definition: SpriteDefinition, frame: number, name: string): VisualAnchor | undefined;
export declare function validateAtlas(definition: SpriteDefinition, width: number, height: number): void;
//# sourceMappingURL=atlas.d.ts.map