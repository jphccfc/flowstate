export type RawSegment = {
  order: number;
  text: string;
};

export function segmentText(rawText: string): RawSegment[] {
  return rawText
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((text, order) => ({ order, text }));
}
