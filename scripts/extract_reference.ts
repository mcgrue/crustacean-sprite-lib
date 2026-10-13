/** One-time read-only baseline extraction. Not needed for CI or ordinary builds. */
const repository = Deno.args[0] ?? "D:/dev/breadbros/dredmor";
const revision = "371bbfd5674f245437d215ebbc0ad639daf69a58";
const sourceFiles = [
  "src/sprite.cpp",
  "src/sprite_crustacean.h",
  "src/sprite_crustacean_data.h",
  "src/sprite_crustacean_state.cpp",
  "src/sprite_crustacean_state.h",
  "src/bob.cpp",
  "src/Include/tracery/tracery.cpp",
  "src/legacy_sprite_parity_audit.cpp",
];
const tests = [
  "atlas_sprite_test.cpp",
  "crustacean-static-random-animation-test.cpp",
  "crustacean-playback-invariance-regression-test.cpp",
  "crusty-main-contract-regression-test.cpp",
  "crusty-playback-feature-test.cpp",
  "crustacean-completion-transition-test.cpp",
  "crusty-load-failure-test.cpp",
  "crusty-structural-audit-regression-test.cpp",
  "crusty-test.cpp",
  "crusty-cache-provenance-red-test.cpp",
  "crusty-background-loading-regression-test.cpp",
];
const fixtureFiles = [
  "test/resources/atlas_sprites/parsing/lord_stan.json",
  "test/resources/atlas_sprites/parsing/lord_stan.png",
  "test/resources/atlas_sprites/parsing/lord_stan_2.json",
  "test/resources/atlas_sprites/parsing/lord_stan_3.json",
  "test/resources/atlas_sprites/parsing/static_random.json",
  "test/resources/atlas_sprites/parsing_palette/hero_atk_axe_d.spr.json",
];
const hashes: Record<string, string> = {};
const inventory: { source: string; assertion: string }[] = [];
await Deno.mkdir("tests/fixtures", { recursive: true });
await Deno.mkdir("assets/lord-stan", { recursive: true });
for (
  const path of [
    ...sourceFiles,
    ...tests.map((t) => `test/${t}`),
    ...fixtureFiles,
  ]
) {
  const result = await new Deno.Command("git", {
    args: ["-C", repository, "show", `${revision}:${path}`],
  }).output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
  const hash = await crypto.subtle.digest("SHA-256", result.stdout);
  hashes[path] = Array.from(
    new Uint8Array(hash),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  if (fixtureFiles.includes(path)) {
    const name = path.split("/").at(-1)!;
    const destination = name === "lord_stan.json" || name === "lord_stan.png"
      ? `assets/lord-stan/${name}`
      : `tests/fixtures/${name}`;
    await Deno.writeFile(destination, result.stdout);
  }
  if (path.startsWith("test/") && path.endsWith(".cpp")) {
    const text = new TextDecoder().decode(result.stdout);
    for (const match of text.matchAll(/TEST_CASE\(\s*"([^"]+)"/g)) {
      inventory.push({ source: path, assertion: match[1]! });
    }
  }
}
await Deno.writeTextFile(
  "tests/fixtures/provenance.json",
  JSON.stringify(
    {
      revision,
      evidence: "source-assertion",
      extracted: "2026-10-13",
      algorithm: "SHA-256",
      hashes,
      inventory,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Recorded ${
    Object.keys(hashes).length
  } baseline hashes and ${inventory.length} assertion groups`,
);
