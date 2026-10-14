/** Compare a fresh build with the exact Git blobs shipped to consumers. */
export function compareDist(
  generated: ReadonlyMap<string, Uint8Array>,
  recorded: ReadonlyMap<string, Uint8Array>,
): string[] {
  const problems: string[] = [];
  for (const [path, bytes] of generated) {
    const baseline = recorded.get(path);
    if (!baseline) problems.push(`Missing artifact: ${path}`);
    else if (
      bytes.length !== baseline.length ||
      bytes.some((value, index) => value !== baseline[index])
    ) problems.push(`Stale artifact: ${path}`);
  }
  for (const path of recorded.keys()) {
    if (!generated.has(path)) problems.push(`Extra artifact: ${path}`);
  }
  return problems.sort();
}
