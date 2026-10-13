import { SpritePlayer } from "../../dist/mod.js";
import { drawSprite, loadCanvasSprite } from "../../dist/canvas2d.js";

const canvas = document.querySelector("#sprite");
const context = canvas.getContext("2d");
const select = document.querySelector("#animation");
const pause = document.querySelector("#pause");
const status = document.querySelector("#status");
try {
  const asset = await loadCanvasSprite(
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
  select.addEventListener("change", () => player.select(select.value));
  document.querySelector("#restart").addEventListener(
    "click",
    () => player.restart(),
  );
  pause.addEventListener("click", () => {
    if (player.snapshot().status === "paused") {
      player.resume();
      pause.textContent = "Pause";
    } else {
      player.pause();
      pause.textContent = "Resume";
    }
  });
  let previous;
  let fraction = 0;
  let request;
  function tick(time) {
    if (previous !== undefined) {
      const accumulated = time - previous + fraction;
      const whole = Math.floor(accumulated);
      fraction = accumulated - whole;
      player.advance(whole);
    }
    previous = time;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawSprite(context, asset, player, {
      x: 192,
      y: 112,
      scaleX: 2,
      scaleY: 2,
    });
    const state = player.snapshot();
    status.textContent =
      `${state.key} · frame ${state.frame} · ${state.status}`;
    request = requestAnimationFrame(tick);
  }
  // Reset elapsed time on visibility changes so hidden tabs do not catch up.
  document.addEventListener("visibilitychange", () => {
    previous = undefined;
    fraction = 0;
  });
  request = requestAnimationFrame(tick);
  addEventListener("pagehide", () => {
    cancelAnimationFrame(request);
    asset.dispose();
  }, { once: true });
} catch (error) {
  status.textContent = error.message;
}
