export const DEFAULT_DOMAIN_NAMES = [
  "Operations",
  "Financial and Legal",
  "People",
  "Technology and Data",
  "Customers and Revenue",
] as const;

type DomainLike = { name?: string | null };

export function mergeDomainNames(domains?: DomainLike[] | null): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const name of [...DEFAULT_DOMAIN_NAMES, ...(domains ?? []).map((domain) => domain.name ?? "")]) {
    const trimmed = name.trim();
    const key = trimmed.toLocaleLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      names.push(trimmed);
    }
  }

  return names;
}
