import { assertEquals } from "@std/assert";
import { compareDist } from "../../scripts/dist_inventory.ts";

Deno.test("distribution gate accepts identical bytes independent of map order", () => {
  const a = new Map([["dist/mod.js", new Uint8Array([1, 2])], [
    "dist/mod.d.ts",
    new Uint8Array([3]),
  ]]);
  const b = new Map([["dist/mod.d.ts", new Uint8Array([3])], [
    "dist/mod.js",
    new Uint8Array([1, 2]),
  ]]);
  assertEquals(compareDist(a, b), []);
});
Deno.test("distribution gate catches changed, missing and obsolete artifacts", () => {
  const generated = new Map([["dist/mod.js", new Uint8Array([1, 2])], [
    "dist/new.d.ts",
    new Uint8Array([3]),
  ]]);
  const recorded = new Map([["dist/mod.js", new Uint8Array([1, 4])], [
    "dist/removed.js",
    new Uint8Array([5]),
  ]]);
  assertEquals(compareDist(generated, recorded), [
    "Extra artifact: dist/removed.js",
    "Missing artifact: dist/new.d.ts",
    "Stale artifact: dist/mod.js",
  ]);
  assertEquals(
    compareDist(
      new Map([["a", new Uint8Array([1])]]),
      new Map([["a", new Uint8Array([1, 2])]]),
    ),
    ["Stale artifact: a"],
  );
});
