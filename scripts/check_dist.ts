import { compareDist } from "./dist_inventory.ts";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const staged = Deno.args.includes("--staged");
async function git(args: string[]): Promise<Uint8Array> {
  const result = await new Deno.Command("git", { args, cwd: root }).output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
  return result.stdout;
}
async function inventory(
  directory: URL,
  prefix = "dist/",
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  try {
    for await (const entry of Deno.readDir(directory)) {
      if (entry.isDirectory) {
        for (
          const [path, bytes] of await inventory(
            new URL(`${entry.name}/`, directory),
            `${prefix}${entry.name}/`,
          )
        ) files.set(path, bytes);
      } else if (entry.isFile) {
        files.set(
          `${prefix}${entry.name}`,
          await Deno.readFile(new URL(entry.name, directory)),
        );
      } else throw new Error(`Unsupported artifact: ${prefix}${entry.name}`);
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return files;
}
const built = await new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "--allow-read",
    "--allow-write",
    "--allow-run",
    "--allow-env",
    fileURLToPath(new URL("scripts/build.ts", root)),
    "--no-mirror",
  ],
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!built.success) throw new Error("Fresh dist build failed");
const stage = (await Deno.readTextFile(new URL(".build/latest.txt", root)))
  .trim();
// The stage path is written by our build, which emits matching paths on both hosts.
const fresh = await inventory(
  pathToFileURL(join(stage, "dist") + "/"),
);
const listed = await git(
  staged
    ? ["ls-files", "--cached", "-z", "--", "dist"]
    : ["ls-tree", "-r", "--name-only", "-z", "HEAD", "--", "dist"],
);
const recorded = new Map<string, Uint8Array>();
for (
  const path of new TextDecoder().decode(listed).split("\0").filter(Boolean)
) {
  recorded.set(path, await git(["show", `${staged ? "" : "HEAD"}:${path}`]));
}
const working = await inventory(new URL("dist/", root));
const problems = [
  ...compareDist(fresh, recorded),
  ...compareDist(fresh, working).map((problem) => `Working tree: ${problem}`),
];
if (problems.length) {
  throw new Error(
    `${
      problems.join("\n")
    }\nRun deno task build and commit the generated dist/ with its source.`,
  );
}
console.log(
  `Verified ${fresh.size} generated artifacts against ${
    staged ? "the Git index" : "HEAD"
  } and the working tree`,
);
