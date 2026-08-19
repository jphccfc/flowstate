# Task 6: Engagement Motive on PATCH /api/clients/[id]

## Summary
Successfully implemented TDD flow to add `engagementMotive` field to the PATCH handler for `/api/clients/[id]`. The field now persists through the database when updated.

## Implementation

### Files Modified
1. **`tests/schema/clients-route.test.ts`**
   - Added `PATCH as patchClient` to import statement (line 10)
   - Added new integration test "PATCH updates engagementMotive" (lines 60-75)
   
2. **`app/api/clients/[id]/route.ts`**
   - Added `engagementMotive: body.engagementMotive,` to PATCH handler's data object (line 80)

### Test-Driven Development Evidence

**RED Phase:**
- Ran `npm test -- clients-route` after adding the test
- Test failed with: `expected null to be 'Liquidation'`
- This confirmed the PATCH handler was not persisting `engagementMotive`

**GREEN Phase:**
- Updated PATCH handler's data object to include `engagementMotive: body.engagementMotive,`
- Ran `npm test -- clients-route` again
- All 3 tests passed (2 existing GET tests + 1 new PATCH test)

### Test Quality

The new test verifies actual database persistence:
- Creates a real test organization via `createTestOrganization()`
- Calls the real PATCH handler with `engagementMotive: "Liquidation"`
- Asserts that the returned response contains the persisted value
- This is a true integration test using Prisma, not an echo test

### Test Output
```
Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Commit

```
7c44145 Accept engagementMotive on PATCH /api/clients/[id]
```

## Self-Review Checklist

- [x] GET handler remains completely unchanged (lines 7-63 untouched)
- [x] New test verifies `engagementMotive` round-trips through real database
- [x] Test output is pristine (all 3 tests pass)
- [x] Only 2 files modified as specified
- [x] Only PATCH handler's data object received new line
- [x] TDD workflow followed (test first, RED → GREEN)
- [x] No concerns or warnings

## Result

Task complete. The `engagementMotive` field is now accepted and persisted by the PATCH endpoint. Ready for use by Task 7 (assess page) and configuration affordances.
