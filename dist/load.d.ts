import type { SpriteDefinition } from "./types.js";
export interface LoadOptions {
    fetch?: typeof globalThis.fetch;
    resolveImage?: (reference: string, definitionUrl: string) => string | URL;
    signal?: AbortSignal;
}
export interface LoadedDefinition {
    readonly definition: SpriteDefinition;
    readonly definitionUrl: string;
    readonly imageUrl: string;
}
export declare function checkAbort(signal?: AbortSignal): void;
export declare function fetchResource(url: string, options: LoadOptions): Promise<Response>;
export declare function loadSpriteDefinition(url: string | URL, options?: LoadOptions): Promise<LoadedDefinition>;
//# sourceMappingURL=load.d.ts.map