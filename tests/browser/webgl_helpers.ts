import { chromium } from "playwright";
import type { Page } from "playwright";
import { handleRequest } from "../../scripts/serve.ts";

export async function withWebGLPage(
  action: (page: Page) => Promise<void>,
): Promise<void> {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    (request) => {
      if (new URL(request.url).pathname === "/test.html") {
        return new Response("<!doctype html><title>WebGL test</title>", {
          headers: { "content-type": "text/html" },
        });
      }
      return handleRequest(request);
    },
  );
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    // Software GL makes this gate repeatable on CI hosts without a GPU.
    browser = await chromium.launch({
      channel: "chromium",
      args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.addr.port}/test.html`);
    await action(page);
  } finally {
    await browser?.close();
    await server.shutdown();
  }
}
