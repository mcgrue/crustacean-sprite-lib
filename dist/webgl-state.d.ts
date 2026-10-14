/** State touched by uploads and sprite frames, including texture unit zero. */
export interface TextureState {
    active: number;
    texture: WebGLTexture | null;
    sampler: WebGLSampler | null;
    unpackBuffer: WebGLBuffer | null;
    unpack: readonly (readonly [number, number | boolean])[];
}
export declare function captureTextureState(gl: WebGL2RenderingContext): TextureState;
export declare function restoreTextureState(gl: WebGL2RenderingContext, s: TextureState): void;
export interface FrameState {
    texture: TextureState;
    framebuffer: WebGLFramebuffer | null;
    program: WebGLProgram | null;
    vao: WebGLVertexArrayObject | null;
    buffer: WebGLBuffer | null;
    viewport: Int32Array;
    colorMask: boolean[];
    clearColor: Float32Array;
    blend: number[];
    enables: readonly (readonly [number, boolean])[];
    canvasDrawBuffer: number;
}
export declare function captureFrameState(gl: WebGL2RenderingContext): FrameState;
export declare function restoreFrameState(gl: WebGL2RenderingContext, s: FrameState): void;
//# sourceMappingURL=webgl-state.d.ts.map