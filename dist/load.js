import { CrustyError } from "./errors.js";
import { parseCrusty } from "./parse.js";
export function checkAbort(signal) {
    signal?.throwIfAborted();
}
export async function fetchResource(url, options) {
    checkAbort(options.signal);
    let response;
    try {
        response = await (options.fetch ?? globalThis.fetch)(url, options.signal ? { signal: options.signal } : {});
        checkAbort(options.signal);
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
    }
    catch (cause) {
        checkAbort(options.signal);
        if (cause instanceof Error && cause.name === "AbortError")
            throw cause;
        throw new CrustyError("fetch", `Failed fetching ${url}`, undefined, url, {
            cause,
        });
    }
    return response;
}
export async function loadSpriteDefinition(url, options = {}) {
    const requestedUrl = String(url);
    const response = await fetchResource(requestedUrl, options);
    const definitionUrl = response.url || requestedUrl;
    let text;
    try {
        text = await response.text();
        checkAbort(options.signal);
    }
    catch (cause) {
        checkAbort(options.signal);
        if (cause instanceof Error && cause.name === "AbortError")
            throw cause;
        throw new CrustyError("fetch", "Failed reading definition", undefined, definitionUrl, { cause });
    }
    let definition;
    try {
        definition = parseCrusty(text);
    }
    catch (cause) {
        if (cause instanceof CrustyError) {
            throw new CrustyError(cause.code, cause.message, cause.path, definitionUrl, { cause });
        }
        throw cause;
    }
    let imageUrl;
    try {
        imageUrl = String(options.resolveImage
            ? options.resolveImage(definition.image, definitionUrl)
            : new URL(definition.image.replaceAll("\\", "/"), definitionUrl));
    }
    catch (cause) {
        throw new CrustyError("validation", "Cannot resolve image URL", "$.image", definitionUrl, { cause });
    }
    checkAbort(options.signal);
    return Object.freeze({ definition, definitionUrl, imageUrl });
}
//# sourceMappingURL=load.js.map