/** Fresh staging directories preserve all prior artifacts; no cleanup/deletion. */
const root = new URL("../", import.meta.url);
const stage = new URL(`.build/package-${crypto.randomUUID()}/`, root);
async function copyTree(from: URL, to: URL): Promise<void> {
  await Deno.mkdir(to, { recursive: true });
  for await (const entry of Deno.readDir(from)) {
    const source = new URL(entry.name, from);
    const target = new URL(entry.name, to);
    if (entry.isDirectory) {
      await copyTree(
        new URL(`${entry.name}/`, from),
        new URL(`${entry.name}/`, to),
      );
    } else if (entry.isFile) await Deno.copyFile(source, target);
  }
}
await Deno.mkdir(stage, { recursive: true });
for (
  const path of [
    "package.json",
    "tsconfig.build.json",
    "README.md",
    "LICENSE",
    "ASSET-ATTRIBUTION.md",
  ]
) {
  await Deno.copyFile(new URL(path, root), new URL(path, stage));
}
for (const path of ["src/", "assets/"]) {
  await copyTree(new URL(path, root), new URL(path, stage));
}
const command = new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "--allow-read",
    "--allow-write=dist",
    "--allow-env",
    "npm:typescript@5.9.3/tsc",
    "--project",
    "tsconfig.build.json",
  ],
  cwd: stage,
  stdout: "inherit",
  stderr: "inherit",
});
const result = await command.output();
if (!result.success) throw new Error("TypeScript build failed");
// TypeScript rewrites JS import extensions, but leaves .ts references in .d.ts.
// Rewrite only extensions, preserving declaration-map offsets (.ts/.js have equal length).
for await (const entry of Deno.readDir(new URL("dist/", stage))) {
  if (!entry.name.endsWith(".d.ts")) continue;
  const path = new URL(`dist/${entry.name}`, stage);
  const text = await Deno.readTextFile(path);
  await Deno.writeTextFile(
    path,
    text.replace(/(from\s+["']\.\.?\/[^"']+)\.ts(["'])/g, "$1.js$2"),
  );
}
await copyTree(new URL("dist/", stage), new URL("dist/", root));
await Deno.writeTextFile(
  new URL(".build/latest.txt", root),
  stage.pathname.replace(/^\/(\w:)/, "$1"),
);
console.log(`Built ${stage.href}`);
