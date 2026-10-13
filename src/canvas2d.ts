import { frameRect, validateAtlas } from "./atlas.ts";
import { CrustyError } from "./errors.ts";
import { checkAbort, fetchResource, loadSpriteDefinition } from "./load.ts";
import type { LoadedDefinition, LoadOptions } from "./load.ts";
import type { SpritePlayer } from "./player.ts";

export interface DecodedAtlas {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
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
export async function decodeCanvasImage(
  blob: Blob,
  signal?: AbortSignal,
): Promise<DecodedAtlas> {
  checkAbort(signal);
  if (typeof globalThis.createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    try {
      checkAbort(signal);
    } catch (cause) {
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
  } catch (cause) {
    checkAbort(signal);
    throw cause;
  } finally {
    signal?.removeEventListener("abort", abort);
    URL.revokeObjectURL(objectUrl);
  }
}

export async function loadCanvasSprite(
  url: string | URL,
  options: CanvasLoadOptions = {},
): Promise<CanvasSprite> {
  const loaded = await loadSpriteDefinition(url, options);
  const response = await fetchResource(loaded.imageUrl, options);
  let blob: Blob;
  try {
    blob = await response.blob();
    checkAbort(options.signal);
  } catch (cause) {
    checkAbort(options.signal);
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new CrustyError(
      "fetch",
      "Failed reading atlas",
      undefined,
      loaded.imageUrl,
      { cause },
    );
  }
  let atlas: DecodedAtlas;
  try {
    atlas = await (options.decodeImage ?? decodeCanvasImage)(
      blob,
      options.signal,
    );
  } catch (cause) {
    checkAbort(options.signal);
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new CrustyError(
      "image-decode",
      "Failed decoding atlas",
      undefined,
      loaded.imageUrl,
      { cause },
    );
  }
  try {
    checkAbort(options.signal);
    validateAtlas(loaded.definition, atlas.width, atlas.height);
  } catch (cause) {
    atlas.close?.();
    throw cause;
  }
  let disposed = false;
  return Object.freeze({
    ...loaded,
    atlas: Object.freeze({ ...atlas }),
    get disposed() {
      return disposed;
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        atlas.close?.();
      }
    },
  });
}

export interface DrawOptions {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  flipX?: boolean;
  flipY?: boolean;
  rotation?: number;
  opacity?: number;
  originX?: number;
  originY?: number;
}
export function drawSprite(
  context: CanvasRenderingContext2D,
  asset: CanvasSprite,
  player: SpritePlayer,
  options: DrawOptions = {},
): void {
  if (asset.disposed) {
    throw new CrustyError("disposed", "Canvas sprite has been disposed");
  }
  if (player.definition !== asset.definition) {
    throw new CrustyError("validation", "Player and asset definitions differ");
  }
  const {
    x = 0,
    y = 0,
    scaleX = 1,
    scaleY = 1,
    rotation = 0,
    opacity = 1,
    originX = 0,
    originY = 0,
    flipX = false,
    flipY = false,
  } = options;
  for (
    const [key, value] of Object.entries({
      x,
      y,
      scaleX,
      scaleY,
      rotation,
      opacity,
      originX,
      originY,
    })
  ) {
    if (!Number.isFinite(value)) {
      throw new CrustyError("validation", `Nonfinite ${key}`, key);
    }
  }
  if (scaleX <= 0 || scaleY <= 0 || opacity < 0 || opacity > 1) {
    throw new CrustyError("validation", "Invalid scale or opacity");
  }
  const rect = frameRect(asset.definition, player.frame);
  context.save();
  try {
    context.translate(x, y);
    context.rotate(rotation);
    context.scale(scaleX * (flipX ? -1 : 1), scaleY * (flipY ? -1 : 1));
    context.globalAlpha *= opacity;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      asset.atlas.image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      -originX,
      -originY,
      rect.width,
      rect.height,
    );
  } finally {
    context.restore();
  }
}
