import { checkAbort } from "./load.js";
/** Browser globals are accessed only when decoding is requested. */
export async function decodeBrowserImage(blob, signal, bitmapOptions) {
    checkAbort(signal);
    if (typeof globalThis.createImageBitmap === "function") {
        const bitmap = bitmapOptions === undefined
            ? await createImageBitmap(blob)
            : await createImageBitmap(blob, bitmapOptions);
        try {
            checkAbort(signal);
        }
        catch (cause) {
            bitmap.close();
            throw cause;
        }
        return Object.freeze({
            image: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            close: () => bitmap.close(),
        });
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    const abort = () => {
        image.src = "";
    };
    try {
        signal?.addEventListener("abort", abort, { once: true });
        image.src = objectUrl;
        await image.decode();
        checkAbort(signal);
        return Object.freeze({
            image,
            width: image.naturalWidth,
            height: image.naturalHeight,
        });
    }
    catch (cause) {
        checkAbort(signal);
        throw cause;
    }
    finally {
        signal?.removeEventListener("abort", abort);
        URL.revokeObjectURL(objectUrl);
    }
}
//# sourceMappingURL=browser-image.js.map