# crustacean-sprite-lib

Crusty v1 parsing, deterministic animation playback, async loading and browser
Canvas 2D rendering. Native TypeScript produces dependency-free ESM JavaScript
with generated declarations and source maps. Package name:
`crustacean-sprite-lib`; version `0.1.0`. Publication is deferred.

## Install from GitHub

Using Node 22+, install directly from the private repository with an SSH key
that has access:

```sh
npm install "git+ssh://git@github.com/mcgrue/crustacean-sprite-lib.git#main"
```

Use `#<commit>` or `#<release-tag>` for a fixed version. The consumer lockfile
records the resolved Git commit. Generated ESM JavaScript, declarations and
source maps are tracked in `dist/`, so installation does not run a build and
consumers do not need Deno or a compiler. There are no install lifecycle hooks
or package dependencies. Registry publication remains deferred.

Browser applications serve their sprite JSON/PNG through their own public asset
directory. The package's Lord Stan pair is under
`node_modules/crustacean-sprite-lib/assets/lord-stan/` if you want that example.

## Use

```ts
import { parseCrusty, SpritePlayer } from "crustacean-sprite-lib";

const definition = parseCrusty(jsonText);
const player = new SpritePlayer(definition, { animation: "walk" });
const completions = player.advance(16); // integer elapsed milliseconds
console.log(player.frame, player.snapshot(), completions);
```

Omit the animation only for single-animation definitions. `validateCrusty`
accepts unknown objects; `parseCrusty` additionally supports string-aware `//`
comments. Definitions and snapshots are deeply frozen. `frameRect` returns the
atlas crop; `validateAtlas` checks decoded dimensions, including partial rows.

Modes: `Static`, `Looping`, `BackAndForth`, `Once`, `Random`, `StaticRandom`.
Random rerolls on entry and each timed boundary. Inject `randomIndex(count)` in
the player constructor for deterministic choices. `select(key, definition?)`
preserves an identical binding; `restart()` begins a generation. `pause()` and
`resume()` preserve progress. `advance(deltaMs, speed = 1)` quantizes each dwell
to `max(1, floor(delay / max(1, speed)))`, retains consumed wall time on speed
changes and returns ordered completion records. It never reads a clock.

```ts
import { SpritePlayer } from "crustacean-sprite-lib";
import { drawSprite, loadCanvasSprite } from "crustacean-sprite-lib/canvas2d";

const asset = await loadCanvasSprite("https://example.test/sprite.json");
const player = new SpritePlayer(asset.definition, { animation: "walk" });
drawSprite(context, asset, player, { x: 100, y: 80, scaleX: 2, scaleY: 2 });
asset.dispose(); // after all borrowers finish; idempotent
```

Draw options include position, positive scale, horizontal/vertical flip,
rotation in radians, opacity and cell-pixel origin. The origin is placed at
`(x,y)`; defaults are top-left, scale 1, opacity 1, no rotation/flips. Context
transform, clip, alpha and smoothing are restored even on draw failure. Facing,
hitbox and palette are metadata. Palette replacement is deferred to v2.

`crustacean-sprite-lib/load` exports `loadSpriteDefinition`, returning
definition, final JSON URL and resolved image URL. Relative images resolve
against the final response URL, including redirects/backslashes. Both loaders
accept injected `fetch`, `resolveImage` and `signal`; the Canvas loader also
accepts `decodeImage`. A custom decoder returns image, width, height and
optional `close()` for resources it owns. Late images are closed on cancellation
and atlas failure. Players borrow assets and never dispose them.

Local files: read text with your runtime and call `parseCrusty`. Core imports
require no DOM or runtime globals; importing adapters performs no I/O. Node/Deno
support parsing, geometry, playback and HTTP definition loading. Canvas requires
a browser. Errors are `CrustyError` with stable codes, optional field paths and
source URLs, plus causes; cancellation retains abort errors.

## WebGL 2

```ts
import { SpritePlayer } from "crustacean-sprite-lib";
import { WebGLSpriteRenderer } from "crustacean-sprite-lib/webgl";

const gl = canvas.getContext("webgl2");
if (!gl) throw new Error("WebGL 2 unavailable");
const renderer = new WebGLSpriteRenderer(gl);
const asset = await renderer.loadSprite("https://example.test/sprite.json");
const player = new SpritePlayer(asset.definition, { animation: "walk" });
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

`DrawOptions` is shared with Canvas and exported from core and both adapters.
WebGL snapshots the frame and transform when queued. `endFrame()` batches
adjacent draws on one atlas while preserving painter order. Each asset uploads
once; frame updates never decode images or replace textures. Logical frame
width/height are independent of drawing-buffer resolution, with top-left
coordinates. Applications own canvas resizing/DPR. Omit `clearColor` to retain
canvas contents. A frame targets the canvas framebuffer and restores the GL
state it changes; uploads restore texture/pixel-unpack bindings and flags. Use
an error-free context with inactive transform feedback, and keep other GL
operations outside an active frame.

The fragment shader produces premultiplied alpha. Transparent contexts require
`premultipliedAlpha: true` (the browser default); opaque contexts are accepted.
Default decoding explicitly requests straight-alpha, unflipped ImageBitmap
pixels, with an HTMLImage fallback. An injected decoder returns
`WebGLDecodedImage` and must provide accurate dimensions and a stable,
straight-alpha, unflipped `TexImageSource` until its optional `close()` is
called.

Assets belong to one renderer. Disposing a queued asset is rejected until the
frame finishes. Renderer disposal discards any frame, invalidates all its assets
and releases resources, while leaving the caller's context alive. `dispose()` is
idempotent. `gpu` and `context-lost` extend the existing typed error codes.

After a `webglcontextlost` event, prevent its default to allow browser recovery.
Stop drawing while `renderer.contextLost` is true; call `renderer.restore()`
after `webglcontextrestored`. Retained decoded images rebuild GPU resources
without fetching again, keeping asset/player handles usable. Failed restoration
can be retried. Pending loads from an earlier context generation fail and
release their resources. The WebGL example handles these events and preserves
playback.

Open `http://127.0.0.1:8000/examples/webgl/index.html` after
`deno task example`. The Canvas example also links to it. New browser tests use
software WebGL 2 in Chromium and verify pixels, ordered batches, state
restoration, decode paths, context recovery and cleanup. No performance speedup
is claimed without a benchmark.

## Development and example

Pinned tools: Deno 2.9.5, TypeScript 5.9.3, Playwright 1.56.1; Node 22.20.0 or
24.10.0. Dependencies are locked. Browser setup requires Node and provisions
Chromium; Linux may need system libraries (`--with-deps` on CI).

```sh
deno install --frozen
deno task setup:browser
deno task test:all
deno task example
```

Open `http://127.0.0.1:8000` for Lord Stan, animation selection, pause and
restart. The example imports built JavaScript and retains fractional animation
time between animation frames. Hidden tabs reset the example's elapsed clock.

Individual tasks: `check`, `test`, `test:fixtures`, `build`, `test:browser`,
`test:package`, `test:git`, `check:dist`. The default unit suite needs no I/O
permissions. Browser tests use pinned Chromium over localhost; fixture tests
read only checked-in fixtures. Package tests create and unpack a real npm
tarball, run isolated Node/Deno JS consumers and strict NodeNext/Bundler TS
consumers with `skipLibCheck: false`. They validate exports, declarations, all
map targets and the asset/license file set. CI runs these gates on Windows/Linux
and both pinned Node versions.

`check:dist` builds a fresh stage without changing the working `dist/`, then
compares all bytes and filenames against `HEAD` and the working tree. CI fails
on changed, missing, uncommitted or obsolete output. After source edits, run
`deno task build` and commit `src/` with its generated `dist/`. For pre-commit
validation, stage the intended changes and run `deno task check:dist --staged`.
New Git-install tests snapshot that staged tree locally; on CI they use the
clean committed tree. `test:git` uses a local Git URL, normal npm installation
behavior and an isolated consumer, then checks every exported entry/type path.

Build creates a fresh package under `.build/package-<id>/` and mirrors its
generated output into `dist/` for the example. `.build/latest.txt` identifies
the latest stage. Prior artifacts remain available; no recursive cleanup occurs.
To create a distributable tarball, run `npm pack` inside that stage. The package
exports the original Lord Stan fixture pair at `assets/lord-stan/*`.

See [compatibility and evidence](docs/compatibility.md) for the pinned C++
baseline, assertion inventory, runtime traces, intentional differences and
exclusions. Library: [MIT](LICENSE). Artwork:
[asset attribution](ASSET-ATTRIBUTION.md).
