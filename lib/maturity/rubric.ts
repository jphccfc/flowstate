export type MaturityAnchor = {
  level: number;
  label: string;
  description: string;
};

export const DEFAULT_MATURITY_RUBRIC = {
  name: "Flowstate maturity rubric",
  version: 1,
  anchors: [
    { level: 0, label: "Absent", description: "No meaningful capability exists; the need may be unrecognised, unmanaged, or dependent on informal individual effort." },
    { level: 1, label: "Ad hoc", description: "Isolated activity or awareness exists, but practice is reactive, inconsistent, undocumented, and individual-dependent." },
    { level: 2, label: "Emerging", description: "The capability is recognised and repeatable in parts of the organisation, but adoption and measurement are inconsistent." },
    { level: 3, label: "Defined", description: "The capability is defined, documented, owned, consistently operated, and monitored across the relevant organisation." },
    { level: 4, label: "Advanced", description: "The capability is integrated, measured, continuously improved, and supported by strong data, governance, technology, and cross-functional practice." },
    { level: 5, label: "Leading", description: "The organisation is recognised as an industry leader, sets external benchmarks, shapes industry practice, and may define global strategic direction." },
  ] satisfies MaturityAnchor[],
} as const;

export function summarisePerspectiveScores(scores: number[]) {
  if (scores.length === 0) return { count: 0, minimum: null, maximum: null, spread: null };
  const minimum = Math.min(...scores);
  const maximum = Math.max(...scores);
  return { count: scores.length, minimum, maximum, spread: maximum - minimum };
}
