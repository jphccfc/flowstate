### Task 6: Engagement motive on the client route

**Files:**
- Modify: `app/api/clients/[id]/route.ts` (`PATCH` only)
- Modify: `tests/schema/clients-route.test.ts` (adds `PATCH` coverage to Task 2's file)

**Interfaces:**
- Produces: `PATCH /api/clients/[id]` now accepts `engagementMotive` — Task 7's assess page (to-be drafting context) and a small settings affordance surface it, though no dedicated settings UI is required by this plan; the configure page already PATCHes this route pattern for other org fields historically, so no new page is required — `PATCH` support is sufficient for this plan's scope.

- [ ] **Step 1: Write the failing test**

Append to `tests/schema/clients-route.test.ts` (inside the existing `describe` block, after the two `GET` tests — add the `PATCH` import to the top-level import line and a new `it`):

Change the import line:
```typescript
import { GET as getClient, PATCH as patchClient } from "../../app/api/clients/[id]/route";
```

Add this test at the end of the `describe("GET /api/clients/[id]", ...)` block (rename the describe to `"clients/[id] route"` for clarity is optional; keep tests additive):

```typescript
  it("PATCH updates engagementMotive", async () => {
    const org = await createTestOrganization({ name: "Engagement Motive Test Org" });
    orgId = org.id;

    const res = await patchClient(
      new Request("http://localhost/api/clients/" + org.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementMotive: "Liquidation" }),
      }) as never,
      { params: Promise.resolve({ id: org.id }) }
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.engagementMotive).toBe("Liquidation");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- clients-route`
Expected: FAIL — `patchClient` import fails or `engagementMotive` isn't persisted (existing `PATCH` doesn't include it).

- [ ] **Step 3: Update the `PATCH` handler**

In `app/api/clients/[id]/route.ts`, update the `PATCH` function's `data` object:

```typescript
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const org = await prisma.organization.update({
    where: { id },
    data: {
      name: body.name,
      industry: body.industry,
      size: body.size,
      notes: body.notes,
      engagementMotive: body.engagementMotive,
    },
  });

  return NextResponse.json(org);
}
```

(The `GET` handler and its surrounding imports stay exactly as Task 2 left them.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- clients-route`
Expected: PASS (all cases in the file).

- [ ] **Step 5: Commit**

```bash
git add app/api/clients tests/schema/clients-route.test.ts
git commit -m "Accept engagementMotive on PATCH /api/clients/[id]"
```

---

