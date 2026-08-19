# Task 7: Assess page rewrite — Report

## What was implemented

Replaced the full contents of `app/clients/[id]/assess/page.tsx`, verbatim per the brief in
`.superpowers/sdd/task-7-brief.md`. The old page (0-10 continuous-slider UI, single-shot
`asIsScore`/`toBeScore`/`asIsState`/`toBeState`/`opportunities`/`weaknesses`/`aliases` fields with
debounced PATCH autosave) is gone entirely. The new page implements the versioned as-is/to-be
maturity model:

- `ScorePicker`: six discrete buttons (0-5 integers only), no slider.
- `EntryForm`: per-entry form (location tag, optional "committed by" for to-be, score picker,
  evidence/rationale textarea) with two explicit actions — **Draft with AI** (populates the form
  fields only, does not submit) and **Save** (submits and resets the form).
- Sidebar lists capabilities per domain, colored by `getGapColor(getGapSeverity(calculateGap(...)))`
  computed from the org-level `currentAsIs`/`currentToBe` arrays returned by `GET /api/clients/[id]`.
- Main panel shows current as-is/to-be snapshots (one row per location), the entry form for each,
  collapsible full history (from `GET /api/capabilities/[id]/assessment-history`), and a computed
  gap readout.
- Saving either an as-is or to-be entry POSTs to `/api/maturity-assessments` or
  `/api/target-maturities` respectively, then reloads both `loadHistory(selectedCapId)` (refreshes
  the per-capability panel) and `loadOrg()` (refreshes the sidebar's gap-severity dots) — satisfying
  the dual-refresh requirement.
- Draft actions call `POST /api/capabilities/[id]/draft-as-is` / `draft-to-be` and map
  `draft.evidence` / `draft.rationale` into the form's `text` field without calling `onSubmit`.

## Build output

`npm run build` (Next.js 16.2.6, Turbopack): compiles successfully, but the TypeScript check step
fails — **not because of this change**. The single failure reported is in
`app/clients/[id]/analysis/page.tsx:64`, which still calls `calculateDomainScore` with the old
`{ asIsScore, toBeScore, ... }` capability shape, incompatible with the `CapabilityMaturity` type
(`{ asIs: MaturitySnapshot[]; toBe: MaturitySnapshot[]; ... }`) that Task 2 already changed
`lib/scoring/engine.ts` to use.

Verified this is pre-existing and unrelated to this task:
- Stashed my change (restoring the *old* assess page) and re-ran `npm run build` — same single
  error at the same location, confirming the failure predates and is independent of this task's
  edit. Change was then restored via `git stash pop`.
- Ran `npx tsc --noEmit -p tsconfig.json` across the whole project (not just the Next build's
  first-error-per-file view): exactly two errors total, both pre-existing and both in files
  explicitly owned by later pending tasks:
  - `app/clients/[id]/analysis/page.tsx:64` — Task 8 (Analysis page rewrite)
  - `app/clients/[id]/report/page.tsx:69` — Task 9 (Report page rewrite)
  - Zero errors anywhere in `app/clients/[id]/assess/page.tsx`.

So the rewritten assess page itself type-checks cleanly; the overall `npm run build` command still
exits non-zero only because of the two other pages still awaiting their own rewrites, which is
expected given the task sequencing (Task 7 before Tasks 8/9).

## Files changed

- `app/clients/[id]/assess/page.tsx` — full rewrite (249 insertions, 334 deletions per `git diff --stat`)

## Commit

- `7addf7c` — "Rewrite assess page on the versioned as-is/to-be maturity model"

## Self-review

- **Score picker integers 0-5 only:** Yes — `ScorePicker` renders exactly `[0,1,2,3,4,5]` as
  discrete buttons; no range/slider input anywhere in the file.
- **"Draft with AI" populates without auto-submitting:** Yes — `handleDraft` only calls `onDraft()`
  and sets local `score`/`text` state; it never calls `onSubmit`. The advisor must click the
  separate "Save" button.
- **Submitting refreshes both the per-capability history panel and the sidebar:** Yes — both
  `saveAsIs` and `saveToBe` call `await loadHistory(selectedCapId)` then `await loadOrg()`. `loadOrg`
  re-fetches `/api/clients/${id}`, which re-populates `org.domains[].capabilities[].currentAsIs`/
  `currentToBe`, feeding the sidebar's `calculateGap`/`getGapSeverity`/`getGapColor` dots.
- **API shapes match what Tasks 2-5 actually built** (checked the real route files, not just the
  brief's prose):
  - `GET /api/clients/[id]` (`app/api/clients/[id]/route.ts`): confirmed it returns
    `org.domains[].capabilities[]` enriched with `currentAsIs`/`currentToBe` as
    `{ locationTag, score }[]` — matches the `Capability`/`Org` types used in the page. Note: the
    route does not add a `tags` field to capabilities (raw Prisma `capability` doesn't have a
    `tags` string array column visibly returned here) — see Concerns below.
  - `GET /api/capabilities/[id]/assessment-history` (`app/api/capabilities/[id]/assessment-history/route.ts`):
    returns `{ currentAsIs, currentToBe, asIsHistory, toBeHistory }` exactly as the page's
    `HistoryData` type expects, with `asIsHistory` from `maturityAssessment` (has `assessedAt`,
    `evidence`) and `toBeHistory` from `targetMaturity` (has `setAt`, `rationale`) — matches how the
    page renders each history list.
  - `POST /api/maturity-assessments`: accepts `{ capabilityId, locationTag, score, evidence }`,
    validates score is an integer 0-5 — matches `saveAsIs`'s payload and the `ScorePicker`'s 0-5
    integer constraint.
  - `POST /api/target-maturities`: accepts `{ capabilityId, locationTag, score, rationale,
    committedBy }`, same 0-5 integer validation — matches `saveToBe`'s payload.
  - `POST /api/capabilities/[id]/draft-as-is` → `draftAsIsScore()` in `lib/ai/maturity-draft.ts`
    returns `{ score, evidence }`; `POST /api/capabilities/[id]/draft-to-be` → `draftToBeScore()`
    returns `{ score, rationale }`. Confirmed the page's `draftAsIs`/`draftToBe` functions read
    `draft.evidence` and `draft.rationale` respectively — matches exactly.
  - `lib/scoring/engine.ts`: confirmed current signatures — `calculateGap(asIs: MaturitySnapshot[],
    toBe: MaturitySnapshot[]): number | null`, `getGapSeverity(gap: number | null)`,
    `getGapColor(severity)`, and `type MaturitySnapshot = { locationTag: string | null; score:
    number }` — all match the page's imports and usage.

## Concerns

- Checked `prisma/schema.prisma`: `Capability.tags` is a real column
  (`tags String[] @default([])`), and `GET /api/clients/[id]` spreads `...cap` (the raw Prisma row)
  onto each enriched capability, so `tags` is genuinely present in the API response — no issue here.
- The overall `npm run build` will only fully pass once Tasks 8 and 9 are also complete (per the
  task's own instructions, this is expected — brief only required the assess page's slice to compile
  cleanly, verified independently via `tsc --noEmit`, which shows zero errors in this file).
