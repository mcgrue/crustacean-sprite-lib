# Crustacean Sprite Library: Implementation Design

Status: implemented; this document retains the design contract. Current test
evidence and remaining acceptance states are recorded in
[docs/compatibility.md](docs/compatibility.md) and the project plan.
Source inspection: 2026-10-13. Execution checklist and decisions:
[CRUSTACEAN-SPRITE-LIB-PLAN.md](CRUSTACEAN-SPRITE-LIB-PLAN.md).

## 1. Goal and scope

Implement Crusty v1 loading, animation playback, and browser Canvas 2D rendering
in TypeScript. Compile that source to ordinary JavaScript ES modules with
generated TypeScript declarations. Use Deno as the development task and test
runner. Canvas 2D is the user's confirmed first rendering target.

Decisions updated 2026-10-13: timed rerolls for Random; first-class Deno and
Node consumption; palette replacement in v2; ship the Lord Stan test asset; MIT
license. ESM JavaScript with generated `.d.ts` files, distributed through npm,
is confirmed by the user. The package name is `crustacean-sprite-lib`.
Publication is deferred until the user requests it; implementation and local
package validation can proceed.

The initial release provides:

- A renderer-independent parser, validated sprite definition, atlas geometry,
  and deterministic animation player.
- Asynchronous JSON and image loading, with injectable resource access.
- A Canvas 2D adapter and a small browser example.
- Deno tests tracing relevant behavior to the current Dredmor C++
  implementation.
- An npm-compatible ESM package, `.d.ts` files, source maps, and declaration
  maps.
- The Lord Stan JSON/PNG test asset as the shipped browser example.

Deferred: CommonJS/UMD bundles, WebGL/WebGPU, engine-specific adapters, atlas
generation, legacy `.spr`/XML conversion, Dredmor mod mounting, monster
lifecycle, and game animation gates. Palette replacement is planned for v2;
palette and facing metadata are still parsed and exposed in v1. Outlines and
Dredmor's special 2x scaling filter are out of scope.

## 2. Compatibility baseline

Use the inspected Dredmor checkout at `D:/dev/breadbros/dredmor`, commit
`371bbfd5674f245437d215ebbc0ad639daf69a58` (merge of PR #274). Its branch was
`bmcgraw/2026-10-13/action-man`. The worktree had an unrelated `src/main.h`
modification and an untracked action-planning document; neither is part of this
design. Historical PR #266 plans are not the compatibility baseline.

Relevant production files, relative to that checkout:

| Source                               | Contract to extract                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/sprite.cpp`                     | `_parse_crustacean_json_v1`, animation notation parsers, mode parsing, atlas frame rectangles |
| `src/sprite_crustacean.h`            | Animation modes, instructions, facing and completion options                                  |
| `src/sprite_crustacean_data.h`       | Definition, dimensions, hitbox, palette and atlas layout                                      |
| `src/sprite_crustacean_state.cpp`    | Restart, speed changes, timed advancement, frame selection                                    |
| `src/bob.cpp`                        | Idempotent binding, pause, completion status, `on_complete` chaining                          |
| `src/Include/tracery/tracery.cpp`    | Comment preprocessing before JSON parsing                                                     |
| `src/legacy_sprite_parity_audit.cpp` | Structural validation and atlas bounds checks                                                 |

`src/render/atlas_sprite.cpp` contains old stubs; it is not the production
loader or playback specification. `sprite_crustacean_data.cpp` and
`sprite_crustacean.cpp` likewise do not contain the substantive parser.

Compatibility means matching supported data and observable playback except for
the user-directed Random change: this library rerolls on timed boundaries, where
the inspected C++ implementation retains its selected instruction. It does not
require reproducing C++ truncation, undefined behavior, memory ownership,
process exits, or malformed-input crashes. Record every intentional difference
in a test-linked compatibility document.

Before implementation, record source-file hashes and relevant fixture hashes in
`tests/fixtures/provenance.json`. Pin the baseline; do not silently follow a
moving Dredmor branch. Current findings come from source and assertion
inspection, not a fresh C++ test run.

## 3. Package and module boundaries

```text
Crusty text / unknown object
            |
     parse and validate ----> immutable SpriteDefinition
                                    |              |
                              SpritePlayer     frameRect()
                                    |              |
                                    +-- frame -----+
                                                   |
image loader ----> decoded atlas ------------> Canvas 2D draw
```

| Public entry point               | Responsibility                                     | Environment dependencies            |
| -------------------------------- | -------------------------------------------------- | ----------------------------------- |
| `crustacean-sprite-lib`          | Types, parsing, geometry, player, errors           | ECMAScript only                     |
| `crustacean-sprite-lib/load`     | Fetch definition text and resolve image references | Fetch, URL, AbortSignal; injectable |
| `crustacean-sprite-lib/canvas2d` | Decode images, own decoded resources, draw sprites | Browser Canvas 2D and image APIs    |

Core imports must work without `window`, `document`, `Deno`, `process`, or any
image/canvas implementation. Importing an adapter must not start I/O or access a
browser global until an operation is called. Renderer adapters consume the same
definition and player; they must never implement their own animation clock.

Deno and Node support covers parsing, geometry, playback, and HTTP(S) definition
loading. Local-file callers read text with their runtime's file API and pass it
to `parseCrusty`. Canvas rendering targets browsers; Node consumption does not
require installing a native canvas package.

Use named exports, camelCase functions/methods, PascalCase types, and string
unions for modes. Preserve the format's existing serialized field names. Do not
expose mutable playhead internals or C++ enum ordinals as public API.

## 4. Parsing and normalized data

Expose `parseCrusty(text: string): SpriteDefinition` and
`validateCrusty(value: unknown): SpriteDefinition`. These operations do no I/O.
Export authoring types separately from the validated representation; a
TypeScript cast must not be the validation path for loaded data.

Definitions contain readonly cell dimensions, hitbox, frame count, padding,
columns, image reference, optional RGB palette, and named normalized animations.
Every instruction is `{ frame: number, delayMs: number }`. Options normalize to
`facing` and `onComplete`. Use private maps with lookup methods or frozen
null-prototype objects; `ReadonlyMap` alone does not prevent runtime mutation.
Names such as `__proto__` must remain ordinary animation keys.

### Required v1 fields

| Field                    | Accepted representation                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| `version`                | Integer `1`; reject absent or unsupported versions                          |
| `image`                  | Nonempty string; preserve authored spelling                                 |
| `dims`                   | `[width, height]` or object using `w`/`width`, `h`/`height`                 |
| `hitbox`                 | `[x, y, width, height]` or object using `x`, `y`, `w`/`width`, `h`/`height` |
| `frames`, `per_row`      | Positive integers                                                           |
| `inner_pad`, `outer_pad` | Nonnegative integers                                                        |
| `animations`             | Nonempty dictionary of named animation rows                                 |
| `original_image_palette` | Optional nonempty array of RGB byte triples                                 |

Require finite integers. Initially constrain definition fields stored as C++
`unsigned short` to `0..65535`, with positive dimensions/counts. Frame
references must be less than `frames`. Timed authored delays are `1..2147483647`
ms. Reject ambiguous alias pairs, invalid row shapes, unknown modes/options,
invalid facing values, empty tracks, and invalid palette components with a field
path. Allow hitboxes outside cell dimensions: existing fixtures deliberately use
them. Unknown top-level metadata may be ignored for compatibility; do not spread
it into internal objects.

Match C++'s case-insensitive top-level field lookup; canonical authoring types
use the lowercase spellings above. Reject conflicting case variants. Dimension
and hitbox object aliases use their documented lowercase spellings.

Text parsing must support `//` comments: the existing `.json` fixtures contain
them. Use a string-aware scanner that preserves newlines and ignores comment
markers inside quoted strings, then `JSON.parse`. Do not copy the C++
sanitizer's unconditional truncation at `//`. Block comments, trailing commas,
and JSON5 are not part of the initial contract. Object validation bypasses text
preprocessing.

### Animation encodings

Mode names are case-insensitive; normalize to the canonical spellings below.
Animation names and completion target names remain case-sensitive.

| Kind                           | Example row                                                      |
| ------------------------------ | ---------------------------------------------------------------- |
| Static scalar                  | `[14, "Static"]` or `["14", "Static"]`                           |
| Static boxed scalar            | `[[14], "Static"]` or `[["14"], "Static"]`                       |
| Static legacy frame/delay pair | `[[14, 30], "Static"]`; timing is ignored                        |
| VERGE timing string            | `["T70 2 3 T 150 4", "Looping"]`                                 |
| Explicit frame/delay pairs     | `[[[2, 70], [3, 150]], "Once"]`                                  |
| Explicit T/F instructions      | `[[["T", 70], ["F", 2], ["F", 3]], "BackAndForth"]`              |
| Random candidates              | `[100, [2, 3, 2], "Random"]`                                     |
| Static random candidates       | `[[1, 2, 3], "StaticRandom"]`                                    |
| Options                        | `[[[0, 10]], "Once", {"Facing": "down", "on_complete": "dead"}]` |

Timing strings accept `T`/`t`, attached or separate delay, repeated spaces, and
tabs. T/F arrays accept either letter case. Timing persists until another T.
Require a timing directive before the first timed frame, reject dangling T and
nonpositive delays, and retain repeated frames and repeated random candidates.
Static instructions normalize to the C++ sentinel delay `2147483647`, but their
playback never advances by time.

Options are a trailing object. `facing` and `direction` alias the same metadata;
option keys and direction values are case-insensitive. Reject conflicting
aliases. `on_complete` must be a nonempty existing key, is legal only on `Once`,
and must not form a cycle. Validate targets after parsing all tracks.

The current C++ parser rejects a timing-string row with options and a Random row
with options because of row-length checks. Preserve those restrictions
initially; use pair notation for timed animations needing options. Supporting
those extra combinations later is an explicit format extension, not assumed
parity.

### Atlas geometry

For zero-based frame `i`, cell size `(w, h)`, padding `(inner, outer)`, and
`cols`:

```text
x = outer + (i % cols) * (w + inner)
y = outer + floor(i / cols) * (h + inner)
source = { x, y, width: w, height: h }
```

After image decode, ensure every declared frame rectangle fits the actual atlas,
including partial final rows. Extra image pixels are allowed. An absent image or
out-of-bounds atlas is a load error; metadata-only parsing remains possible.
Keep authored dimensions unchanged when rendering at 2x or any other scale.

### Errors

Use a `CrustyError` with a stable `code`, message, optional JSON path/source
URL, and underlying `cause`. Codes distinguish syntax, validation, unknown
animation, numeric limit, fetch, image decode, atlas bounds, and disposed
resources. Preserve cancellation as an abort error. Throw/reject at the public
boundary; never log-and-continue with a partially initialized sprite. Failed
selection or replacement leaves the current player unchanged.

## 5. Playback contract

`SpriteDefinition` is shared, immutable data. Each `SpritePlayer` owns
independent playback state. The caller supplies elapsed milliseconds; the player
creates no timers and never reads wall-clock time.

| Mode           | Required behavior                                                                          |
| -------------- | ------------------------------------------------------------------------------------------ |
| `Static`       | Hold the first instruction indefinitely                                                    |
| `Looping`      | Repeat instructions in order                                                               |
| `BackAndForth` | For three instructions: `0,1,2,1,0,...`; no duplicated endpoints; one instruction is valid |
| `Once`         | Consume every dwell, including the final one; finish at the last frame                     |
| `StaticRandom` | Select one candidate on entry/restart and hold it indefinitely                             |
| `Random`       | Select one candidate on entry/restart, then reroll at every elapsed dwell boundary         |

Both random modes use an injected `randomIndex(count)` function, defaulting to a
uniform index from `Math.random`. Random makes one selection on entry and one
per elapsed dwell boundary; StaticRandom only selects on entry/restart. Each
Random reroll starts a new effective dwell using the authored common delay and
current speed. The same frame may be selected consecutively. Preserve duplicate
candidates as weighting, and consume a draw even for a single-candidate list. An
exact boundary rerolls; `advance(0)` at unchanged speed does not.

For example, `[100, [2, 3, 2], "Random"]` with injected choices `0, 1, 2, 1`
starts at frame 2. Advancing 250 ms selects frame 3 at 100 ms and frame 2 at 200
ms, leaving 50 ms until the next reroll. Advancing another 50 ms selects
frame 3. There have been four RNG calls including entry. Partitioning those
updates must produce the same choices and remaining dwell.

Tests inject exact choices and assert call counts. C++ and JS RNG sequences need
not match for the same seed. Validate injected RNG results as integers in
`[0, count)` before committing state. The C++ held-instruction Random getter
test is a documented intentional divergence, not an assertion to port unchanged.

Core rules:

- The initial frame is available immediately. Selecting the same definition/key
  preserves timing, selected random frame, and generation. Explicit restart
  resets state and rerolls both random modes. A new binding increments
  generation.
- Omitted animation names are accepted only when exactly one animation exists.
- An exact boundary advances: `delta == remainingMs` enters the next
  instruction.
- Effective dwell is `max(1, floor(authoredDelayMs / max(1, speed)))`. `75 ms`
  at speed `2` lasts `37 ms`. Never also multiply the incoming delta.
- Speed is a finite integer; values below `1` normalize to `1`. On a speed
  change, preserve already-consumed wall milliseconds of the current
  instruction, as C++ does. Shortening its dwell may immediately produce carry
  into following frames. Capture speed changes at partial dwells in explicit
  reference vectors.
- Paused players consume no time and generate no events, including for huge
  deltas. A standalone completed `Once` remains complete on later updates.
- Completion follows `on_complete` immediately, even at an exact final boundary.
  Carry remaining time through the finite chain. A terminal Static track is
  holding, not a completed Once; expose completion events separately from
  status.
- Return ordered completion records from `advance`; emit one per completed
  generation, including intermediate Once tracks. Avoid callbacks during state
  mutation. Rendering and frame getters must never advance time or consume RNG.
- Preserve the full elapsed delta. Skip whole periods arithmetically for looping
  and ping-pong, including cumulative step count and partial dwell. Random must
  consume every elapsed reroll in order, even during large updates; its cost is
  proportional to the number of boundaries crossed. Do not skip RNG calls or use
  an iteration cap that drops time. Applications can partition unusually large
  updates to yield between calls without changing the result.
- For a fixed speed and the same inputs, advancing `a+b` must equal `a` then `b`
  in frame, step, remaining dwell, completion records, and RNG consumption.

Use safe-integer JavaScript numbers for deltas, steps, generation, and
durations; check additions/products before state mutation. Reject
negative/fractional/nonfinite deltas and unsafe results atomically. This
deliberately excludes C++'s full `uint64_t` range; do not use JS bitwise
operators to emulate unsigned timing. The browser example accumulates fractional
`requestAnimationFrame` milliseconds, passes only whole milliseconds, and
retains the fractional remainder. Hidden-tab time policy belongs to the
application.

## 6. Loading and Canvas rendering

`loadSpriteDefinition(url, { fetch, resolveImage, signal })` fetches text,
validates it, and returns a definition plus resolved source URLs. Resolve a
relative image against the final JSON response URL (after redirects), never the
page URL or cwd. Default resolution uses URL semantics and normalizes authored
backslashes to `/`; applications may inject a resolver for virtual content
roots. Native Windows filenames require an explicit file adapter; portable core
code never reads them.

`loadCanvasSprite(url, options)` additionally fetches/decodes the image and
checks atlas bounds. Use `createImageBitmap` where available, with a lazy
browser image fallback that waits for decode. Check HTTP errors and aborts at
each stage. Dispose an image that finishes decoding after cancellation. Use
ordinary browser CORS rules; there is no `no-cors` workaround.

Return a reusable asset containing the definition and decoded atlas. Players
borrow assets; they never dispose them. The asset closes only resources it owns,
and `dispose()` is idempotent. A caller-supplied image remains caller-owned.
Drawing a disposed asset throws a clear error. Start with explicit caller
sharing and no global cache; this avoids inheriting Dredmor's mount/cache
semantics.

`drawSprite(context, asset, player, options)` verifies definition identity and
uses Canvas's nine-argument `drawImage` to sample the frame rectangle. Options:
position, positive scale, horizontal/vertical flip, rotation in radians,
opacity, and an explicit origin in cell pixels. Default origin is the top-left,
scale is 1, rotation is 0, opacity is 1, and image smoothing is disabled for
pixel art. Transforms act about the origin placed at `(x, y)`. Validate
nonfinite values; opacity must be in `[0,1]`. Save/restore context state with
`try/finally`, preserve the caller's transform/clip, and multiply its existing
alpha by sprite opacity.

Facing is metadata, not an automatic flip. Hitboxes are cell-local metadata, not
implicit draw offsets. Device-pixel-ratio sizing and clearing the canvas remain
application responsibilities. Draw directly from the atlas; avoid creating a
bitmap per frame or copying atlas pixels on every draw.

Proposed use (API sketch, not implemented code):

```ts
import { SpritePlayer } from "crustacean-sprite-lib";
import { drawSprite, loadCanvasSprite } from "crustacean-sprite-lib/canvas2d";

// Example module lives in examples/canvas2d/.
const asset = await loadCanvasSprite(
  new URL("../../assets/lord-stan/lord_stan.json", import.meta.url),
);
const player = new SpritePlayer(asset.definition, {
  animation: "valid_looping_1",
});

player.advance(16); // returns readonly completion records
drawSprite(context, asset, player, { x: 100, y: 80, scaleX: 2, scaleY: 2 });
player.select("Random_1"); // preserves progress if already selected
player.restart();
player.pause();
player.resume();
const state = player.snapshot(); // key, frame, step, remainingMs, status, generation
asset.dispose(); // only after every consumer has finished using this asset
```

`snapshot()` returns a readonly value, not a live mutable state object. Its
status is `playing`, `paused`, or `finished`; Static and StaticRandom remain
`playing` while holding their frame. `advance(deltaMs, speed = 1)` returns a
readonly array of `{ animation, generation, nextAnimation }` completion records,
where `nextAnimation` is absent if no transition occurs. The generation
identifies the completed track, not its successor. Selecting/restarting
preserves the caller's pause state.

Keep the first API small: parsing, loading, definition lookup, frame rectangle,
player selection/restart/advance/pause/resume/snapshot, drawing, and disposal.
Seeking, serialization, cross-fades, scene graphs, and event subscriptions can
be added separately. Dynamic JSON animation keys have type `string`;
declarations must not pretend arbitrary loaded keys are compile-time literals.

## 7. JavaScript output and TypeScript declarations

Use a single ESM build with generated `.d.ts` declarations under the package
name `crustacean-sprite-lib`. Publish to npm later, when requested by the user.
Node supports ESM, and Deno can consume npm packages directly. Keep the same API
and artifact in both runtimes; no CommonJS build or script-tag global is needed
for the stated targets. CommonJS applications can use dynamic `import()` when
necessary. [Node ESM](https://nodejs.org/api/esm.html),
[Deno npm support](https://docs.deno.com/runtime/fundamentals/node/).

JSR is the JavaScript Registry, a package registry that accepts TypeScript
source, generates API documentation, and serves Deno and npm-compatible
consumers. Its npm compatibility layer supplies transpiled JavaScript and types;
it is a separate registry from npm. JSR is optional for this project: begin with
npm distribution and consider publishing the same source to JSR later.
[JSR introduction](https://jsr.io/docs/introduction),
[JSR npm compatibility](https://jsr.io/docs/npm-compatibility).

Use Deno tasks to invoke a pinned TypeScript compiler (`npm:typescript`), with
ES2022 output, ESM, `module`/`moduleResolution: NodeNext`, strict checking,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, and `noEmitOnError`. Source imports use explicit
relative `.ts` extensions. Enable `rewriteRelativeImportExtensions` for emitted
JavaScript and verify every emitted import and declaration reference against the
packaged files. This compiler option rewrites relative TypeScript extensions in
JS output.
[TypeScript documentation](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html)

Generate `declaration`, `declarationMap`, and `sourceMap` from the
implementation; do not maintain a second handwritten public type surface.
Include source files needed by maps. Explicitly export all intended public
types. The declaration and declaration-map options provide type information and
source navigation.
[Declarations](https://www.typescriptlang.org/tsconfig/declaration.html),
[declaration maps](https://www.typescriptlang.org/tsconfig/declarationMap.html).

Proposed package metadata (name confirmed; version provisional):

```json
{
  "name": "crustacean-sprite-lib",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "types": "./dist/mod.d.ts",
  "exports": {
    ".": {
      "types": "./dist/mod.d.ts",
      "import": "./dist/mod.js"
    },
    "./load": {
      "types": "./dist/load.d.ts",
      "import": "./dist/load.js"
    },
    "./canvas2d": {
      "types": "./dist/canvas2d.d.ts",
      "import": "./dist/canvas2d.js"
    },
    "./assets/lord-stan/*": "./assets/lord-stan/*"
  },
  "files": [
    "dist",
    "src",
    "assets/lord-stan",
    "README.md",
    "LICENSE",
    "ASSET-ATTRIBUTION.md"
  ]
}
```

`exports` defines the public subpaths; place `types` first in each conditional
entry. Browser examples use relative built `.js` URLs or an import map. No TS
loader or Deno shim is required by a JavaScript consumer.
[Node package exports](https://nodejs.org/api/packages.html#package-entry-points),
[TypeScript module resolution](https://www.typescriptlang.org/docs/handbook/modules/reference.html#packagejson-exports).

Use separate type-check configurations for core (`ES2022`, no DOM), browser
adapters (DOM), and Deno tests. Ensure the root declaration graph has no DOM,
Deno, or Node-only types. Runtime dependencies should initially be zero; build,
assertion, and browser-driver packages are development dependencies.

Pin Deno and development dependencies in CI and commit the lockfile. Local Deno
was `2.9.5` with embedded TypeScript `6.0.3` at inspection; record exact chosen
versions during bootstrap rather than relying on machine globals. Make Deno 2
and Node 22/24 package checks part of the initial support matrix, pinning exact
versions in CI. Publishing is not part of this design task.

### License and shipped example asset

Use MIT for this library, with the full license in `LICENSE` and the SPDX value
in package metadata. The owner has authorized shipping Lord Stan. Include
`test/resources/atlas_sprites/parsing/lord_stan.json` and `lord_stan.png` from
the pinned Dredmor checkout under `assets/lord-stan/`, preserving their
filenames and the JSON's relative image reference. Include source paths,
revision, hashes, and existing attribution in `ASSET-ATTRIBUTION.md`; retain
upstream notices.

Keep that JSON unchanged, including comments and the existing animation names.
Use it in the browser example and package asset checks. The other Lord Stan
notation variants can supply test vectors, but only this JSON/PNG pair is the
shipped game asset. Synthetic atlases remain useful for precise edge-case tests.

## 8. Deno validation strategy

Use `Deno.test` and `@std/assert`, table-driven fixtures, deterministic random
choices, and explicit deltas. Never use real sleeps for animation assertions.
Deno's runner supports TypeScript and granular test permissions.
[Deno testing](https://docs.deno.com/runtime/test/).

### Port behavior, with traceability

Create a case inventory mapping each relevant C++ assertion group to a new Deno
case, or to a written exclusion. Port fixture values and expected outcomes; do
not derive expected values with the same algorithm being tested.

| C++ test source                                           | Deno coverage                                                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `test/atlas_sprite_test.cpp`                              | Notations, modes, boundaries, skipped frames and geometry; new Deno cases specify timed Random as an intentional difference |
| `test/crustacean-static-random-animation-test.cpp`        | Candidate parsing, sentinel delays, exact RNG calls, hold and reroll                                                        |
| `test/crustacean-playback-invariance-regression-test.cpp` | Uneven dwells, complete periods, elapsed partitions, completed Once stability                                               |
| `test/crusty-main-contract-regression-test.cpp`           | Exact 1 ms boundaries, initial frame, idempotent binding, speed quantization, transactional failure                         |
| `test/crusty-playback-feature-test.cpp`                   | Pause, explicit restart, chained completion and carry                                                                       |
| `test/crustacean-completion-transition-test.cpp`          | Completion targets, missing targets, cycles, final dwell and terminal Static                                                |
| `test/crusty-load-failure-test.cpp`                       | Missing/bad JSON and image, unknown key, sole-animation default                                                             |
| `test/crusty-structural-audit-regression-test.cpp`        | Malformed definitions and atlas validity                                                                                    |
| `test/crusty-test.cpp`, cache/background-loading tests    | Record exclusions or analogous ownership/cancellation cases; no claim of C++ cache/thread parity                            |

Port normalized metadata from
`test/resources/atlas_sprites/parsing/lord_stan*.json`, `static_random.json`,
and the palette fixture. The actual all-notation file is `lord_stan.json`; its
C++ test label calls it `lord_stan_1.json`. Retain provenance and content
hashes. Some old metadata fixtures need separate atlas-bounds expectations; do
not force every parser fixture to be a valid rendering asset. Ship the
authorized Lord Stan pair described above; use synthetic atlases for isolated
pixel tests.

Store reference vectors containing input, operations, expected frame/key/step,
remaining dwell, status, generation, and RNG calls. Mark evidence as
`source-assertion` or `executed-cpp`. Add a separate optional C++ trace exporter
to compare representative operations against the pinned implementation; it must
not modify existing tests. Capture its compiler, revision, command, and results.
Ordinary Deno CI uses checked-in vectors and never requires a Dredmor checkout
or rebuild. Do not label manually derived vectors as executed C++ parity.

Add new Random vectors for entry, exact-boundary rerolls, multiple boundaries in
one update, repeated choices, weighted duplicates, singleton candidates, pause,
restart, same-key selection, speed changes, and elapsed partitions. Record these
as library requirements rather than C++ parity. A large-delta test must count
every expected reroll and verify the residual dwell.

New JS-specific tests cover malformed `unknown` values, comments in strings,
unsafe integers, all row shapes, fractional-time accumulation, speed changes,
single-frame ping-pong, independent players sharing one definition, error paths,
URL resolution/redirects, abort during decode, and resource disposal. Test
arithmetic period skipping against a simple bounded reference stepper over many
deterministically generated small cases.

### Rendering and package tests

1. Deno unit tests exercise frame geometry and Canvas command/state handling
   with a recording context. This verifies the adapter's decisions, not browser
   pixels.
2. Deno integration tests drive a real headless browser over localhost. Render
   synthetic atlases with distinctive cells and padding; return raw RGBA to Deno
   assertions. Check crop, transparency, integer scaling, flips, origin,
   rotation, opacity, and state restoration. Compare exact pixels for
   deterministic cases; constrain fractional/rotated cases to appropriate
   geometric assertions.
3. Use the Playwright library as the proposed browser driver, with `Deno.test`
   owning the tests. Prove the pinned Deno/driver combination at bootstrap; this
   document does not assert that combination has been tested. Playwright exposes
   browser automation separately from its test runner.
   [Playwright library](https://playwright.dev/docs/library).
4. Check an actual staged package from an isolated consumer: plain JS ESM
   import, strict TS imports through package subpaths, negative type assertions,
   and relative browser imports from built JS. Test NodeNext and bundler type
   resolution. A required Deno test launches Node against the staged package to
   verify import, parsing, and playback of representative vectors. Exercise the
   same packaged entry points in Deno; the semantic test suite runs in Deno.
5. Check declarations with `skipLibCheck: false` and a core consumer without DOM
   types. Validate all package entries, emitted imports, and source-map targets;
   ensure test code and unrelated Dredmor assets do not enter the published file
   set. Assert that the Lord Stan JSON/PNG pair, MIT license, and attribution
   are included and that the JSON's image reference resolves inside the package.

Browser automation is a required rendering gate; recording-context tests alone
cannot prove Canvas output. The initial browser gate is pinned Chromium on CI,
with Firefox/WebKit smoke runs before claiming support for those browsers.

Proposed tasks, to be implemented rather than run against this empty repository:

| Task                      | Work                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `deno task check`         | Formatting, lint, core/browser type checks, test type checks                              |
| `deno task test`          | Pure/parser/player and mocked-loader Deno tests; no runtime I/O permissions               |
| `deno task test:fixtures` | Checked-in fixture/reference tests; read only `tests/fixtures` and `assets/lord-stan`     |
| `deno task build`         | Emit JS/declarations/maps and stage package in a new build directory                      |
| `deno task test:browser`  | Deno browser tests against built JS; explicit browser/process/cache/localhost permissions |
| `deno task test:package`  | Isolated JS and TS package consumer checks                                                |
| `deno task test:all`      | All required tests, including build prerequisites                                         |

Use explicit test directory lists so the default suite does not accidentally
discover browser tests requiring broader permissions. Browser tests must close
servers, contexts, and child processes in `finally`. Keep Deno resource/op leak
checks enabled. Provision dependencies/browser binaries in a separate setup
step; normal tests must not fetch production assets from the network.

Run core and package checks on Windows and Linux. CI runs check, test, fixtures,
build, browser, and package gates, and records the actual test count. A visual
review of the example complements automated evidence; it does not replace it.

## 9. Proposed repository layout

```text
IMPLEMENTATION.md
CRUSTACEAN-SPRITE-LIB-PLAN.md
deno.json
deno.lock
package.json
LICENSE
ASSET-ATTRIBUTION.md
tsconfig.build.json
tsconfig.core.json
src/
  mod.ts
  types.ts
  errors.ts
  parse.ts
  notation.ts
  atlas.ts
  player.ts
  load.ts
  canvas2d.ts
assets/lord-stan/
  lord_stan.json
  lord_stan.png
tests/
  unit/
  fixtures/          # synthetic assets, vectors, provenance
  conformance/
  browser/
  package/
scripts/
  build.ts
  check_package.ts
  export_cpp_traces/ # optional; independent of normal Deno CI
examples/canvas2d/
docs/compatibility.md
```

Build artifacts go into fresh task-owned staging directories, with `dist/`
inside the staged package. Do not use recursive clean/delete commands or remove
old artifacts without approval. Preserve existing unrelated repository files.

## 10. Completion criteria

- Every applicable C++ contract has a Deno test or an explicit, justified
  exclusion.
- All six modes, accepted notations, completion chains, and timing invariants
  pass.
- JSON plus PNG loads and renders correctly in the Canvas example from built JS.
- The shipped Lord Stan example, MIT license, and asset attribution are present
  in the staged package.
- Shared definitions do not share playback state; failures are recoverable and
  resources are released according to ownership.
- Built JS works without TypeScript tooling; TS consumers receive correct public
  declarations from each exported subpath.
- Deno unit, fixture, browser, and package gates pass on their declared
  platforms.
- Compatibility limitations, reference provenance, supported versions, and any
  unverified visual cases are documented. Existing tests remain untouched unless
  the human explicitly authorizes an edit.

# HUMAN QUESTIONS

Canvas 2D, timed Random rerolls, v2 palette replacement, Lord Stan distribution,
and MIT licensing are decided. ESM through npm is the confirmed packaging
approach for Deno and Node, with package name `crustacean-sprite-lib`.
Publication is deferred; no implementation questions remain open. Release-time
checks and optional JSR publication are recorded in
[the project plan](CRUSTACEAN-SPRITE-LIB-PLAN.md#human-questions).
