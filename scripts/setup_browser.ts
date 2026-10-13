/** Use Node for Playwright installation (Deno's extraction subprocess can stall on Windows). */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("playwright/package.json")), "cli.js");
const result = await new Deno.Command("node", {
  args: [
    cli,
    "install",
    "chromium",
    ...(Deno.args.includes("--with-deps") ? ["--with-deps"] : []),
  ],
  env: { PLAYWRIGHT_SKIP_BROWSER_GC: "1" },
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!result.success) throw new Error("Browser provisioning failed");
