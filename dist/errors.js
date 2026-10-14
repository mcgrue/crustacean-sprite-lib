export class CrustyError extends Error {
    code;
    path;
    sourceUrl;
    constructor(code, message, path, sourceUrl, options) {
        super(message, options);
        this.code = code;
        this.path = path;
        this.sourceUrl = sourceUrl;
        this.name = "CrustyError";
    }
}
export function safeInteger(value, label, min = 0) {
    if (!Number.isSafeInteger(value) || value < min) {
        throw new CrustyError("numeric-limit", `${label} must be a safe integer >= ${min}`, label);
    }
    return value;
}
//# sourceMappingURL=errors.js.map