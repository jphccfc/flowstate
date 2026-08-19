# Task 4 Implementation Report: Per-Capability Assessment History

## Summary

Successfully implemented the `GET /api/capabilities/[id]/assessment-history` route following TDD methodology. The route returns current (latest) and full history of both as-is and to-be maturity scores for a capability.

## TDD Evidence

### RED Phase
- Created test file: `tests/schema/assessment-history-route.test.ts`
- Ran `npm test -- assessment-history-route`
- Result: FAILED (module not found - route didn't exist)

### GREEN Phase
- Created route file: `app/api/capabilities/[id]/assessment-history/route.ts`
- Ran `npm test -- assessment-history-route`
- Result: PASSED (2 tests)

## Files Implemented

### Route: `app/api/capabilities/[id]/assessment-history/route.ts`
- Authenticates user via Supabase
- Validates capability exists (returns 404 if not)
- Fetches 4 parallel queries:
  - `currentAsIs` via `getCurrentMaturity()`
  - `currentToBe` via `getCurrentTargetMaturity()`
  - `asIsHistory` full assessment history (desc by assessedAt)
  - `toBeHistory` full target history (desc by setAt)
- Returns JSON response with all four data arrays

### Test: `tests/schema/assessment-history-route.test.ts`
- Test 1: "returns current + full history for both as-is and to-be"
  - Creates org, domain, and capability
  - Seeds 2 maturityAssessment records and 1 targetMaturity record
  - Verifies response includes current records (arrays of length 1)
  - Verifies history arrays have correct lengths
  - Verifies newest-first ordering (score 2 before score 1)
- Test 2: "404s for a nonexistent capability"
  - Verifies proper 404 on invalid capability ID

## Self-Review Checklist

✅ **Does the route return current + full history for BOTH as-is and to-be?**
  - Yes. Route fetches and returns: `currentAsIs`, `currentToBe`, `asIsHistory`, `toBeHistory`

✅ **Is history ordered newest-first?**
  - Yes. Both queries use `orderBy: { desc }` on timestamp fields (assessedAt for as-is, setAt for to-be)

✅ **Does it 404 on a nonexistent capability?**
  - Yes. Line 17-18 checks `findUnique` result and returns 404 with error message

✅ **Is test output pristine?**
  - Yes. All 2 tests passed with no warnings or errors:
    ```
    Test Files  1 passed (1)
         Tests  2 passed (2)
    ```

## Commit

Commit SHA: `2eab2a5`
Commit message: "Add per-capability assessment history route"
Files changed: 2 (route + test)
Lines added: 82

## Dependencies Verified

- ✅ Uses existing `getCurrentMaturity()` from `lib/maturity/current.ts` (Task 1)
- ✅ Uses existing `getCurrentTargetMaturity()` from `lib/maturity/target.ts` (Task 2)
- ✅ Consumes Prisma schema models: `capability`, `maturityAssessment`, `targetMaturity`
- ✅ Proper async/await for `params` destructuring (Next.js 16 App Router)

## Integration Ready

This route is ready for consumption by Task 7 (assess page rewrite) which will call this endpoint to populate assessment history UI.

## Concerns

None. Implementation follows brief exactly, TDD was complete (RED → GREEN), and all self-review items pass.
