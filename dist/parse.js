import { CrustyError } from "./errors.js";
const SENTINEL = 2147483647;
const modes = [
    "Static",
    "Looping",
    "BackAndForth",
    "Once",
    "Random",
    "StaticRandom",
];
function fail(path, message) {
    throw new CrustyError("validation", `${path}: ${message}`, path);
}
function object(value, path) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        fail(path, "expected object");
    }
    return value;
}
function int(value, path, min = 0, max = 65535) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min ||
        value > max)
        fail(path, `expected integer ${min}..${max}`);
    return value;
}
function string(value, path) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(path, "expected nonempty string");
    }
    return value;
}
function folded(value, path) {
    const result = Object.create(null);
    for (const [key, v] of Object.entries(value)) {
        const lower = key.toLowerCase();
        if (Object.hasOwn(result, lower)) {
            fail(`${path}.${key}`, "conflicting case variants");
        }
        result[lower] = v;
    }
    return result;
}
function alias(o, a, b, path) {
    if (Object.hasOwn(o, a) && Object.hasOwn(o, b)) {
        fail(path, `ambiguous ${a}/${b}`);
    }
    return Object.hasOwn(o, a) ? o[a] : o[b];
}
function geometry(value, path, hitbox = false) {
    const len = hitbox ? 4 : 2;
    let values;
    if (Array.isArray(value)) {
        if (value.length !== len)
            fail(path, `expected ${len} values`);
        values = value;
    }
    else {
        const o = object(value, path);
        values = [
            alias(o, "w", "width", `${path}.width`),
            alias(o, "h", "height", `${path}.height`),
        ];
        if (hitbox)
            values.unshift(o.x, o.y);
    }
    return values.map((v, i) => int(v, `${path}[${i}]`, hitbox && i < 2 ? 0 : 1));
}
function animation(name, value, frames) {
    const path = `$.animations[${JSON.stringify(name)}]`;
    if (!Array.isArray(value))
        fail(path, "expected row");
    const row = [...value];
    let facing;
    let onComplete;
    let hasOptions = false;
    const last = row.at(-1);
    if (last !== null && typeof last === "object" && !Array.isArray(last)) {
        hasOptions = true;
        row.pop();
        const options = folded(object(last, `${path}.options`), `${path}.options`);
        for (const key of Object.keys(options)) {
            if (!["facing", "direction", "on_complete"].includes(key)) {
                fail(`${path}.options.${key}`, "unknown option");
            }
        }
        const direction = alias(options, "facing", "direction", `${path}.options.facing`);
        if (direction !== undefined) {
            const s = string(direction, `${path}.options.facing`).toLowerCase();
            if (!["up", "down", "left", "right"].includes(s)) {
                fail(`${path}.options.facing`, "invalid direction");
            }
            facing = s;
        }
        else if (Object.hasOwn(options, "facing") || Object.hasOwn(options, "direction"))
            fail(`${path}.options.facing`, "invalid direction");
        if (Object.hasOwn(options, "on_complete")) {
            onComplete = string(options.on_complete, `${path}.options.on_complete`);
        }
    }
    const modeName = string(row.at(-1), `${path}.mode`).toLowerCase();
    const mode = modes.find((m) => m.toLowerCase() === modeName);
    if (!mode)
        fail(`${path}.mode`, "unknown mode");
    if (row.length !== (mode === "Random" ? 3 : 2)) {
        fail(path, "invalid row length");
    }
    if (hasOptions &&
        (mode === "Random" || (typeof row[0] === "string" && mode !== "Static")))
        fail(path, "options unsupported in this notation");
    if (onComplete !== undefined && mode !== "Once") {
        fail(`${path}.options.on_complete`, "only valid on Once");
    }
    const frame = (v, p = path) => int(v, p, 0, frames - 1);
    const delay = (v) => int(v, `${path}.delay`, 1, SENTINEL);
    const out = [];
    const add = (f, d, p = path) => out.push(Object.freeze({ frame: frame(f, p), delayMs: d }));
    const body = row[0];
    if (mode === "Static") {
        let f = body;
        if (Array.isArray(body)) {
            if (body.length < 1 || body.length > 2)
                fail(path, "invalid static body");
            if (body.length === 2)
                int(body[1], `${path}.ignoredDelay`, 0, SENTINEL);
            f = body[0];
        }
        if (typeof f === "string") {
            if (!/^\d+$/.test(f.trim()))
                fail(path, "invalid static frame");
            f = Number(f.trim());
        }
        add(f, SENTINEL);
    }
    else if (mode === "Random" || mode === "StaticRandom") {
        const candidates = mode === "Random" ? row[1] : body;
        const d = mode === "Random" ? delay(body) : SENTINEL;
        if (!Array.isArray(candidates) || !candidates.length) {
            fail(path, "empty candidates");
        }
        candidates.forEach((f, i) => add(f, d, `${path}.candidates[${i}]`));
    }
    else if (typeof body === "string") {
        const tokens = body.trim().split(/\s+/);
        let d;
        let pending = false;
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (/^t/i.test(token)) {
                const n = token.length === 1 ? tokens[++i] : token.slice(1);
                if (!n || !/^\d+$/.test(n))
                    fail(path, "invalid T directive");
                d = delay(Number(n));
                pending = true;
            }
            else {
                if (!/^\d+$/.test(token) || d === undefined) {
                    fail(path, "frame requires prior timing directive");
                }
                add(Number(token), d);
                pending = false;
            }
        }
        if (pending)
            fail(path, "dangling T directive");
    }
    else if (Array.isArray(body)) {
        let d;
        let pending = false;
        let kind;
        for (const [i, item] of body.entries()) {
            if (!Array.isArray(item) || item.length !== 2) {
                fail(`${path}[${i}]`, "expected pair");
            }
            const nextKind = typeof item[0] === "string" ? "directives" : "pairs";
            if (kind && kind !== nextKind) {
                fail(path, "mixed pair and directive notation");
            }
            kind = nextKind;
            if (nextKind === "pairs")
                add(item[0], delay(item[1]));
            else {
                const letter = item[0].toLowerCase();
                if (letter === "t") {
                    d = delay(item[1]);
                    pending = true;
                }
                else if (letter === "f" && d !== undefined) {
                    add(item[1], d);
                    pending = false;
                }
                else
                    fail(path, "invalid directive or missing timing");
            }
        }
        if (pending)
            fail(path, "dangling T directive");
    }
    else
        fail(path, "invalid body");
    if (!out.length)
        fail(path, "empty track");
    return Object.freeze({
        name,
        mode,
        instructions: Object.freeze(out),
        ...(facing === undefined ? {} : { facing }),
        ...(onComplete === undefined ? {} : { onComplete }),
    });
}
/** Validate unknown data and copy it into a deeply frozen definition. */
export function validateCrusty(value) {
    const o = folded(object(value, "$"), "$");
    if (o.version !== 1)
        fail("$.version", "unsupported or missing version");
    const image = string(o.image, "$.image");
    const [width, height] = geometry(o.dims, "$.dims");
    const [x, y, w, h] = geometry(o.hitbox, "$.hitbox", true);
    const frames = int(o.frames, "$.frames", 1);
    const perRow = int(o.per_row, "$.per_row", 1);
    const innerPad = int(o.inner_pad, "$.inner_pad");
    const outerPad = int(o.outer_pad, "$.outer_pad");
    const rows = object(o.animations, "$.animations");
    if (!Object.keys(rows).length)
        fail("$.animations", "empty animations");
    const animations = Object.create(null);
    for (const [name, row] of Object.entries(rows)) {
        string(name, "$.animations.key");
        animations[name] = animation(name, row, frames);
    }
    for (const a of Object.values(animations)) {
        const visited = new Set([a.name]);
        let next = a.onComplete;
        while (next !== undefined) {
            if (!Object.hasOwn(animations, next)) {
                fail(`$.animations[${JSON.stringify(a.name)}].on_complete`, "missing target");
            }
            if (visited.has(next)) {
                fail(`$.animations[${JSON.stringify(a.name)}].on_complete`, "cyclic completion chain");
            }
            visited.add(next);
            next = animations[next].onComplete;
        }
    }
    let palette;
    if (Object.hasOwn(o, "original_image_palette")) {
        const p = o.original_image_palette;
        if (!Array.isArray(p) || !p.length) {
            fail("$.original_image_palette", "expected nonempty palette");
        }
        palette = Object.freeze(p.map((rgb, i) => {
            const path = `$.original_image_palette[${i}]`;
            if (!Array.isArray(rgb) || rgb.length !== 3) {
                fail(path, "expected RGB triple");
            }
            return Object.freeze(rgb.map((v, j) => int(v, `${path}[${j}]`, 0, 255)));
        }));
    }
    return Object.freeze({
        version: 1,
        image,
        width,
        height,
        hitbox: Object.freeze({ x, y, width: w, height: h }),
        frames,
        perRow,
        innerPad,
        outerPad,
        animations: Object.freeze(animations),
        ...(palette === undefined ? {} : { palette }),
    });
}
/** Parse JSON with string-aware // comment handling; other JSON extensions are rejected. */
export function parseCrusty(text) {
    let stripped = "";
    let quoted = false;
    let escaped = false;
    let comment = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (comment) {
            if (c === "\n" || c === "\r") {
                comment = false;
                stripped += c;
            }
            else
                stripped += " ";
        }
        else if (quoted) {
            stripped += c;
            if (escaped)
                escaped = false;
            else if (c === "\\")
                escaped = true;
            else if (c === '"')
                quoted = false;
        }
        else if (c === "/" && text[i + 1] === "/") {
            comment = true;
            stripped += " ";
        }
        else {
            stripped += c;
            if (c === '"')
                quoted = true;
        }
    }
    let value;
    try {
        value = JSON.parse(stripped);
    }
    catch (cause) {
        throw new CrustyError("syntax", "Invalid Crusty JSON", "$", undefined, {
            cause,
        });
    }
    return validateCrusty(value);
}
//# sourceMappingURL=parse.js.map