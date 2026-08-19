# Task 8: Analysis page rewrite — Report

## What was implemented

Replaced the full contents of `app/clients/[id]/analysis/page.tsx` exactly per the brief. The
page now:

- Fetches `GET /api/clients/[id]` and reads `currentAsIs`/`currentToBe` (arrays of
  `MaturitySnapshot`, i.e. `{ locationTag, score }`) per capability instead of the old flat
  `asIsScore`/`toBeScore` fields.
- Computes per-domain aggregates via `calculateDomainScore` from `lib/scoring/engine.ts`,
  passing `{ id, name, importanceScore, asIs: c.currentAsIs, toBe: c.currentToBe }` per
  capability (matching the real `CapabilityMaturity` shape in `lib/scoring/engine.ts`).
- Builds radar chart data via `buildRadarData(domainScores)` and overall maturity via
  `getOverallMaturity(domainScores)`.
- Radar chart's `PolarRadiusAxis` now uses `domain={[0, 5]}` (was `[0, 10]`).
- Summary stat tiles, domain score bars, capability heatmap, and priority-gaps table all
  updated to the 0-5 scale (bar widths now divide by 5 instead of 10) and to use
  `getGapSeverity` from the engine for severity classification/coloring instead of ad hoc
  gap-score thresholds.
- "Critical Gaps" stat now counts via `getGapSeverity(c.gapScore) === "critical"` rather than
  the old inline `(c.gapScore ?? 0) > 3` check.

This is a verbatim copy of the code block in the task brief (`.superpowers/sdd/task-8-brief.md`).

## Type-check output

`npx tsc --noEmit` — only 1 error remains, in the pre-existing, unrelated
`app/clients/[id]/report/page.tsx:69` (Task 9's responsibility, not touched here):

```
app/clients/[id]/report/page.tsx(69,75): error TS2345: Argument of type '{ id: string; name: string; asIsScore: number | null; toBeScore: number | null; importanceScore: number | null; gapScore: number | null; }[]' is not assignable to parameter of type 'CapabilityMaturity[]'.
  Type '{ id: string; name: string; asIsScore: number | null; toBeScore: number | null; importanceScore: number | null; gapScore: number | null; }' is missing the following properties from type 'CapabilityMaturity': asIs, toBe
```

Confirmed: no `analysis/page.tsx` errors appear anywhere in the output (`grep "analysis/page"`
returned nothing). The previously reported `analysis/page.tsx:64` error is gone.

## Build output

`npm run build` — Turbopack compile step succeeds ("Compiled successfully in 6.4s"), then the
build's internal `tsc` type-check step fails on the same, single, pre-existing
`report/page.tsx:69` error described above (expected per the task brief — that page is Task 9's
job). No errors related to `analysis/page.tsx` or any other file appeared.

## Files changed

- `app/clients/[id]/analysis/page.tsx` (full rewrite, 154 lines → per brief; net -80 lines
  vs. previous version: 37 insertions, 117 deletions)

## Self-review

- Radar chart axis domain reads `[0, 5]`: confirmed, `app/clients/[id]/analysis/page.tsx:109`.
- `calculateDomainScore` called with `{id, name, importanceScore, asIs, toBe}` shape built from
  `cap.currentAsIs`/`cap.currentToBe`: confirmed, `app/clients/[id]/analysis/page.tsx:47-56`.
- `npx tsc --noEmit` shows the `analysis/page.tsx:64` error is gone: confirmed, only the known
  unrelated `report/page.tsx:69` error remains.

## Concerns

None. The rewrite is a verbatim application of the brief's code, the real
`lib/scoring/engine.ts` signatures (`CapabilityMaturity`, `DomainScore`, `calculateDomainScore`,
`buildRadarData`, `getGapSeverity`, `getOverallMaturity`) match exactly what the brief assumed,
and only the file specified was modified. `git status` confirms no other files were touched.

## Commit

`997645f` — "Rewrite analysis page on the versioned as-is/to-be maturity model, 0-5 scale"
