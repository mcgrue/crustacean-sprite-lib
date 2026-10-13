# Crustacean Sprite Library Plan

Design: [IMPLEMENTATION.md](IMPLEMENTATION.md). Status: design prepared;
implementation milestones have not started.

Native TypeScript, compiled JavaScript with generated public declarations, Deno
tests, and browser Canvas 2D rendering are the agreed requirements.

## Milestones

| Milestone                | Work                                                                                                                              | Validation / exit criterion                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| P0: Bootstrap            | Pin tools; configure core/browser/test type environments; add ESM build and declaration emission; prove Deno browser-driver setup | A tiny exported API imports as built JS and type-checks through its package; a Deno test launches a browser and reads one Canvas pixel |
| P1: Freeze contracts     | Inventory applicable C++ cases, hash baseline sources, create small fixtures and expected vectors, document deviations            | Every inspected contract is mapped; source-derived and executed reference evidence are labeled separately                              |
| P2: Parse and geometry   | Implement comment handling, all supported row forms, options, validation, atlas rectangles, typed errors                          | Parser/geometry tests pass, including malformed data and partial atlas rows                                                            |
| P3: Playback             | Implement independent players, modes, deterministic RNG injection, timing, speed changes, pause, binding and completion           | Boundary, partition, carry, restart, Random-quirk and safe-integer tests pass; representative C++ traces agree where captured          |
| P4: Load and render      | Implement async loading, URL resolution, decode/cancellation, ownership, Canvas draw, example                                     | Deno loader tests and real-browser pixel tests pass; example works from built JS                                                       |
| P5: Package and document | Finish isolated package consumers, exports/type/map checks, CI, compatibility notes and usage                                     | Declared Windows/Linux gates pass; plain JS and strict TS consumers work; release artifact contains only intended files                |

P0 precedes P1-P4. P2 precedes P3 and P4; P5 closes all acceptance gates. Keep
behavior tests small and deterministic. Add new tests for new features; ask
before modifying any pre-existing test. Do not change Dredmor during this
planning task. Future reference extraction must preserve unrelated changes and
avoid modifying existing C++ tests.

## Evidence and scope

- Inspected Dredmor source and assertions at
  `371bbfd5674f245437d215ebbc0ad639daf69a58` on 2026-10-13.
- Current repository initially contained only a tracked README plus unrelated
  untracked tool directories. Preserve them.
- No C++ or library runtime tests were run for this documentation task.
- Implementation, test success, browser visual review, and publication are
  separate states. Nothing in this plan claims they are already complete.

# HUMAN QUESTIONS

These defaults permit implementation planning to proceed. Resolve only the
relevant decision before making a release commitment.

| Question                                                                                  | Working default                                                                                            | Decision needed by                       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Should `Random` retain current C++ behavior or become a timed reroll?                     | Retain the current first-candidate/held-instruction behavior; any reroll behavior is an explicit extension | Before P3 contract freeze if changing it |
| Is CommonJS `require()` or a script-tag global required?                                  | ESM only; browser module scripts and npm-compatible consumers                                              | Before P0 packaging work if required     |
| Should the package also publish to JSR, and under which scope/name?                       | Build a local npm-compatible `crustacean-sprite-lib` artifact; no publication yet                          | Before publication                       |
| Are palette replacement, outlines, or Dredmor's smooth 2x filter required for v1?         | Parse palette metadata; render original atlas pixels with nearest-neighbor scaling                         | Before P4 if expanding scope             |
| May game artwork/fixtures ship with the library, and what license should the library use? | Use synthetic distributable images, keep game assets local, and leave license selection to the owner       | Before distributing a release            |

Confirmed: prioritize browser Canvas 2D, with parser and playback independent of
the renderer.
