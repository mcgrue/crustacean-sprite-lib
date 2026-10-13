import { CrustyError } from "./errors.ts";
import { parseCrusty } from "./parse.ts";
import type { SpriteDefinition } from "./types.ts";

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
export function checkAbort(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}
export async function fetchResource(
  url: string,
  options: LoadOptions,
): Promise<Response> {
  checkAbort(options.signal);
  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(
      url,
      options.signal ? { signal: options.signal } : {},
    );
    checkAbort(options.signal);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (cause) {
    checkAbort(options.signal);
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new CrustyError("fetch", `Failed fetching ${url}`, undefined, url, {
      cause,
    });
  }
  return response;
}
export async function loadSpriteDefinition(
  url: string | URL,
  options: LoadOptions = {},
): Promise<LoadedDefinition> {
  const requestedUrl = String(url);
  const response = await fetchResource(requestedUrl, options);
  const definitionUrl = response.url || requestedUrl;
  let text: string;
  try {
    text = await response.text();
    checkAbort(options.signal);
  } catch (cause) {
    checkAbort(options.signal);
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new CrustyError(
      "fetch",
      "Failed reading definition",
      undefined,
      definitionUrl,
      { cause },
    );
  }
  let definition: SpriteDefinition;
  try {
    definition = parseCrusty(text);
  } catch (cause) {
    if (cause instanceof CrustyError) {
      throw new CrustyError(
        cause.code,
        cause.message,
        cause.path,
        definitionUrl,
        { cause },
      );
    }
    throw cause;
  }
  let imageUrl: string;
  try {
    imageUrl = String(
      options.resolveImage
        ? options.resolveImage(definition.image, definitionUrl)
        : new URL(definition.image.replaceAll("\\", "/"), definitionUrl),
    );
  } catch (cause) {
    throw new CrustyError(
      "validation",
      "Cannot resolve image URL",
      "$.image",
      definitionUrl,
      { cause },
    );
  }
  checkAbort(options.signal);
  return Object.freeze({ definition, definitionUrl, imageUrl });
}
