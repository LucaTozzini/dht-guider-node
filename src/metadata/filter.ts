/**
 * Build a predicate that is true for names containing any blocked word.
 * Matching is case-insensitive and whole-word: "XXX" blocks
 * "Hot.Body.XXX.1080p" and "xxx_clip" but not "Maxxxine". Letters and
 * digits of any script count as word characters, so separators like
 * dots, dashes, underscores, brackets and spaces all work as boundaries.
 */
export function createNameFilter(words: string[]): (name: string) => boolean {
  const cleaned = words.map((w) => w.trim()).filter((w) => w.length > 0);
  if (cleaned.length === 0) return () => false;

  const alternatives = cleaned.map(escapeRegExp).join("|");
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`,
    "iu",
  );
  return (name) => pattern.test(name);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
