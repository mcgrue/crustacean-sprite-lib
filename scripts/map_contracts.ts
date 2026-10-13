/** Explicit coverage/exclusions for each inspected C++ assertion group. */
const baseline = JSON.parse(
  await Deno.readTextFile("tests/fixtures/provenance.json"),
);
const inventory = baseline.inventory.map(
  (item: { source: string; assertion: string }) => {
    const { source, assertion } = item;
    let coverage: string[] = [];
    let exclusion: string | undefined;
    let deviation: string | undefined;
    if (source.includes("atlas_sprite_test")) {
      if (assertion.startsWith("images_are_equal")) {
        exclusion =
          "C++ test-helper image comparator/bit-depth normalization; not a public library API. Chromium pixel assertions cover library rendering.";
      } else if (
        assertion.startsWith("lord_stan") || assertion.startsWith("hero_atk")
      ) {
        coverage = [
          "tests/conformance/reference_test.ts:Lord Stan/alternate metadata/palette fixtures",
          "tests/browser/canvas_test.ts:Chromium crop and transform pixels",
        ];
        exclusion =
          "SDL renderer golden output, outlines, palette replacement and special 2x filter are outside v1; Canvas pixel output tested independently.";
      } else if (/timing|whitespace|tabs/.test(assertion)) {
        coverage = [
          "tests/unit/parse_test.ts:timed notation",
          "tests/conformance/reference_test.ts:Lord Stan all notation metadata",
        ];
      } else if (assertion === "Random") {
        coverage = [
          "tests/unit/player_test.ts:Random exact draw counts, duplicates, residual dwell and partitions",
        ];
        deviation =
          "Timed Random selects on entry and rerolls at each boundary; C++ holds its first instruction.";
      } else if (assertion.startsWith("load fails")) {
        coverage = ["tests/unit/parse_test.ts:reject row 3 with field path"];
      } else {coverage = [
          "tests/unit/player_test.ts:initial frame, one-ms boundaries; bounded reference stepper; final dwell; single-candidate Random/StaticRandom hold",
        ];}
    } else if (source.includes("static-random-animation")) {
      coverage = [
        "tests/conformance/reference_test.ts:StaticRandom and palette fixtures",
        "tests/unit/player_test.ts:single-candidate Random draws every boundary; StaticRandom holds",
      ];
      if (assertion.includes("bookshelf")) {
        exclusion =
          "Dredmor bookshelf asset/caller adoption is outside this standalone library; candidate parsing/selection/hold are covered.";
      }
    } else if (source.includes("playback-invariance")) {
      coverage = [
        "tests/unit/player_test.ts:uneven periods; elapsed partitions and bounded reference stepper; speed quantization; final dwell",
      ];
    } else if (source.includes("main-contract")) {
      if (assertion.includes("legacy delta")) {
        exclusion =
          "Legacy Bob playhead is not implemented. Library large safe-integer deltas are covered by invalid RNG and numeric updates leave state unchanged.";
      } else {coverage = [
          "tests/unit/player_test.ts:initial frame; independent clocks; idempotent binding; speed quantization; invalid numeric updates",
          "tests/unit/load_test.ts:HTTP, network, syntax and decoder failures",
        ];}
      if (assertion.includes("monster roles")) {
        exclusion =
          "Monster role lifecycle is outside v1; independent players and named selections are covered.";
      }
    } else if (source.includes("playback-feature")) {
      if (assertion.includes("enum values")) {
        exclusion =
          "Public string modes deliberately do not expose legacy C++ enum ordinals.";
      } else {coverage = [
          "tests/unit/player_test.ts:idempotent binding, restart, pause; final dwell, completion chain, carry and terminal hold",
        ];}
    } else if (source.includes("completion-transition")) {
      coverage = [
        "tests/unit/parse_test.ts:completion targets/options and reject cycle",
        "tests/unit/player_test.ts:final dwell, completion chain, carry and terminal hold",
      ];
    } else if (source.includes("load-failure")) {
      coverage = [
        "tests/unit/load_test.ts:HTTP, network, syntax and decoder failures",
        "tests/unit/player_test.ts:idempotent binding and recoverable selection",
      ];
      deviation =
        "Failures throw typed CrustyError rather than returning null/falling back to game assets.";
    } else if (source.includes("structural-audit")) {
      coverage = [
        "tests/unit/parse_test.ts:malformed data and atlas bounds",
        "tests/unit/load_test.ts:atlas bounds failure releases decoded resource",
      ];
      exclusion =
        "Game filesystem inventory traversal is outside standalone metadata validation.";
    } else if (source.includes("background-loading")) {
      coverage = [
        "tests/unit/load_test.ts:abort before fetch and during decode",
        "tests/browser/canvas_test.ts:built JS loading",
      ];
      exclusion =
        "SDL renderer queues, GPU frame upload and C++ worker-thread/scaling parity are outside the Canvas adapter.";
    } else if (
      source.includes("cache-provenance") || source.endsWith("crusty-test.cpp")
    ) {
      exclusion =
        "No implicit cache, mod mounts or filename/scalefactor singleton registry. Each load owns its result; callers can explicitly share assets.";
    } else throw new Error(`Unmapped ${source}: ${assertion}`);
    return {
      ...item,
      ...(coverage.length ? { coverage } : {}),
      ...(exclusion ? { exclusion } : {}),
      ...(deviation ? { deviation } : {}),
    };
  },
);
await Deno.writeTextFile(
  "tests/fixtures/contract-inventory.json",
  JSON.stringify(inventory, null, 2) + "\n",
);
console.log(`Mapped ${inventory.length} C++ assertion groups`);
