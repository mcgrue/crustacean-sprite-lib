/** Shared browser image ownership, independent of a rendering adapter. */
export interface DecodedImage<T = CanvasImageSource> {
    readonly image: T;
    readonly width: number;
    readonly height: number;
    readonly close?: () => void;
}
/** Browser globals are accessed only when decoding is requested. */
export declare function decodeBrowserImage(blob: Blob, signal?: AbortSignal, bitmapOptions?: ImageBitmapOptions): Promise<DecodedImage<ImageBitmap | HTMLImageElement>>;
//# sourceMappingURL=browser-image.d.ts.map