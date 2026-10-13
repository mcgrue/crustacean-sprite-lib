# WebGL renderer API proposal

Status: W0-W4 implemented. The renderer, WebGL example and new package/browser
tests are present. Verification is recorded below.

Add `crustacean-sprite-lib/webgl`. Keep `SpriteDefinition`, `SpritePlayer` and
the animation clock shared across adapters. Reuse the existing loader's URL,
fetch, cancellation and atlas validation contracts.

## Proposed use

```ts
import { SpritePlayer } from "crustacean-sprite-lib";
import { WebGLSpriteRenderer } from "crustacean-sprite-lib/webgl";

const gl = canvas.getContext("webgl2");
if (!gl) throw new Error("WebGL 2 unavailable");
const renderer = new WebGLSpriteRenderer(gl);
const asset = await renderer.loadSprite("/assets/lord-stan/lord_stan.json");
const player = new SpritePlayer(asset.definition, {
  animation: "valid_looping_1",
});

player.advance(16);
renderer.beginFrame({
  width: canvas.width,
  height: canvas.height,
  clearColor: [0, 0, 0, 0],
});
try {
  renderer.draw(asset, player, { x: 100, y: 80, scaleX: 2, scaleY: 2 });
} finally {
  renderer.endFrame();
}

asset.dispose();
renderer.dispose();
```

`width`/`height` specify logical drawing units. The viewport uses the actual
drawing-buffer size. Coordinates start at the top-left, with y increasing down;
rotation and cell-pixel origins match the Canvas adapter. The application owns
canvas resizing and DPR. Omit `clearColor` to preserve existing framebuffer
content; a supplied color uses normalized RGBA and clears the canvas target.

## Public shape

```ts
interface WebGLFrameOptions {
  width: number;
  height: number;
  clearColor?: readonly [number, number, number, number];
}

interface WebGLSprite extends LoadedDefinition {
  readonly disposed: boolean;
  dispose(): void;
}

class WebGLSpriteRenderer {
  constructor(gl: WebGL2RenderingContext);
  readonly disposed: boolean;
  readonly contextLost: boolean;
  loadSprite(
    url: string | URL,
    options?: WebGLLoadOptions,
  ): Promise<WebGLSprite>;
  beginFrame(options: WebGLFrameOptions): void;
  draw(asset: WebGLSprite, player: SpritePlayer, options?: DrawOptions): void;
  endFrame(): void;
  restore(): void;
  dispose(): void;
}
```

These are API sketches; generated declarations come from `src/webgl.ts`.
`WebGLLoadOptions` extends existing `LoadOptions` with an injectable image
decoder. Define a shared decoded-image type in a browser utility module, without
depending on the Canvas rendering adapter. Move `DrawOptions` to core and
re-export it from Canvas to preserve that existing import. All ten existing draw
fields retain their semantics. Core declarations stay free of DOM/WebGL types.

## Recommended contracts

- Start with WebGL 2. Construct from a caller-supplied context; never create a
  canvas or animation timer implicitly. The initial frame target is the canvas
  framebuffer; custom framebuffers/camera matrices are a possible later API.
- `draw` validates and snapshots frame/transform values at submission time. It
  never advances playback or consumes RNG. A subsequent player update cannot
  change an already queued draw.
- `endFrame` submits queued quads, batching adjacent compatible draws while
  preserving submission order for transparency. Reject nested frames, draws
  outside a frame and assets from another renderer. No texture sorting that
  changes painter order. Invalid draws leave earlier submissions intact.
- The initial renderer preserves external GL state it changes across a frame,
  including framebuffer, viewport, program, bindings and blending/scissor/depth
  state. Upload operations also restore changed GL state. External code must not
  mutate the context between `beginFrame` and `endFrame`.
- Upload the atlas once per asset; sample frame rectangles with nearest
  filtering, clamped texture edges and no mipmaps. Establish and test a
  consistent texture orientation and premultiplied-alpha pipeline, including
  ImageBitmap decoding options. Do not assume upload flags affect every source
  type identically.
- Assets own textures and retained decoded sources; players borrow them. Asset
  disposal is idempotent. Renderer disposal invalidates/releases its assets and
  its shader/buffer resources, while leaving the caller's context alive. Reject
  disposal of queued assets until the frame is submitted or discarded by
  renderer disposal. Cancellation or failed upload releases every newly owned
  resource.
- Context loss discards pending draws and makes GL operations throw a typed
  `context-lost` error. The caller prevents the lost event's default and calls
  `restore()` after `webglcontextrestored`. Retain decoded atlases so
  restoration rebuilds GPU resources without network fetches. Previously loaded
  asset handles remain usable after successful restoration. Ignore late load
  results after disposal or context-generation changes, releasing their
  resources.
- Extend `CrustyErrorCode` for context loss and GPU setup/upload failure. Keep
  existing validation/disposed/fetch/decode errors and abort semantics.

Texture upload and filtering background:
[MDN textures](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL),
[MDN upload flags](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/pixelStorei).
Context-loss detection:
[MDN isContextLost](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/isContextLost).

## Implementation milestones

| Milestone | Work                                                                   | Exit criterion                                                                                                                   |
| --------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| W0        | Confirm context support, batching, ownership and restoration contracts | Resolve the questions below                                                                                                      |
| W1        | Share draw/decode types and add WebGL subpath/type exports             | Existing Canvas imports and core without DOM still type-check; obtain approval before editing existing tests                     |
| W2        | Texture upload, shaders, transforms, ordered batching and disposal     | New real-browser readPixels cases cover crop, transparent edges, flips, origin, scaling, rotation, opacity and overlapping draws |
| W3        | Context loss, restore, late cancellation and example                   | New context-loss extension tests verify restored output and stable asset handles; lifecycle failures leak no resources           |
| W4        | Packaging, docs and Windows/Linux CI gates                             | Packaged subpath imports/types pass and existing suites stay green; run benchmarks before claiming a speedup                     |

# HUMAN QUESTIONS

None open. The instruction to implement the proposal uses its recommended
defaults: WebGL 2, caller-owned context with preserved GL state, canvas
framebuffer, ordered batching, and retained decoded images with explicit
restoration. WebGL 1, custom framebuffers/camera matrices and a discard/reload
policy remain possible future extensions.

The proposal includes ordered batching as a useful WebGL capability. Palette
replacement remains the separately planned v2 feature; shader-based tint/effects
would require their own API decisions.

## Implementation details and verification

- New `webgl` package export provides `WebGLSpriteRenderer`, `WebGLSprite`,
  `WebGLFrameOptions`, `WebGLLoadOptions`, and `WebGLDecodedImage`.
- `DrawOptions` is exported from core and re-exported from both adapters.
  Decoding is shared through `src/browser-image.ts`; Canvas behavior and its
  public decoder/type exports are preserved. Existing tests were not modified.
- GPU vertices snapshot player frames and transforms; adjacent draws for one
  asset share a draw call. Transparency preserves painter order. No implicit
  animation time, image redecoding or texture reupload during frames.
- Transparent contexts require the default `premultipliedAlpha: true`; opaque
  contexts are accepted. The shader premultiplies straight decoded samples. Both
  ImageBitmap options and HTMLImage upload flags are tested. Custom decoded
  images must remain stable with accurate dimensions until disposed.
- Caller GL state touched by setup/uploads/frames is restored, including the
  canvas draw-buffer selection, program/VAO/buffers, texture unit and sampler,
  unpack buffer/flags, framebuffer/viewport, blend equations/functions, color
  mask and enabled tests. Operations require an error-free context; GPU setup
  and frames reject active transform feedback. Other code must not use the GL
  context inside a frame.
- Typed `gpu`/`context-lost` errors, partial GPU allocation cleanup, late decode
  cancellation/disposal, failed restoration retries and context-generation
  checks are covered by new tests. GPU/CPU resources belong to the renderer's
  assets. Renderer disposal does not destroy the caller's context.
- The new Lord Stan example at `/examples/webgl/index.html` exposes all 22
  animations, pause/restart and explicit context recovery. Canvas links to it.
- Windows and Ubuntu 24.04 under WSL: Deno 2.9.5 full suite passes 86 tests (69
  unit, 7 conformance, 8 browser, 2 packed-package tests). Chromium WebGL gates
  use software rendering, not hardware performance evidence.
- Packed WebGL imports work without browser globals in Node/Deno; strict
  NodeNext/Bundler consumers and core declarations without DOM pass. Node
  22.20.0/24.10.0 are checked through the package gates on both platforms.
- The example screenshot was inspected by the implementing agent. Human visual
  acceptance, Firefox/WebKit support, performance measurements, npm publication
  and remote CI for this change are not claimed.
