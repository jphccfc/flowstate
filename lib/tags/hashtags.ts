export function normalizeHashtag(value: string): string {
  const normalized = value
    .trim()
    .replace(/^#+/, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) throw new Error("A tag must contain letters or numbers.");
  if (normalized.length > 80) throw new Error("A tag must be 80 characters or fewer.");
  return normalized;
}

export function parseHashtagInput(value: string): string[] {
  return [...new Set(value.split(",").map((entry) => normalizeHashtag(entry)).filter(Boolean))];
}

export function displayHashtag(value: string): string {
  return `#${normalizeHashtag(value)}`;
}
