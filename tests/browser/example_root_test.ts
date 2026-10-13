import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { handleRequest } from "../../scripts/serve.ts";

Deno.test("example root redirects to the document base and loads all animations", async () => {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    handleRequest,
  );
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ channel: "chromium" });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.addr.port}/`);
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes(
        "valid_looping_1",
      )
    );
    assertEquals(new URL(page.url()).pathname, "/examples/canvas2d/index.html");
    assertEquals(await page.locator("#animation option").count(), 22);
    await page.locator("#animation").selectOption("valid_static_2");
    await page.waitForFunction(() =>
      document.querySelector("#status")?.textContent?.includes("frame 7")
    );
    assertEquals(errors, []);
  } finally {
    await browser?.close();
    await server.shutdown();
  }
});
