import type { SpriteDefinition } from "./types.js";
export type RandomIndex = (count: number) => number;
export interface PlayerOptions {
    animation?: string;
    randomIndex?: RandomIndex;
}
export interface CompletionRecord {
    readonly animation: string;
    readonly generation: number;
    readonly nextAnimation?: string;
}
export interface PlayerSnapshot {
    readonly key: string;
    readonly frame: number;
    readonly step: number;
    readonly remainingMs: number;
    readonly status: "playing" | "paused" | "finished";
    readonly generation: number;
}
/** Independent clock driven only by explicit integer elapsed milliseconds. */
export declare class SpritePlayer {
    #private;
    constructor(definition: SpriteDefinition, options?: PlayerOptions);
    get definition(): SpriteDefinition;
    get frame(): number;
    /** An identical key/definition binding is idempotent; a different binding starts a generation. */
    select(name?: string, definition?: SpriteDefinition): void;
    restart(): void;
    pause(): void;
    resume(): void;
    snapshot(): PlayerSnapshot;
    advance(deltaMs: number, speed?: number): readonly CompletionRecord[];
}
//# sourceMappingURL=player.d.ts.map