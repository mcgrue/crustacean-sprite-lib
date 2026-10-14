import type { DecodedImage } from "./browser-image.js";
import type { LoadedDefinition, LoadOptions } from "./load.js";
import type { SpritePlayer } from "./player.js";
import type { DrawOptions } from "./types.js";
export type { DrawOptions } from "./types.js";
export type WebGLDecodedImage = DecodedImage<TexImageSource>;
export interface WebGLLoadOptions extends LoadOptions {
    /** Supply a straight-alpha, unflipped source. close() releases only owned resources. */
    decodeImage?: (blob: Blob, signal?: AbortSignal) => Promise<WebGLDecodedImage>;
}
export interface WebGLFrameOptions {
    width: number;
    height: number;
    clearColor?: readonly [number, number, number, number];
}
export interface WebGLSprite extends LoadedDefinition {
    readonly disposed: boolean;
    dispose(): void;
}
/** WebGL 2 ordered sprite batching. Caller supplies the context and animation clock. */
export declare class WebGLSpriteRenderer {
    #private;
    constructor(gl: WebGL2RenderingContext);
    get disposed(): boolean;
    /** True until explicit restore(), even after the browser restores the context. */
    get contextLost(): boolean;
    loadSprite(url: string | URL, options?: WebGLLoadOptions): Promise<WebGLSprite>;
    beginFrame(options: WebGLFrameOptions): void;
    draw(handle: WebGLSprite, player: SpritePlayer, options?: DrawOptions): void;
    endFrame(): void;
    /** Call after webglcontextrestored; rebuild retained assets without fetching. */
    restore(): void;
    dispose(): void;
}
//# sourceMappingURL=webgl.d.ts.map