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
