import { frameRect, validateAtlas } from "./atlas.js";
import { decodeBrowserImage } from "./browser-image.js";
import { CrustyError } from "./errors.js";
import { checkAbort, fetchResource, loadSpriteDefinition } from "./load.js";
import { captureFrameState, captureTextureState, restoreFrameState, restoreTextureState, } from "./webgl-state.js";
const VERTEX = `#version 300 es
layout(location=0) in vec2 position;
layout(location=1) in vec2 uv;
layout(location=2) in float opacity;
uniform vec2 view;
out vec2 texCoord;
out float alpha;
void main() {
  gl_Position = vec4(position.x / view.x * 2.0 - 1.0, 1.0 - position.y / view.y * 2.0, 0.0, 1.0);
  texCoord = uv;
  alpha = opacity;
}`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D atlas;
in vec2 texCoord;
in float alpha;
out vec4 color;
void main() {
  vec4 sampleColor = texture(atlas, texCoord);
  float a = sampleColor.a * alpha;
  color = vec4(sampleColor.rgb * a, a);
}`;
function invalid(message, path) {
    throw new CrustyError("validation", message, path);
}
function gpuError(message, cause) {
    throw new CrustyError("gpu", message, undefined, undefined, { cause });
}
function dimension(value, name) {
    if (!Number.isFinite(value) || value <= 0 ||
        !Number.isFinite(Math.fround(value)) || Math.fround(value) === 0)
        invalid(`${name} must be a positive GPU-representable number`, name);
}
/** WebGL 2 ordered sprite batching. Caller supplies the context and animation clock. */
export class WebGLSpriteRenderer {
    #gl;
    #gpu;
    #disposed = false;
    #lost = false;
    #epoch = 0;
    #assets = new Map();
    #frame;
    #queue = [];
    #queuedAssets = new Set();
    #onLost = () => {
        if (this.#lost || this.#disposed)
            return;
        this.#lost = true;
        this.#epoch++;
        this.#frame = undefined;
        this.#queue = [];
        this.#queuedAssets.clear();
        this.#gpu = undefined;
        for (const asset of this.#assets.values())
            asset.texture = null;
    };
    constructor(gl) {
        if (!gl || typeof gl.createVertexArray !== "function") {
            invalid("A WebGL 2 context is required", "gl");
        }
        this.#gl = gl;
        const attributes = gl.getContextAttributes();
        if (attributes?.alpha && !attributes.premultipliedAlpha) {
            invalid("Transparent WebGL contexts require premultipliedAlpha: true", "gl");
        }
        if (gl.isContextLost()) {
            throw new CrustyError("context-lost", "WebGL context is lost");
        }
        this.#gpu = this.#createGPU();
        gl.canvas.addEventListener("webglcontextlost", this.#onLost);
    }
    get disposed() {
        return this.#disposed;
    }
    /** True until explicit restore(), even after the browser restores the context. */
    get contextLost() {
        if (!this.#disposed && this.#gl.isContextLost())
            this.#onLost();
        return this.#lost;
    }
    #guard() {
        if (this.#disposed) {
            throw new CrustyError("disposed", "WebGL renderer has been disposed");
        }
        if (this.contextLost) {
            throw new CrustyError("context-lost", "WebGL renderer needs context restoration");
        }
    }
    #checkGPU() {
        this.#guard();
        const error = this.#gl.getError();
        if (error !== this.#gl.NO_ERROR) {
            gpuError(`WebGL operation failed (0x${error.toString(16)})`);
        }
    }
    #createGPU() {
        const gl = this.#gl;
        if (gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE)) {
            invalid("GPU setup requires inactive transform feedback");
        }
        const saved = captureFrameState(gl);
        const shaders = [];
        let program = null;
        let vao = null;
        let buffer = null;
        try {
            for (const [type, text] of [[gl.VERTEX_SHADER, VERTEX], [
                    gl.FRAGMENT_SHADER,
                    FRAGMENT,
                ]]) {
                const shader = gl.createShader(type);
                if (!shader)
                    gpuError("Cannot allocate sprite shader");
                shaders.push(shader);
                gl.shaderSource(shader, text);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    gpuError(gl.getShaderInfoLog(shader) ?? "Sprite shader compile failed");
                }
            }
            program = gl.createProgram();
            vao = gl.createVertexArray();
            buffer = gl.createBuffer();
            if (!program || !vao || !buffer) {
                gpuError("Cannot allocate sprite renderer resources");
            }
            for (const shader of shaders)
                gl.attachShader(program, shader);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                gpuError(gl.getProgramInfoLog(program) ?? "Sprite shader link failed");
            }
            const view = gl.getUniformLocation(program, "view");
            const atlas = gl.getUniformLocation(program, "atlas");
            if (!view || !atlas)
                gpuError("Missing sprite uniforms");
            gl.useProgram(program);
            gl.uniform1i(atlas, 0);
            gl.bindVertexArray(vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            for (const [index, size, offset] of [[0, 2, 0], [1, 2, 8], [2, 1, 16]]) {
                gl.enableVertexAttribArray(index);
                gl.vertexAttribPointer(index, size, gl.FLOAT, false, 20, offset);
            }
            if (gl.isContextLost()) {
                throw new CrustyError("context-lost", "Context lost during GPU setup");
            }
            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                gpuError(`GPU setup failed (0x${error.toString(16)})`);
            }
            return { program, vao, buffer, view };
        }
        catch (cause) {
            if (program)
                gl.deleteProgram(program);
            if (vao)
                gl.deleteVertexArray(vao);
            if (buffer)
                gl.deleteBuffer(buffer);
            if (cause instanceof CrustyError)
                throw cause;
            return gpuError("GPU setup failed", cause);
        }
        finally {
            for (const shader of shaders)
                gl.deleteShader(shader);
            if (!gl.isContextLost())
                restoreFrameState(gl, saved);
        }
    }
    #upload(decoded) {
        const gl = this.#gl;
        if (decoded.width > gl.getParameter(gl.MAX_TEXTURE_SIZE) ||
            decoded.height > gl.getParameter(gl.MAX_TEXTURE_SIZE))
            gpuError("Atlas exceeds MAX_TEXTURE_SIZE");
        const saved = captureTextureState(gl);
        const texture = gl.createTexture();
        if (!texture)
            gpuError("Cannot allocate atlas texture");
        try {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.bindSampler(0, null);
            gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
            for (const key of [
                gl.UNPACK_ROW_LENGTH,
                gl.UNPACK_IMAGE_HEIGHT,
                gl.UNPACK_SKIP_PIXELS,
                gl.UNPACK_SKIP_ROWS,
                gl.UNPACK_SKIP_IMAGES,
            ])
                gl.pixelStorei(key, 0);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, decoded.image);
            if (gl.isContextLost()) {
                this.#onLost();
                throw new CrustyError("context-lost", "Context lost during texture upload");
            }
            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                gpuError(`Atlas upload failed (0x${error.toString(16)})`);
            }
            return texture;
        }
        catch (cause) {
            gl.deleteTexture(texture);
            if (cause instanceof CrustyError)
                throw cause;
            return gpuError("Atlas upload failed", cause);
        }
        finally {
            if (!gl.isContextLost())
                restoreTextureState(gl, saved);
        }
    }
    async loadSprite(url, options = {}) {
        this.#guard();
        const epoch = this.#epoch;
        const loaded = await loadSpriteDefinition(url, options);
        const response = await fetchResource(loaded.imageUrl, options);
        let blob;
        try {
            blob = await response.blob();
            checkAbort(options.signal);
        }
        catch (cause) {
            checkAbort(options.signal);
            if (cause instanceof Error && cause.name === "AbortError")
                throw cause;
            throw new CrustyError("fetch", "Failed reading atlas", undefined, loaded.imageUrl, { cause });
        }
        let decoded;
        try {
            decoded = await (options.decodeImage ?? ((b, signal) => decodeBrowserImage(b, signal, {
                premultiplyAlpha: "none",
                imageOrientation: "none",
                colorSpaceConversion: "none",
            })))(blob, options.signal);
        }
        catch (cause) {
            checkAbort(options.signal);
            if (cause instanceof Error && cause.name === "AbortError")
                throw cause;
            throw new CrustyError("image-decode", "Failed decoding atlas", undefined, loaded.imageUrl, { cause });
        }
        let texture;
        try {
            checkAbort(options.signal);
            this.#guard();
            if (epoch !== this.#epoch) {
                throw new CrustyError("context-lost", "Context changed during sprite loading");
            }
            validateAtlas(loaded.definition, decoded.width, decoded.height);
            texture = this.#upload(decoded);
            const asset = {
                handle: undefined,
                decoded,
                texture,
                disposed: false,
            };
            asset.handle = Object.freeze({
                ...loaded,
                get disposed() {
                    return asset.disposed;
                },
                dispose: () => this.#disposeAsset(asset),
            });
            this.#assets.set(asset.handle, asset);
            return asset.handle;
        }
        catch (cause) {
            if (texture)
                this.#gl.deleteTexture(texture);
            decoded.close?.();
            throw cause;
        }
    }
    #disposeAsset(asset) {
        if (asset.disposed)
            return;
        if (this.#queuedAssets.has(asset)) {
            invalid("Cannot dispose an asset queued in the active frame");
        }
        asset.disposed = true;
        this.#assets.delete(asset.handle);
        if (asset.texture)
            this.#gl.deleteTexture(asset.texture);
        asset.texture = null;
        const decoded = asset.decoded;
        asset.decoded = undefined;
        decoded?.close?.();
    }
    beginFrame(options) {
        this.#guard();
        if (this.#frame)
            invalid("A WebGL frame is already active");
        if (this.#gl.getParameter(this.#gl.TRANSFORM_FEEDBACK_ACTIVE)) {
            invalid("Sprite frames require inactive transform feedback");
        }
        dimension(options.width, "width");
        dimension(options.height, "height");
        if (options.clearColor !== undefined &&
            (options.clearColor.length !== 4 ||
                options.clearColor.some((v) => !Number.isFinite(v) || v < 0 || v > 1)))
            invalid("clearColor must be normalized RGBA", "clearColor");
        const gl = this.#gl;
        const saved = captureFrameState(gl);
        const gpu = this.#gpu;
        try {
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
            gl.drawBuffers([gl.BACK]);
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            for (const [key] of saved.enables)
                gl.disable(key);
            gl.enable(gl.BLEND);
            gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
            gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.colorMask(true, true, true, true);
            gl.useProgram(gpu.program);
            gl.bindVertexArray(gpu.vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, gpu.buffer);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindSampler(0, null);
            gl.uniform2f(gpu.view, options.width, options.height);
            if (options.clearColor) {
                const [r, g, b, a] = options.clearColor;
                gl.clearColor(r * a, g * a, b * a, a);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            this.#checkGPU();
            this.#frame = saved;
        }
        catch (cause) {
            if (!gl.isContextLost())
                restoreFrameState(gl, saved);
            throw cause;
        }
    }
    draw(handle, player, options = {}) {
        this.#guard();
        if (!this.#frame)
            invalid("beginFrame() is required before draw()");
        if (handle.disposed) {
            throw new CrustyError("disposed", "WebGL sprite has been disposed");
        }
        const asset = this.#assets.get(handle);
        if (!asset)
            invalid("Sprite belongs to another renderer");
        if (player.definition !== handle.definition) {
            invalid("Player and asset definitions differ");
        }
        const { x = 0, y = 0, scaleX = 1, scaleY = 1, flipX = false, flipY = false, rotation = 0, opacity = 1, originX = 0, originY = 0, } = options;
        for (const [key, value] of Object.entries({
            x,
            y,
            scaleX,
            scaleY,
            rotation,
            opacity,
            originX,
            originY,
        }))
            if (!Number.isFinite(value))
                invalid(`Nonfinite ${key}`, key);
        if (scaleX <= 0 || scaleY <= 0 || opacity < 0 || opacity > 1) {
            invalid("Invalid scale or opacity");
        }
        if (typeof flipX !== "boolean" || typeof flipY !== "boolean") {
            invalid("Flips must be boolean");
        }
        const rect = frameRect(handle.definition, player.frame);
        const sx = scaleX * (flipX ? -1 : 1);
        const sy = scaleY * (flipY ? -1 : 1);
        const c = Math.cos(rotation);
        const s = Math.sin(rotation);
        const vertices = [];
        for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]]) {
            const px = (cx * rect.width - originX) * sx;
            const py = (cy * rect.height - originY) * sy;
            vertices.push(x + c * px - s * py, y + s * px + c * py, (rect.x + cx * rect.width) / asset.decoded.width, (rect.y + cy * rect.height) / asset.decoded.height, opacity);
        }
        if (vertices.some((v) => !Number.isFinite(Math.fround(v)))) {
            invalid("Sprite transform exceeds GPU numeric range");
        }
        this.#queue.push({ asset, vertices });
        this.#queuedAssets.add(asset);
    }
    endFrame() {
        this.#guard();
        const saved = this.#frame;
        if (!saved)
            invalid("No WebGL frame is active");
        const gl = this.#gl;
        try {
            for (let start = 0; start < this.#queue.length;) {
                const asset = this.#queue[start].asset;
                let end = start + 1;
                while (end < this.#queue.length && this.#queue[end].asset === asset) {
                    end++;
                }
                const vertices = new Float32Array((end - start) * 30);
                for (let i = start; i < end; i++) {
                    vertices.set(this.#queue[i].vertices, (i - start) * 30);
                }
                gl.bindTexture(gl.TEXTURE_2D, asset.texture);
                gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
                gl.drawArrays(gl.TRIANGLES, 0, (end - start) * 6);
                this.#checkGPU();
                start = end;
            }
        }
        finally {
            this.#frame = undefined;
            this.#queue = [];
            this.#queuedAssets.clear();
            if (!gl.isContextLost())
                restoreFrameState(gl, saved);
        }
    }
    /** Call after webglcontextrestored; rebuild retained assets without fetching. */
    restore() {
        if (this.#disposed) {
            throw new CrustyError("disposed", "WebGL renderer has been disposed");
        }
        if (this.#gl.isContextLost()) {
            this.#onLost();
            throw new CrustyError("context-lost", "WebGL context is still lost");
        }
        if (!this.#lost)
            return;
        let gpu;
        const textures = new Map();
        try {
            gpu = this.#createGPU();
            for (const asset of this.#assets.values()) {
                textures.set(asset, this.#upload(asset.decoded));
            }
            this.#gpu = gpu;
            for (const [asset, texture] of textures)
                asset.texture = texture;
            this.#lost = false;
            this.#epoch++;
        }
        catch (cause) {
            if (gpu)
                this.#deleteGPU(gpu);
            for (const texture of textures.values())
                this.#gl.deleteTexture(texture);
            throw cause;
        }
    }
    #deleteGPU(gpu) {
        const gl = this.#gl;
        gl.deleteProgram(gpu.program);
        gl.deleteBuffer(gpu.buffer);
        gl.deleteVertexArray(gpu.vao);
    }
    dispose() {
        if (this.#disposed)
            return;
        const gl = this.#gl;
        if (this.#frame && !gl.isContextLost())
            restoreFrameState(gl, this.#frame);
        this.#frame = undefined;
        this.#queue = [];
        this.#queuedAssets.clear();
        this.#disposed = true;
        this.#epoch++;
        gl.canvas.removeEventListener("webglcontextlost", this.#onLost);
        let error;
        for (const asset of [...this.#assets.values()]) {
            try {
                this.#disposeAsset(asset);
            }
            catch (cause) {
                error ??= cause;
            }
        }
        if (this.#gpu)
            this.#deleteGPU(this.#gpu);
        this.#gpu = undefined;
        if (error !== undefined)
            throw error;
    }
}
//# sourceMappingURL=webgl.js.map