# Task 5 Report: Claude-assisted as-is/to-be drafting

## What was implemented

Exactly per the brief, no deviations:

1. **`lib/ai/maturity-draft.ts`** (new) — `draftAsIsScore(capabilityName, evidenceTexts)` and `draftToBeScore(capabilityName, engagementMotive, kpiTargets)`. Both call `fetch("https://api.anthropic.com/v1/messages")` directly (raw fetch, no SDK — matches `lib/ai/tagging.ts`/`lib/ai/followups.ts` pattern), parse the JSON object embedded in Claude's text response via regex `\{[\s\S]*\}`, and clamp the returned score into `[0, 5]` with `Math.max(0, Math.min(5, Math.round(Number(parsed.score) || 0)))`. Unparseable responses (no JSON match, or JSON.parse throws) fall back to `{ score: 0, evidence: "" }` / `{ score: 0, rationale: "" }`.

2. **`app/api/capabilities/[id]/draft-as-is/route.ts`** (new) — `POST` handler: authenticates via Supabase (401 if no user), looks up the capability (404 if missing), reads optional `locationTag` from the request body, queries `Tag` rows where `targetType: "CAPABILITY"`, `targetId: id`, `status: { in: ["AUTO_APPROVED", "APPROVED"] }`, optionally filtered by `segment.capturedInput.locationTag`, includes the related `segment`, extracts `segment.text` as evidence, calls `draftAsIsScore`, returns `{ score, evidence }`.

3. **`app/api/capabilities/[id]/draft-to-be/route.ts`** (new) — `POST` handler: authenticates via Supabase (401 if no user), looks up the capability with `domain.organization` and `kpis.kpi` included (404 if missing), builds `kpiTargets` by filtering `capability.kpis[].kpi` to those with a truthy `targetValue`, formats as `"${kpi.name}: ${kpi.targetValue}"`, calls `draftToBeScore(capability.name, capability.domain.organization.engagementMotive, kpiTargets)`, returns `{ score, rationale }`.

4. **`tests/schema/maturity-draft-generator.test.ts`** (new) — unit tests for the two AI functions, mocking `fetch` via `vi.stubGlobal`.

5. **`tests/schema/maturity-draft-routes.test.ts`** (new) — integration tests against the real Postgres test DB (via `tests/helpers/db.ts`), mocking Supabase auth and `fetch`.

All 5 files match the brief's code verbatim.

## Prisma relation verification

Before implementing, I checked `prisma/schema.prisma` directly rather than trusting the brief blindly:
- `Capability.domain` → `BusinessDomain` ✓ (matches brief's `capability.domain`)
- `BusinessDomain.organization` → `Organization` ✓ (matches brief's `capability.domain.organization`)
- `Capability.kpis` → `CapabilityKPI[]`, and `CapabilityKPI.kpi` → `KPI` ✓ (matches brief's `capability.kpis[].kpi`)
- `Organization.engagementMotive: String?` ✓ exists
- `KPI.targetValue: String?` ✓ exists
- `Tag.status: TagStatus` enum includes `AUTO_APPROVED`, `PENDING_REVIEW`, `APPROVED`, and `Tag.segment` → `CapturedSegment` ✓
- `CapturedInput.locationTag: String?` ✓ exists

No discrepancies found — the brief's relation names were accurate, so I proceeded without escalating.

## TDD evidence

**RED** (tests written, source files absent):
```
FAIL  tests/schema/maturity-draft-generator.test.ts
Error: Cannot find module '../../lib/ai/maturity-draft' ...
FAIL  tests/schema/maturity-draft-routes.test.ts
Error: Cannot find module '/app/api/capabilities/[id]/draft-as-is/route' ...
Test Files  2 failed (2)
Tests  no tests
```

**GREEN** (after implementing all 3 source files):
```
Test Files  2 passed (2)
     Tests  8 passed (8)
```

Full targeted command: `npm test -- maturity-draft-generator maturity-draft-routes`

## Full suite regression check

Ran `npm test` (whole repo): **25 test files passed, 74 tests passed**. One pre-existing unhandled rejection appeared from `tests/schema/captured-inputs-route.test.ts` (a DNS lookup failure for `blob.example.com` in `lib/ai/transcription.ts`, unrelated to this task — confirmed via `git diff --stat` that this test file has zero changes from my work). It did not fail any test and is not something this task touched.

## TypeScript check

`npx tsc --noEmit` shows pre-existing errors in `app/clients/[id]/analysis/page.tsx`, `app/clients/[id]/assess/page.tsx`, and `app/clients/[id]/report/page.tsx` — all belong to Tasks 7/8/9 (not yet rewritten) and reference maturity-shape mismatches unrelated to this task's files. Grepped tsc output for `maturity-draft`/`draft-as-is`/`draft-to-be`: zero matches — my 3 new source files introduce no type errors.

## Files changed

- `lib/ai/maturity-draft.ts` (new)
- `app/api/capabilities/[id]/draft-as-is/route.ts` (new)
- `app/api/capabilities/[id]/draft-to-be/route.ts` (new)
- `tests/schema/maturity-draft-generator.test.ts` (new)
- `tests/schema/maturity-draft-routes.test.ts` (new)

Commit: `dcf74d9` "Add Claude-assisted as-is/to-be maturity score drafting"

## Self-review checklist

- **draft-as-is excludes PENDING_REVIEW/REJECTED, only includes AUTO_APPROVED/APPROVED**: Yes — `status: { in: ["AUTO_APPROVED", "APPROVED"] }` in the Prisma query. Verified by test: a PENDING_REVIEW-tagged segment's text ("Unreviewed claim.") is asserted absent from the prompt body while the AUTO_APPROVED segment's text is present.
- **draft-to-be gathers KPI targets only for non-null targetValue**: Yes — `.filter((kpi) => kpi.targetValue)` before mapping to `"name: value"` strings. Falsy `targetValue` (null or empty string) is excluded.
- **Both draft functions clamp score into 0-5**: Yes — `Math.max(0, Math.min(5, Math.round(Number(parsed.score) || 0)))` in both functions. Verified by test: score 9 input clamps to 5.
- **Both routes 404 on nonexistent capability**: Yes — both routes call `prisma.capability.findUnique` (or with includes for to-be) and return `404` if null, before any AI call or evidence gathering. Verified by test.
- **Test output pristine**: The targeted test run (`maturity-draft-generator maturity-draft-routes`) is fully clean — 8/8 pass, no console noise beyond the standard dotenv injection banner common to all tests in this repo. The one full-suite unhandled rejection is pre-existing and unrelated to this task.

## Concerns

None. Implementation matches the brief exactly, Prisma relations were verified against the actual schema before use, TDD RED→GREEN cycle was followed, and the full test suite has no regressions attributable to this change.
