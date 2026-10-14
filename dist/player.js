import { CrustyError, safeInteger } from "./errors.js";
function dwell(instruction, speed) {
    return Math.max(1, Math.floor(instruction.delayMs / speed));
}
function index(s) {
    const n = s.animation.instructions.length;
    switch (s.animation.mode) {
        case "Static":
            return 0;
        case "StaticRandom":
        case "Random":
            return s.random;
        case "Once":
            return Math.min(s.step, n - 1);
        case "Looping":
            return s.step % n;
        case "BackAndForth": {
            if (n === 1)
                return 0;
            const phase = s.step % (2 * n - 2);
            return phase < n ? phase : 2 * n - 2 - phase;
        }
    }
}
function instruction(s) {
    return s.animation.instructions[index(s)];
}
function lookup(definition, name) {
    const keys = Object.keys(definition.animations);
    const key = name ?? (keys.length === 1 ? keys[0] : undefined);
    if (key === undefined || !Object.hasOwn(definition.animations, key)) {
        throw new CrustyError("unknown-animation", `Unknown or ambiguous animation: ${key ?? "<omitted>"}`);
    }
    return definition.animations[key];
}
/** Independent clock driven only by explicit integer elapsed milliseconds. */
export class SpritePlayer {
    #state;
    #paused = false;
    #rng;
    constructor(definition, options = {}) {
        this.#rng = options.randomIndex ??
            ((count) => Math.floor(Math.random() * count));
        this.#state = this.#entry(definition, lookup(definition, options.animation), 1);
    }
    get definition() {
        return this.#state.definition;
    }
    get frame() {
        return instruction(this.#state).frame;
    }
    #roll(animation) {
        const n = animation.instructions.length;
        const selected = this.#rng(n);
        if (!Number.isInteger(selected) || selected < 0 || selected >= n) {
            throw new CrustyError("validation", "randomIndex returned an invalid candidate index", "randomIndex");
        }
        return selected;
    }
    #entry(definition, animation, generation, speed = 1) {
        safeInteger(generation, "generation", 1);
        const s = {
            definition,
            animation,
            generation,
            step: 0,
            remainingMs: 0,
            speed,
            random: 0,
            finished: false,
        };
        if (animation.mode === "Random" || animation.mode === "StaticRandom") {
            s.random = this.#roll(animation);
        }
        s.remainingMs = dwell(instruction(s), speed);
        return s;
    }
    /** An identical key/definition binding is idempotent; a different binding starts a generation. */
    select(name, definition = this.definition) {
        const animation = lookup(definition, name);
        if (definition === this.definition && animation === this.#state.animation) {
            return;
        }
        this.#state = this.#entry(definition, animation, safeInteger(this.#state.generation + 1, "generation"));
    }
    restart() {
        this.#state = this.#entry(this.definition, this.#state.animation, safeInteger(this.#state.generation + 1, "generation"));
    }
    pause() {
        this.#paused = true;
    }
    resume() {
        this.#paused = false;
    }
    snapshot() {
        const s = this.#state;
        return Object.freeze({
            key: s.animation.name,
            frame: this.frame,
            step: s.step,
            remainingMs: s.remainingMs,
            status: this.#paused ? "paused" : s.finished ? "finished" : "playing",
            generation: s.generation,
        });
    }
    advance(deltaMs, speed = 1) {
        safeInteger(deltaMs, "deltaMs");
        if (!Number.isSafeInteger(speed)) {
            throw new CrustyError("numeric-limit", "speed must be a finite safe integer", "speed");
        }
        speed = Math.max(1, speed);
        if (this.#paused || this.#state.finished)
            return Object.freeze([]);
        let s = { ...this.#state };
        let remaining = deltaMs;
        const events = [];
        const holding = () => s.animation.mode === "Static" || s.animation.mode === "StaticRandom";
        if (holding())
            return Object.freeze(events);
        if (s.speed !== speed) {
            const consumed = dwell(instruction(s), s.speed) - s.remainingMs;
            const duration = dwell(instruction(s), speed);
            remaining = safeInteger(remaining + Math.max(0, consumed - duration), "elapsed carry");
            s.remainingMs = Math.max(0, duration - consumed);
            s.speed = speed;
        }
        while (!s.finished && !holding()) {
            const mode = s.animation.mode;
            if ((mode === "Looping" || mode === "BackAndForth") && s.remainingMs > 0) {
                const n = s.animation.instructions.length;
                const periodSteps = mode === "Looping" || n === 1 ? n : 2 * n - 2;
                let period = 0;
                for (const [i, ins] of s.animation.instructions.entries()) {
                    period = safeInteger(period +
                        dwell(ins, speed) *
                            (mode === "BackAndForth" && i > 0 && i < n - 1 ? 2 : 1), "period", 1);
                }
                const cycles = Math.floor(remaining / period);
                if (cycles) {
                    s.step = safeInteger(s.step + safeInteger(cycles * periodSteps, "cycle steps"), "step");
                    remaining %= period;
                }
            }
            else if (mode === "Random") {
                // Preflight all resulting steps before consuming any boundary RNG draws.
                const boundaries = remaining < s.remainingMs ? 0 : 1 +
                    Math.floor((remaining - s.remainingMs) / dwell(instruction(s), speed));
                safeInteger(s.step + boundaries, "step");
            }
            if (remaining < s.remainingMs) {
                s.remainingMs -= remaining;
                break;
            }
            remaining -= s.remainingMs;
            s.step = safeInteger(s.step + 1, "step");
            if (mode === "Once" && s.step === s.animation.instructions.length) {
                s.finished = true;
                s.remainingMs = 0;
                const next = s.animation.onComplete;
                events.push(Object.freeze({
                    animation: s.animation.name,
                    generation: s.generation,
                    ...(next === undefined ? {} : { nextAnimation: next }),
                }));
                if (next === undefined)
                    break;
                s = this.#entry(s.definition, lookup(s.definition, next), safeInteger(s.generation + 1, "generation"), speed);
            }
            else {
                if (mode === "Random")
                    s.random = this.#roll(s.animation);
                s.remainingMs = dwell(instruction(s), speed);
            }
        }
        this.#state = s;
        return Object.freeze(events);
    }
}
//# sourceMappingURL=player.js.map