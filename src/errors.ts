export type CrustyErrorCode =
  | "syntax"
  | "validation"
  | "unknown-animation"
  | "numeric-limit"
  | "fetch"
  | "image-decode"
  | "atlas-bounds"
  | "context-lost"
  | "gpu"
  | "disposed";

export class CrustyError extends Error {
  constructor(
    public readonly code: CrustyErrorCode,
    message: string,
    public readonly path?: string,
    public readonly sourceUrl?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CrustyError";
  }
}

export function safeInteger(value: number, label: string, min = 0): number {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new CrustyError(
      "numeric-limit",
      `${label} must be a safe integer >= ${min}`,
      label,
    );
  }
  return value;
}
