# Task 2 Report: Current-maturity helpers, scoring engine rewrite, client route embedding

## What was implemented

1. **`lib/maturity/current.ts`** (append only) — added `OrgCurrentMaturity` type and
   `getCurrentMaturityForOrganization(organizationId)`, a batched org-wide query using
   Prisma's `distinct: ["capabilityId", "locationTag"]` + `orderBy: { assessedAt: "desc" }`
   to get the latest as-is assessment per capability+location across an org in one query.
   The pre-existing `getCurrentMaturity` function and `CurrentMaturity` type (lines 1-27)
   are untouched — only new code was appended below them.

2. **`lib/maturity/target.ts`** (new file) — mirrors `current.ts`'s pattern for
   `TargetMaturity`: `CurrentMaturity` type (local to this file, includes `setAt`),
   `getCurrentTargetMaturity(capabilityId)` (latest target per location for one
   capability) and `getCurrentTargetMaturityForOrganization(organizationId)` (batched
   org-wide, same `distinct`+`orderBy` pattern).

3. **`lib/scoring/engine.ts`** (full rewrite) — replaced the old flat-field-based
   `calculateGap(asIs: number|null, toBe: number|null)` and
   `calculateDomainScore(capabilities: CapabilityScore[])` with snapshot-array-based
   versions:
   - `MaturitySnapshot`, `CapabilityMaturity` (new input types)
   - `averageScore(snapshots)` — mean of scores across locations, null for empty list
   - `calculateGap(asIs: MaturitySnapshot[], toBe: MaturitySnapshot[])` — matches each
     as-is location to a to-be at the *same* location first, falling back to the
     org-wide (`locationTag: null`) target when no location-specific target exists;
     averages the as-is scores and the matched to-be scores, then takes the (clamped
     non-negative) difference. Returns null if either side is empty.
   - `calculateDomainScore(capabilities: CapabilityMaturity[])` — now computes
     `asIsScore`/`toBeScore`/`gapScore` per capability from snapshots via the two
     functions above, then does the same importance-weighted domain aggregation as
     before, filtering to capabilities with both sides scored.
   - `buildRadarData`, `getGapSeverity`, `getGapColor`, `getOverallMaturity` — unchanged
     logic, retained verbatim.

4. **`app/api/clients/[id]/route.ts`** (full rewrite, per brief) — `GET` now also calls
   `getCurrentMaturityForOrganization` and `getCurrentTargetMaturityForOrganization` in
   parallel, groups results into per-capability `{ locationTag, score }[]` maps, and
   embeds `currentAsIs`/`currentToBe` onto every capability in the response, alongside
   all previously-returned fields (`domains` → `capabilities`, `stakeholders`, `kpis`,
   `achievements`, `sessions`). `PATCH` is byte-identical to its pre-Task-2 content (per
   the brief, it's extended in Task 6).

## Tests

Created exactly the three test files specified in the brief:
- `tests/unit/scoring-engine.test.ts` (pure unit tests for `averageScore`/`calculateGap`/`calculateDomainScore`)
- `tests/schema/maturity-target.test.ts` (DB-backed tests for the new target helpers)
- `tests/schema/clients-route.test.ts` (DB-backed test for `GET` embedding `currentAsIs`/`currentToBe`)

### TDD evidence

**RED** — before implementing source changes:
```
npm test -- scoring-engine maturity-target clients-route
Test Files  3 failed (3)
Tests  12 failed | 1 passed (13)
```
Failures were exactly as expected: `lib/maturity/target.ts` module not found,
`averageScore`/new-signature `calculateGap` not exported, `calculateDomainScore`
producing `NaN`/throwing on the old flat-number signature, and `GET` not returning
`currentAsIs`/`currentToBe`.

**GREEN** — after implementing all source files:
```
npm test -- scoring-engine maturity-target clients-route
Test Files  3 passed (3)
Tests  15 passed (15)
```

Also re-ran the pre-existing, untouched test to confirm no regression:
```
npm test -- current-maturity
Test Files  1 passed (1)
Tests  2 passed (2)
```

## Files changed

- Modified: `lib/maturity/current.ts` (append only — new export added below existing code)
- Created: `lib/maturity/target.ts`
- Modified (full rewrite): `lib/scoring/engine.ts`
- Modified (full rewrite): `app/api/clients/[id]/route.ts`
- Created: `tests/unit/scoring-engine.test.ts`
- Created: `tests/schema/maturity-target.test.ts`
- Created: `tests/schema/clients-route.test.ts`

## Self-review

- **`getCurrentMaturity` byte-identical?** Confirmed — read back `lib/maturity/current.ts`
  and lines 1-27 (import, `CurrentMaturity` type, `getCurrentMaturity` function) are
  unchanged from the original; only the new `OrgCurrentMaturity` type and
  `getCurrentMaturityForOrganization` function were appended starting at line 29.
- **`calculateGap` location-fallback rule correct?** Verified against all six brief test
  cases (empty as-is → null, empty to-be → null, simple org-wide gap, same-location
  matching with per-location averaging, org-wide fallback when a location has no
  location-specific target, and gap clamped to non-negative) — all pass.
- **`GET /api/clients/[id]` still returns everything it did before?** Yes — `domains`
  (with nested `capabilities`, each carrying all prior fields plus `currentAsIs`/
  `currentToBe`), `stakeholders`, `kpis`, `achievements`, `sessions` are all still
  included via the same Prisma `include` and spread into the response unchanged.
- **Test output pristine?** Yes — `npm test -- scoring-engine maturity-target
  clients-route` shows `3 passed (3)` / `15 passed (15)` with no warnings beyond the
  pre-existing, unrelated Vite config-loader notice that appears on every test run in
  this repo.

## Concerns

- `npx tsc --noEmit` surfaces pre-existing type errors in `app/clients/[id]/assess/page.tsx`,
  `app/clients/[id]/analysis/page.tsx`, and `app/clients/[id]/report/page.tsx` — these
  pages define their own local `Capability` UI type with flat `asIsScore`/`toBeScore`
  fields and call `calculateGap`/`calculateDomainScore` with the old signatures. This is
  expected and explicitly out of scope: the task brief and task context state these three
  pages are rewritten in Tasks 7/8/9. No action taken on them.
- No other concerns. `getCurrentMaturity`/`current-maturity.test.ts` unaffected;
  focused test suite is green.
