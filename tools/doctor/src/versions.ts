/** "v24.1.0", "pnpm 10.28.0", 'openjdk version "17.0.9"' gibi ciktilardan ilk surumu ayiklar. */
export function parseVersion(text: string): number[] | undefined {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(text);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

export function atLeastMajor(text: string, major: number): boolean {
  const version = parseVersion(text);
  return version !== undefined && (version[0] ?? 0) >= major;
}

/** `java -version` ciktisinda ana surum: "1.8.0_x" -> 8, "17.0.9" -> 17. */
export function javaMajor(text: string): number | undefined {
  const match = /version "(\d+)(?:\.(\d+))?/.exec(text);
  if (!match) return undefined;
  const first = Number(match[1]);
  return first === 1 ? Number(match[2] ?? 0) : first;
}
