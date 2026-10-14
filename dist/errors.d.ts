export type CrustyErrorCode = "syntax" | "validation" | "unknown-animation" | "numeric-limit" | "fetch" | "image-decode" | "atlas-bounds" | "context-lost" | "gpu" | "disposed";
export declare class CrustyError extends Error {
    readonly code: CrustyErrorCode;
    readonly path?: string | undefined;
    readonly sourceUrl?: string | undefined;
    constructor(code: CrustyErrorCode, message: string, path?: string | undefined, sourceUrl?: string | undefined, options?: {
        cause?: unknown;
    });
}
export declare function safeInteger(value: number, label: string, min?: number): number;
//# sourceMappingURL=errors.d.ts.map