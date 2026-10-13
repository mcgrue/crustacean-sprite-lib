import { assertEquals, assertThrows } from "@std/assert";
import { CrustyError, SpritePlayer } from "../../src/mod.ts";
import { definition } from "./helpers.ts";

Deno.test("initial frame, one-ms boundaries, and independent clocks", () => {
  const d = definition({ a: [[[0, 1], [1, 1], [2, 1]], "Looping"] });
  const p = new SpritePlayer(d);
  const other = new SpritePlayer(d);
  assertEquals(p.frame, 0);
  for (const frame of [1, 2, 0]) {
    p.advance(1);
    assertEquals(p.frame, frame);
  }
  assertEquals(p.snapshot().step, 3);
  assertEquals(other.frame, 0);
});
Deno.test("uneven periods preserve partial dwell and cumulative step", () => {
  const p = new SpritePlayer(definition());
  p.advance(10);
  p.advance(23);
  assertEquals(p.snapshot(), {
    key: "a",
    frame: 1,
    step: 4,
    remainingMs: 2,
    status: "playing",
    generation: 1,
  });
});
for (const mode of ["Looping", "BackAndForth", "Once"] as const) {
  Deno.test(`${mode} elapsed partitions and bounded reference stepper`, () => {
    for (let count = 1; count <= 5; count++) {
      const delays = Array.from(
        { length: count },
        (_, i) => 1 + (i * 7 + count * 3) % 11,
      );
      const d = definition({ a: [delays.map((delay, i) => [i, delay]), mode] });
      for (let speed = 1; speed <= 3; speed++) {
        for (let total = 0; total < 160; total += 7) {
          const whole = new SpritePlayer(d);
          whole.advance(total, speed);
          let step = 0;
          let left = Math.max(1, Math.floor(delays[0]! / speed));
          let rest = total;
          const frameAt = () => {
            if (mode === "Once") return Math.min(step, count - 1);
            if (mode === "Looping" || count === 1) return step % count;
            const phase = step % (2 * count - 2);
            return phase < count ? phase : 2 * count - 2 - phase;
          };
          while (rest >= left) {
            rest -= left;
            step++;
            if (mode === "Once" && step === count) {
              left = 0;
              rest = 0;
              break;
            }
            left = Math.max(1, Math.floor(delays[frameAt()]! / speed));
          }
          assertEquals(whole.snapshot().frame, frameAt());
          assertEquals(whole.snapshot().step, step);
          assertEquals(whole.snapshot().remainingMs, left - rest);
          for (let split = 0; split <= total; split += 3) {
            const p = new SpritePlayer(d);
            const events = [
              ...p.advance(split, speed),
              ...p.advance(total - split, speed),
            ];
            const reference = new SpritePlayer(d);
            const expectedEvents = reference.advance(total, speed);
            assertEquals(p.snapshot(), whole.snapshot());
            assertEquals(events, expectedEvents);
          }
        }
      }
    }
  });
}
Deno.test("speed quantization and consumed-wall-time carry", () => {
  const p = new SpritePlayer(
    definition({ a: [[[0, 75], [1, 75], [2, 75]], "Looping"] }),
  );
  p.advance(37, 2);
  assertEquals(p.frame, 1);
  assertEquals(p.snapshot().remainingMs, 37);
  const q = new SpritePlayer(p.definition);
  q.advance(60);
  q.advance(0, 2);
  assertEquals(q.snapshot().frame, 1);
  assertEquals(q.snapshot().remainingMs, 14);
  q.advance(0, 1);
  assertEquals(q.snapshot().remainingMs, 52);
  const r = new SpritePlayer(p.definition);
  r.advance(37);
  r.advance(0, 2);
  assertEquals(r.frame, 1);
  const s = new SpritePlayer(p.definition);
  s.advance(75, -1);
  assertEquals(s.frame, 1);
});
Deno.test("final dwell, completion chain, carry and terminal hold", () => {
  const d = definition({
    dying: [[[0, 5], [1, 7]], "Once", { on_complete: "last" }],
    last: [[[2, 3]], "Once", { on_complete: "dead" }],
    dead: [2, "Static"],
  });
  const p = new SpritePlayer(d, { animation: "dying" });
  assertEquals(p.advance(11), []);
  assertEquals(p.frame, 1);
  assertEquals(p.advance(4), [{
    animation: "dying",
    generation: 1,
    nextAnimation: "last",
  }, { animation: "last", generation: 2, nextAnimation: "dead" }]);
  assertEquals(p.snapshot().key, "dead");
  assertEquals(p.snapshot().status, "playing");
  p.advance(Number.MAX_SAFE_INTEGER);
  assertEquals(p.frame, 2);
  const q = new SpritePlayer(d, { animation: "dying" });
  q.advance(12);
  assertEquals(q.snapshot().key, "last");
  assertEquals(q.snapshot().remainingMs, 3);
  const single = new SpritePlayer(
    definition({ a: [[[0, 5], [1, 7], [2, 11]], "Once"] }),
  );
  assertEquals(single.advance(23), [{ animation: "a", generation: 1 }]);
  const finished = single.snapshot();
  assertEquals(single.advance(200), []);
  assertEquals(single.advance(0), []);
  assertEquals(single.snapshot(), finished);
});
Deno.test("idempotent binding, restart, pause and recoverable selection", () => {
  const d = definition();
  const p = new SpritePlayer(d);
  p.advance(3);
  const before = p.snapshot();
  p.select("a");
  assertEquals(p.snapshot(), before);
  assertThrows(() => p.select("missing"), CrustyError);
  assertEquals(p.snapshot(), before);
  p.pause();
  const paused = p.snapshot();
  p.advance(Number.MAX_SAFE_INTEGER, 100);
  assertEquals(p.snapshot(), paused);
  p.restart();
  assertEquals(p.snapshot().status, "paused");
  assertEquals(p.snapshot().generation, 2);
  p.resume();
  p.select("a", definition());
  assertEquals(p.snapshot().generation, 3);
  assertThrows(
    () => new SpritePlayer(definition({ a: [0, "Static"], b: [1, "Static"] })),
    CrustyError,
  );
});
Deno.test("Random exact draw counts, duplicates, residual dwell and partitions", () => {
  const d = definition({ a: [100, [2, 3, 2], "Random"] });
  for (const parts of [[300], [250, 50], [0, 100, 100, 50, 50]]) {
    let calls = 0;
    const choices = [0, 1, 2, 1];
    const p = new SpritePlayer(d, {
      randomIndex: (n) => {
        assertEquals(n, 3);
        return choices[calls++]!;
      },
    });
    for (const part of parts) p.advance(part);
    assertEquals(calls, 4);
    assertEquals(p.frame, 3);
    assertEquals(p.snapshot().remainingMs, 100);
    assertEquals(p.snapshot().step, 3);
    p.select("a");
    p.frame;
    p.snapshot();
    p.advance(0);
    assertEquals(calls, 4);
  }
  let calls = 0;
  const p = new SpritePlayer(d, {
    randomIndex: () => {
      calls++;
      return 0;
    },
  });
  p.advance(250);
  assertEquals(p.snapshot().remainingMs, 50);
  p.advance(0, 2);
  assertEquals(calls, 4);
  p.pause();
  p.advance(1000);
  assertEquals(calls, 4);
  p.restart();
  assertEquals(calls, 5);
});
Deno.test("single-candidate Random draws every boundary; StaticRandom holds", () => {
  let calls = 0;
  const rng = () => {
    calls++;
    return 0;
  };
  const p = new SpritePlayer(definition({ a: [3, [2], "Random"] }), {
    randomIndex: rng,
  });
  p.advance(300001);
  assertEquals(calls, 100001);
  assertEquals(p.snapshot().remainingMs, 2);
  const q = new SpritePlayer(definition({ a: [[4, 8], "StaticRandom"] }), {
    randomIndex: rng,
  });
  const before = calls;
  q.advance(Number.MAX_SAFE_INTEGER);
  q.select("a");
  assertEquals(calls, before);
  q.restart();
  assertEquals(calls, before + 1);
});
Deno.test("invalid RNG and numeric updates leave state unchanged", () => {
  let result = 0;
  const p = new SpritePlayer(definition({ a: [1, [0, 1], "Random"] }), {
    randomIndex: () => result,
  });
  const before = p.snapshot();
  result = 2;
  assertThrows(() => p.advance(1), CrustyError);
  assertEquals(p.snapshot(), before);
  assertThrows(() => p.restart(), CrustyError);
  assertEquals(p.snapshot(), before);
  for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assertThrows(() => p.advance(value), CrustyError);
    assertThrows(() => p.advance(0, value === -1 ? 0.5 : value), CrustyError);
    assertEquals(p.snapshot(), before);
  }
  const q = new SpritePlayer(definition({ a: [[[0, 1]], "Looping"] }));
  q.advance(Number.MAX_SAFE_INTEGER);
  assertEquals(q.snapshot().step, Number.MAX_SAFE_INTEGER);
  const large = q.snapshot();
  assertThrows(() => q.advance(1), CrustyError);
  assertEquals(q.snapshot(), large);
});

Deno.test("completion records and generations are invariant through every chain partition", () => {
  const d = definition({
    a: [[[0, 5], [1, 7]], "Once", { on_complete: "b" }],
    b: [[[2, 3]], "Once", { on_complete: "c" }],
    c: [[[3, 2]], "Looping"],
  });
  const whole = new SpritePlayer(d, { animation: "a" });
  const expected = whole.advance(31);
  for (let split = 0; split <= 31; split++) {
    const p = new SpritePlayer(d, { animation: "a" });
    assertEquals([...p.advance(split), ...p.advance(31 - split)], expected);
    assertEquals(p.snapshot(), whole.snapshot());
  }
});
