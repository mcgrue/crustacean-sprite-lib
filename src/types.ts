export type AnimationMode =
  | "Static"
  | "Looping"
  | "BackAndForth"
  | "Once"
  | "Random"
  | "StaticRandom";
export type Facing = "up" | "down" | "left" | "right";
export interface Instruction {
  readonly frame: number;
  readonly delayMs: number;
}
export interface Animation {
  readonly name: string;
  readonly mode: AnimationMode;
  readonly instructions: readonly Instruction[];
  readonly facing?: Facing;
  readonly onComplete?: string;
}
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface DrawOptions {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  flipX?: boolean;
  flipY?: boolean;
  rotation?: number;
  opacity?: number;
  originX?: number;
  originY?: number;
}
export interface SpriteDefinition {
  readonly version: 1;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  readonly hitbox: Rect;
  readonly frames: number;
  readonly perRow: number;
  readonly innerPad: number;
  readonly outerPad: number;
  readonly palette?: readonly (readonly [number, number, number])[];
  readonly animations: Readonly<Record<string, Animation>>;
}
export type StaticBody =
  | number
  | string
  | readonly [number | string]
  | readonly [number, number];
export type TimedBody =
  | string
  | readonly (readonly [number, number])[]
  | readonly (readonly ["T" | "t" | "F" | "f", number])[];
export interface AuthoringOptions {
  facing?: Facing;
  direction?: Facing;
  on_complete?: string;
}
export type AnimationRow =
  | readonly [StaticBody, "Static", AuthoringOptions?]
  | readonly [TimedBody, "Looping" | "BackAndForth" | "Once", AuthoringOptions?]
  | readonly [number, readonly number[], "Random"]
  | readonly [readonly number[], "StaticRandom", AuthoringOptions?];
export interface CrustyV1 {
  version: 1;
  image: string;
  dims: readonly [number, number] | {
    w?: number;
    width?: number;
    h?: number;
    height?: number;
  };
  hitbox: readonly [number, number, number, number] | {
    x: number;
    y: number;
    w?: number;
    width?: number;
    h?: number;
    height?: number;
  };
  frames: number;
  per_row: number;
  inner_pad: number;
  outer_pad: number;
  animations: Record<string, AnimationRow>;
  original_image_palette?: readonly (readonly [number, number, number])[];
}
