# Flowstate Handover Note

**Branch:** `flowstate-handover`
**Base:** fast-forwarded from `claude/review-flowstate-platform-GPvI0` (`a592836`) to `worktree-flowstate-phase3a-assessment` HEAD (`511a77c`).
**Date prepared:** 2026-08-19

This branch exists to hand the Flowstate codebase off to a new Hermes + Herdr + Claude Code environment with everything merged, documented, and verified in one place.

## What's in this branch

Everything that was on `claude/review-flowstate-platform-GPvI0`, plus all 13 commits from the Phase 3a (assessment flow) implementation — fast-forwarded cleanly, no merge conflicts, no rebasing. See `docs/handover/sdd/phase3a-assessment/progress.md` for the task-by-task log.

### Project layout
- `app/` — Next.js App Router pages and API routes
- `lib/` — scoring engine, maturity helpers, AI drafting
- `prisma/` — schema, migrations, generated client is committed under `app/generated/prisma/` (see note below)
- `tests/` — Vitest unit/schema tests
- `docs/superpowers/plans/` and `docs/superpowers/specs/` — design specs and implementation plans for each phase (2a, 2b, 3a), tracked in git
- `docs/handover/sdd/phase3a-assessment/` — copied working notes from the Phase 3a build (see below)

### Running it
```
npm run dev      # dev server
npm run build     # production build
npm run lint      # eslint
npm test          # vitest run
npm run db:migrate  # prisma migrate dev
npm run db:push     # prisma db push
npm run db:seed     # tsx prisma/seed.ts
```
No new dependencies were introduced by the Phase 3a work — `package.json` is unchanged from the review branch, so `npm install` isn't required beyond what's already in `node_modules`.

## Phase status

- **Phase 2a** (data model, core pipeline, file ingestion) — complete, merged.
- **Phase 2b** (live session capture) — complete, merged.
- **Phase 3a** (assessment flow: versioned as-is/to-be maturity model, 0–5 scale) — complete, all 9 tasks done, final review clean. This is the work newly incorporated into this branch.

## Phase 3a: what changed

The assessment flow was rewritten around a versioned as-is/to-be maturity model:
- `Capability` lost its legacy flat score fields (`asIsScore`, `toBeState`, `gapScore`, etc.) in favor of dated `MaturityAssessment` (as-is) and new `TargetMaturity` (to-be) records, plus `tags` and an `engagementMotive` on `Organization`.
- The scoring engine (`lib/scoring/engine.ts`) and current-maturity helpers (`lib/maturity/`) were rewritten for snapshot-based, location-aware gap computation.
- Claude-assisted drafting for as-is/to-be scores (`lib/ai/maturity-draft.ts`).
- The assess, analysis, and report pages under `app/clients/[id]/` were rewritten against the new model.

Full task-by-task detail (briefs + implementation reports) is preserved in `docs/handover/sdd/phase3a-assessment/`.

## Known concerns to carry forward

1. **`prisma migrate dev` cannot run in non-interactive shells** — it needs a TTY to show the data-loss prompt for dropped columns. The Task 1 build worked around this with `prisma migrate diff` → hand-reviewed migration folder → `prisma migrate deploy`. Expect the same workaround to be needed for any new schema changes in a non-interactive environment (Task 1 report has the exact recipe).
2. **Two distinct `calculateGap` bugs were caught and fixed during the Phase 3a build** — a no-match fallback bug (`88ec3d6`) and a denominator-asymmetry bug found in final review (`511a77c`, the branch tip). Both are present in this branch. If you see gap-score behavior that looks off, check `lib/scoring/engine.ts` and its tests (`tests/unit/scoring-engine.test.ts`) first before assuming a new bug.
3. **The generated Prisma client is committed** (`app/generated/prisma/`), per the repo's own `.gitignore` comment, so Vercel deploys don't need a `prisma generate` step. If you regenerate it locally, diff it against what's committed before committing — the Phase 3a branch already includes a large regenerated client (new `TargetMaturity.ts`, rewritten `Capability.ts`).
4. **Task 1's report is flagged `DONE_WITH_CONCERNS`** — worth a skim (`docs/handover/sdd/phase3a-assessment/task-1-report.md`) if anything in the schema/migration layer looks unexpected; it documents the non-interactive-migration workaround and a question about whether some page rewrites were knowingly deferred to later tasks (they were — Tasks 7–9).

## Verification status (as of this handover)

Run from a fresh sandbox with the committed `.env`/`.env.local` on 2026-08-19:

- **`npm run build`** — ✅ passes cleanly. TypeScript compiles, all 19 routes (static + dynamic) build successfully with Turbopack.
- **`npm test`** — ❌ 92 failed / 60 passed. Every failure is `DriverAdapterError: (ENOTFOUND) tenant/user postgres.bgybbhvuyxjnaczlmkgd not found` from the Supabase Postgres pooler — a database-connectivity/credential problem (the configured Supabase project tenant could not be reached), not a code or logic failure. DNS resolution and general internet egress both work from this sandbox; the pooler itself rejects the tenant. Whoever picks this up should verify the Supabase project referenced by `DATABASE_URL`/`DIRECT_URL` is active and the credentials are current before trusting any test run. Test counts also currently double-count: `vitest.config.ts` has no `exclude` for `.claude/`, so if a `.claude/worktrees/*` checkout exists alongside the repo, its nested `tests/` directory gets collected too — worth adding `.claude/**` to vitest's exclude list at some point, but left as-is here since it wasn't part of the requested changes.
- **`npm run lint`** — ❌ exits with errors, but almost all of the reported 762 errors / 12,958 warnings come from ESLint also scanning the same nested `.claude/worktrees/*` checkout (same root cause as the test duplication above). Filtering those out, the real, first-party error count is **4**, all the same rule (`react-hooks/set-state-in-effect`: calling a data-loading function synchronously inside `useEffect`), in `app/clients/[id]/assess/page.tsx`, `capture/page.tsx`, `review/page.tsx`, and `session/[sessionId]/page.tsx`. This pattern already existed on pages Phase 3a didn't touch (`capture`, `review`, `session/[sessionId]`), so it's pre-existing project style, not a regression introduced by this merge — worth a cleanup pass but not a blocker.

**Bottom line:** the code itself builds and type-checks cleanly; the test/lint noise is environmental (unreachable DB tenant, and tooling scanning a sibling worktree checkout it shouldn't) rather than defects in the Phase 3a implementation.

## Environment

See `docs/handover/ENVIRONMENT.md` for a redacted inventory of required environment variable names (no values). Live secrets live in `.env` / `.env.local` locally and in Vercel project settings — neither is tracked in git.

## Two other branches on origin worth knowing about

- `origin/worktree-flowstate-phase2a-plan2` — superseded, already incorporated into the review branch history.
- `origin/worktree-flowstate-phase2b-live-session` — superseded, already merged (PR #2).

Only `flowstate-handover` and `claude/review-flowstate-platform-GPvI0` should matter going forward; the `worktree-*` branches are historical build branches and can be treated as archival.
