import { SpritePlayer } from "../../dist/mod.js";
import { WebGLSpriteRenderer } from "../../dist/webgl.js";

const canvas = document.querySelector("#sprite");
const select = document.querySelector("#animation");
const pause = document.querySelector("#pause");
const restart = document.querySelector("#restart");
const status = document.querySelector("#status");
let renderer;
let request;
let previous;
let fraction = 0;
let recovering = false;
let failed = false;
let stopped = false;
try {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL 2 is unavailable in this browser.");
  renderer = new WebGLSpriteRenderer(gl);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    recovering = true;
    previous = undefined;
    fraction = 0;
    status.textContent = "Graphics context lost; waiting for restoration…";
  });
  canvas.addEventListener("webglcontextrestored", () => {
    try {
      renderer.restore();
      recovering = false;
      previous = undefined;
      fraction = 0;
    } catch (error) {
      failed = true;
      status.textContent = error.message;
    }
  });
  const asset = await renderer.loadSprite(
    new URL("../../assets/lord-stan/lord_stan.json", import.meta.url),
  );
  const player = new SpritePlayer(asset.definition, {
    animation: "valid_looping_1",
  });
  for (const name of Object.keys(asset.definition.animations)) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
  select.value = "valid_looping_1";
  select.disabled = false;
  pause.disabled = false;
  restart.disabled = false;
  select.addEventListener("change", () => player.select(select.value));
  restart.addEventListener("click", () => player.restart());
  pause.addEventListener("click", () => {
    if (player.snapshot().status === "paused") {
      player.resume();
      pause.textContent = "Pause";
    } else {
      player.pause();
      pause.textContent = "Resume";
    }
  });
  function tick(time) {
    if (stopped) return;
    if (!recovering && !failed) {
      try {
        if (previous !== undefined) {
          const accumulated = time - previous + fraction;
          const whole = Math.floor(accumulated);
          fraction = accumulated - whole;
          player.advance(whole);
        }
        previous = time;
        renderer.beginFrame({
          width: canvas.width,
          height: canvas.height,
          clearColor: [0, 0, 0, 0],
        });
        try {
          renderer.draw(asset, player, {
            x: 192,
            y: 112,
            scaleX: 2,
            scaleY: 2,
          });
        } finally {
          renderer.endFrame();
        }
        const state = player.snapshot();
        status.textContent =
          `${state.key} · frame ${state.frame} · ${state.status}`;
      } catch (error) {
        if (error.code === "context-lost") {
          recovering = true;
          previous = undefined;
          fraction = 0;
          status.textContent =
            "Graphics context lost; waiting for restoration…";
        } else {
          failed = true;
          status.textContent = error.message;
        }
      }
    }
    request = requestAnimationFrame(tick);
  }
  document.addEventListener("visibilitychange", () => {
    previous = undefined;
    fraction = 0;
  });
  request = requestAnimationFrame(tick);
} catch (error) {
  status.textContent = error.message;
  renderer?.dispose();
}
addEventListener("pagehide", () => {
  stopped = true;
  cancelAnimationFrame(request);
  renderer?.dispose();
}, { once: true });
