# Crustacean Sprite Library Plan

Design: [IMPLEMENTATION.md](IMPLEMENTATION.md). Status: P0-P5 implemented;
automated Windows/Linux acceptance gates pass. Publication and human visual
acceptance remain separate, deferred states.

Implementation evidence and intentional differences:
[docs/compatibility.md](docs/compatibility.md). Reproducible tasks are in
`deno.json`; the repository includes the authorized Lord Stan fixture pair.

Native TypeScript, compiled JavaScript with generated public declarations, Deno
tests, and browser Canvas 2D rendering are the agreed requirements.

## Decisions recorded 2026-10-13

- Random selects on entry/restart and rerolls at every elapsed dwell boundary.
  This intentionally differs from the inspected C++ held-instruction behavior.
- Support Deno and Node. Confirmed: ESM JavaScript plus generated `.d.ts` files
  through npm; Deno can use that package directly. CommonJS/UMD builds are
  unnecessary for v1.
- Package name: `crustacean-sprite-lib`. Publication is deferred until requested
  by the user; implementation and local package validation can proceed.
- JSR means JavaScript Registry: TypeScript source publishing, generated API
  documentation, and Deno/npm-compatible consumption. It is optional after npm.
- Palette replacement belongs in v2. Ignore outlines and Dredmor's special 2x
  scaling filter; continue parsing palette metadata in v1.
- Ship the test fixture `lord_stan.json` and its PNG atlas. Use MIT for the
  library and retain fixture provenance and attribution.

## Milestones

| Milestone                | Work                                                                                                                              | Validation / exit criterion                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| P0: Bootstrap            | Pin tools; configure core/browser/test type environments; add ESM build and declaration emission; prove Deno browser-driver setup | A tiny exported API imports as built JS and type-checks through its package; a Deno test launches a browser and reads one Canvas pixel    |
| P1: Freeze contracts     | Inventory applicable C++ cases, hash baseline sources, create small fixtures and expected vectors, document deviations            | Every inspected contract is mapped; source-derived and executed reference evidence are labeled separately                                 |
| P2: Parse and geometry   | Implement comment handling, all supported row forms, options, validation, atlas rectangles, typed errors                          | Parser/geometry tests pass, including malformed data and partial atlas rows                                                               |
| P3: Playback             | Implement independent players, modes, deterministic RNG injection, timing, speed changes, pause, binding and completion           | Boundary, partition, carry, restart, timed-reroll and safe-integer tests pass; C++ traces agree except documented intentional differences |
| P4: Load and render      | Implement async loading, URL resolution, decode/cancellation, ownership, Canvas draw, Lord Stan example                           | Deno loader tests and real-browser pixel tests pass; shipped Lord Stan example works from built JS                                        |
| P5: Package and document | Finish Deno/Node package consumers, exports/type/map checks, CI, MIT license and asset attribution                                | Windows/Linux gates pass; JS and strict TS consumers work; artifact includes the Lord Stan pair and license                               |

P0 precedes P1-P4. P2 precedes P3 and P4; P5 closes all acceptance gates. Keep
behavior tests small and deterministic. Add new tests for new features; ask
before modifying any pre-existing test. Do not change Dredmor during this
planning task. Future reference extraction must preserve unrelated changes and
avoid modifying existing C++ tests.

## Evidence and scope

Implementation verification, 2026-10-13:

- Deno 2.9.5: `deno task test:all` passes on Windows and Ubuntu 24.04 under WSL
  with Node 22.20.0: 69 unit tests, 7 conformance tests, 1 Chromium integration
  test and 1 packed-package integration test (78 total).
- Node 24.10.0: packed-package integration also passes on Windows and Linux.
- TypeScript 5.9.3: strict core without DOM, browser adapters, NodeNext and
  Bundler consumers, declarations, export paths and map targets pass.
- Playwright 1.56.1 / Chromium 141.0.7390.37: exact crop/scale/flip/rotation/alpha
  pixels, context restoration, Image fallback, Lord Stan loading/example controls
  and fractional animation time pass. The example screenshot was inspected by
  the implementing agent; human animation acceptance is not claimed.
- Five isolated production C++ playback traces match. SHA-256 provenance,
  integration stubs, source-derived vectors and 59 assertion-group mappings are
  checked in. This is not a full Dredmor runtime/SDL parity claim.
- Windows/Linux CI matrix is configured for both pinned Node versions; remote
  CI is separate from these local verification results. No package was published.

The following bullets preserve the original planning-time snapshot:

- Inspected Dredmor source and assertions at
  `371bbfd5674f245437d215ebbc0ad639daf69a58` on 2026-10-13.
- Current repository initially contained only a tracked README plus unrelated
  untracked tool directories. Preserve them.
- No C++ or library runtime tests were run for this documentation task.
- Implementation, test success, browser visual review, and publication are
  separate states. Nothing in this plan claims they are already complete.

# HUMAN QUESTIONS

None open for implementation. The user confirmed ESM/npm packaging and the
package name `crustacean-sprite-lib`, and deferred publication.

When publication is requested, check registry name availability and ownership.
JSR remains optional for a later release; it does not block the npm package.

See
[IMPLEMENTATION.md](IMPLEMENTATION.md#7-javascript-output-and-typescript-declarations)
for the packaging rationale and official documentation links. No package has
been published, and the fixture/license files will be added during
implementation.
