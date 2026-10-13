# Compatibility and evidence

Baseline: Dredmor `371bbfd5674f245437d215ebbc0ad639daf69a58`. The library is
independent of that checkout during builds and tests.

`tests/fixtures/provenance.json` contains SHA-256 hashes of 25 original source,
test and fixture blobs. `contract-inventory.json` maps every one of its 59
inspected assertion groups to new tests or explicit exclusions. The shipped Lord
Stan JSON/PNG pair is unchanged. Alternate Lord Stan metadata is deliberately
not a valid rendering atlas at 336×192; parsing and image validation are
separate.

`vectors.json` distinguishes source assertions from manually derived reference
operations. `executed-cpp.json` records five matching runtime traces from the
pinned, unchanged production animation-state implementation and a held Random
trace. This isolated C++ harness stubs Bob, logging, platform dialogs and RNG;
it verifies the production clock, **not** full Dredmor, parser, Bob completion,
SDL, or game RNG behavior. The ordinary suite replays these checked-in traces
without compiling C++.

Re-extraction is optional and read-only with respect to Dredmor:

```sh
deno run --allow-read --allow-write=tests/fixtures,assets/lord-stan --allow-run=git scripts/extract_reference.ts /path/to/dredmor
deno run --allow-read --allow-write=.build,tests/fixtures --allow-run scripts/export_cpp_traces/run.ts /path/to/dredmor clang++
```

The exporter accepts extra compiler arguments after the compiler path. Its
record includes the actual compiler version, command, source hashes and stubs.
It must use a compiler compatible with the installed standard library.

## Intentional differences

| Contract         | Library behavior                                                                                                       | Coverage                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Random           | Draw on entry/restart and every elapsed dwell boundary, including singleton candidates; duplicates retain their weight | Random unit tests and recorded held-C++ trace |
| Timing integers  | Safe JavaScript integers only; unsafe deltas, additions, products and steps throw atomically                           | Numeric/overflow unit cases                   |
| Errors           | Typed exceptions/rejections with field paths and source URLs, preserving abort errors                                  | Parser and loader tests                       |
| JSON comments    | `//` scanning respects quoted strings and escaped quotes                                                               | URL/string scanner test                       |
| Malformed inputs | Strict shapes, aliases, numeric limits, options, cycles and palette bytes                                              | Malformed parser table                        |
| Ownership        | Explicit shareable assets, idempotent disposal, late-decode cancellation cleanup                                       | Loader tests                                  |
| Enum ordinals    | Public string union modes                                                                                              | Strict package consumer                       |
| Rendering        | Canvas crop and transforms, smoothing disabled; facing/hitbox/palette are metadata                                     | Chromium pixel gate                           |

Player operations commit state only after validation succeeds. An externally
injected RNG can have its own side effects: failed operations preserve player
state but cannot undo RNG calls already made. Random updates cost one draw per
crossed boundary; partition very large Random updates when your application
needs to yield. Looping and BackAndForth skip complete periods arithmetically.

Timing-string and Random rows with options remain unsupported, matching the
inspected parser restriction. Pair notation supports completion options.

## Scope and acceptance

No implicit caching, worker threads, mod mounts, legacy conversion/playhead,
monster lifecycle, palette substitution, outlines or Dredmor 2x filtering are
implemented. These exclusions are explicit in the inventory. SDL golden-image
comparison is replaced by separate Canvas pixel assertions, not claimed as SDL
pixel parity. No existing Dredmor test was modified or run.

Support targets: Deno 2.9.5; Node 22.20.0 and 24.10.0; Chromium 141.0.7390.37
(Playwright 1.56.1, revision 1194). Firefox/WebKit support is unclaimed until
their smoke gates are run. CI covers Windows and Linux for both Node versions.
The Lord Stan example has automated load/render/control checks. Human visual
acceptance and npm publication are separate, deferred states.

## Verification recorded 2026-10-13

| Environment                                | Gate                                         | Result                                                           |
| ------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------- |
| Windows, Deno 2.9.5, Node 22.20.0          | `deno task test:all`                         | 78 passing tests: 69 unit, 7 conformance, 1 browser, 1 package   |
| Ubuntu 24.04 under WSL, same pinned tools  | `deno task test:all`                         | Same 78 tests pass                                               |
| Windows and Ubuntu, Node 24.10.0           | `deno task test:package`                     | Packed ESM/runtime and strict TS consumers pass                  |
| Windows, Clang 19.1.5 / MSVC 14.44 headers | Optional unchanged-production-state exporter | Five matching clock traces, plus recorded held Random divergence |

Linux browser verification used locally extracted `libnspr4`/`libnss3` in the
isolated validation directory. CI provisions system dependencies via Playwright
`--with-deps`. The example screenshot was inspected by the implementing agent;
it does not constitute human animation acceptance. GitHub CI is configured
separately from these local verification results; npm publication remains
deferred.

Follow-up: the example server now redirects `/` to the canonical HTML path so
relative module URLs resolve correctly. A new browser regression uses the actual
server handler at `/` and verifies all 22 animations load. Both Windows browser
tests and the static checks pass; the earlier 78-test result predates this added
regression. The subsequent Windows `deno task test:all` run passed all 79 tests.

## WebGL 2 follow-up

The `webgl` adapter shares definitions, players, draw options and browser image
decoding with Canvas. New tests cover exact RGBA output, fractional transforms,
ordered batching, queued-frame snapshots, shared-context state restoration,
ImageBitmap/HTMLImage alpha and orientation, resource failures/disposal, late
decodes and explicit context restoration without I/O. Existing tests are
unchanged.

`deno task test:all` passes 86 tests on Windows and Ubuntu 24.04 under WSL: 69
unit, 7 conformance, 8 browser and 2 package tests. Node 22/24 consumers receive
the new subpath and generated types. GL tests use pinned Chromium with software
rendering; they do not establish GPU performance or other-browser support. See
[the WebGL plan](../WEBGL-RENDERER-PLAN.md) for API contracts and implementation
evidence.
