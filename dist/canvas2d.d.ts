import type { LoadedDefinition, LoadOptions } from "./load.js";
import type { SpritePlayer } from "./player.js";
import type { DecodedImage } from "./browser-image.js";
import type { DrawOptions } from "./types.js";
export type { DrawOptions } from "./types.js";
export interface DecodedAtlas extends DecodedImage {
    /** Close only resources created/owned by this decoder. */
    readonly close?: () => void;
}
export interface CanvasLoadOptions extends LoadOptions {
    decodeImage?: (blob: Blob, signal?: AbortSignal) => Promise<DecodedAtlas>;
}
export interface CanvasSprite extends LoadedDefinition {
    readonly disposed: boolean;
    readonly atlas: DecodedAtlas;
    dispose(): void;
}
/** Lazy browser decoder. No browser globals are touched at module import. */
export declare function decodeCanvasImage(blob: Blob, signal?: AbortSignal): Promise<DecodedAtlas>;
export declare function loadCanvasSprite(url: string | URL, options?: CanvasLoadOptions): Promise<CanvasSprite>;
export declare function drawSprite(context: CanvasRenderingContext2D, asset: CanvasSprite, player: SpritePlayer, options?: DrawOptions): void;
//# sourceMappingURL=canvas2d.d.ts.map