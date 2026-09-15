export type ParsedDocumentVersion = {
  baseTitle: string;
  versionLabel: string | null;
  versionMajor: number | null;
  versionMinor: number | null;
  explicit: boolean;
};

/**
 * Parse an explicit version suffix without treating words such as "revised"
 * or "final" as versions. The caller must still use source path/context when
 * deciding whether two files belong to one logical family.
 */
export function parseDocumentVersion(filename: string): ParsedDocumentVersion {
  const withoutExtension = filename.replace(/\.[^./\\]+$/, "");
  const match = withoutExtension.match(/(?:^|[\s_-])(v(?:ersion)?[\s_-]?\d+(?:[._-]\d+)?)(?=$|[\s_-])/i);
  if (!match) return { baseTitle: withoutExtension, versionLabel: null, versionMajor: null, versionMinor: null, explicit: false };

  const versionLabel = match[1];
  const numbers = versionLabel.match(/\d+/g) ?? [];
  return {
    baseTitle: withoutExtension.slice(0, match.index ?? withoutExtension.length).replace(/[\s_-]+$/, "").trim(),
    versionLabel,
    versionMajor: Number(numbers[0]),
    versionMinor: Number(numbers[1] ?? 0),
    explicit: true,
  };
}

export function normalizeDocumentTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function compareDocumentVersions(a: ParsedDocumentVersion, b: ParsedDocumentVersion): number {
  if (a.versionMajor === null && b.versionMajor === null) return 0;
  if (a.versionMajor === null) return -1;
  if (b.versionMajor === null) return 1;
  return (a.versionMajor - b.versionMajor) || ((a.versionMinor ?? 0) - (b.versionMinor ?? 0));
}

/** Conservative family key: no source path means no automatic grouping. */
export function documentFamilyKey(filename: string, sourcePath: string | null | undefined): string | null {
  if (!sourcePath?.trim()) return null;
  return `${normalizeDocumentTitle(parseDocumentVersion(filename).baseTitle)}::${sourcePath.trim().toLowerCase()}`;
}

