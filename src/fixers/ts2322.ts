export function fixTypeMismatch(line: string): string {
  return line.replace(/"(\d+)"/, "$1");
}