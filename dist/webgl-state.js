export function captureTextureState(gl) {
    const active = gl.getParameter(gl.ACTIVE_TEXTURE);
    gl.activeTexture(gl.TEXTURE0);
    try {
        return {
            active,
            texture: gl.getParameter(gl.TEXTURE_BINDING_2D),
            sampler: gl.getParameter(gl.SAMPLER_BINDING),
            unpackBuffer: gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING),
            unpack: [
                gl.UNPACK_ALIGNMENT,
                gl.UNPACK_FLIP_Y_WEBGL,
                gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
                gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
                gl.UNPACK_ROW_LENGTH,
                gl.UNPACK_IMAGE_HEIGHT,
                gl.UNPACK_SKIP_PIXELS,
                gl.UNPACK_SKIP_ROWS,
                gl.UNPACK_SKIP_IMAGES,
            ].map((key) => [key, gl.getParameter(key)]),
        };
    }
    finally {
        gl.activeTexture(active);
    }
}
export function restoreTextureState(gl, s) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.texture);
    gl.bindSampler(0, s.sampler);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, s.unpackBuffer);
    for (const [key, value] of s.unpack)
        gl.pixelStorei(key, value);
    gl.activeTexture(s.active);
}
export function captureFrameState(gl) {
    const framebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    let canvasDrawBuffer;
    try {
        canvasDrawBuffer = gl.getParameter(gl.DRAW_BUFFER0);
    }
    finally {
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
    }
    return {
        texture: captureTextureState(gl),
        framebuffer,
        canvasDrawBuffer,
        program: gl.getParameter(gl.CURRENT_PROGRAM),
        vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
        buffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
        viewport: gl.getParameter(gl.VIEWPORT),
        colorMask: gl.getParameter(gl.COLOR_WRITEMASK),
        clearColor: gl.getParameter(gl.COLOR_CLEAR_VALUE),
        blend: [
            gl.BLEND_SRC_RGB,
            gl.BLEND_DST_RGB,
            gl.BLEND_SRC_ALPHA,
            gl.BLEND_DST_ALPHA,
            gl.BLEND_EQUATION_RGB,
            gl.BLEND_EQUATION_ALPHA,
        ].map((key) => gl.getParameter(key)),
        enables: [
            gl.BLEND,
            gl.CULL_FACE,
            gl.DEPTH_TEST,
            gl.STENCIL_TEST,
            gl.SCISSOR_TEST,
            gl.RASTERIZER_DISCARD,
            gl.POLYGON_OFFSET_FILL,
            gl.SAMPLE_ALPHA_TO_COVERAGE,
            gl.SAMPLE_COVERAGE,
            gl.DITHER,
        ].map((key) => [key, gl.isEnabled(key)]),
    };
}
export function restoreFrameState(gl, s) {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.drawBuffers([s.canvasDrawBuffer]);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s.framebuffer);
    gl.useProgram(s.program);
    gl.bindVertexArray(s.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.buffer);
    gl.viewport(s.viewport[0], s.viewport[1], s.viewport[2], s.viewport[3]);
    gl.colorMask(s.colorMask[0], s.colorMask[1], s.colorMask[2], s.colorMask[3]);
    gl.clearColor(s.clearColor[0], s.clearColor[1], s.clearColor[2], s.clearColor[3]);
    gl.blendFuncSeparate(s.blend[0], s.blend[1], s.blend[2], s.blend[3]);
    gl.blendEquationSeparate(s.blend[4], s.blend[5]);
    for (const [key, enabled] of s.enables) {
        if (enabled)
            gl.enable(key);
        else
            gl.disable(key);
    }
    restoreTextureState(gl, s.texture);
}
//# sourceMappingURL=webgl-state.js.map