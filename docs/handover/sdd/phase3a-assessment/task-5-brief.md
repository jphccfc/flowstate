### Task 5: Claude-assisted as-is/to-be drafting

**Files:**
- Create: `lib/ai/maturity-draft.ts`
- Create: `app/api/capabilities/[id]/draft-as-is/route.ts`
- Create: `app/api/capabilities/[id]/draft-to-be/route.ts`
- Test: `tests/schema/maturity-draft-generator.test.ts`
- Test: `tests/schema/maturity-draft-routes.test.ts`

**Interfaces:**
- Produces: `draftAsIsScore(capabilityName: string, evidenceTexts: string[]): Promise<{ score: number; evidence: string }>`, `draftToBeScore(capabilityName: string, engagementMotive: string | null, kpiTargets: string[]): Promise<{ score: number; rationale: string }>` from `lib/ai/maturity-draft.ts`. `POST /api/capabilities/[id]/draft-as-is` (body `{ locationTag? }`, returns `{ score, evidence }`), `POST /api/capabilities/[id]/draft-to-be` (no body needed, returns `{ score, rationale }`) — Task 7 (assess page) calls both.

- [ ] **Step 1: Write the failing tests**

Create `tests/schema/maturity-draft-generator.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { draftAsIsScore, draftToBeScore } from "../../lib/ai/maturity-draft";

describe("draftAsIsScore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses a score and evidence from the Claude response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: JSON.stringify({ score: 2, evidence: "Manual, ad hoc process." }) }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await draftAsIsScore("Shift Scheduling", ["We schedule shifts on a whiteboard."]);
    expect(result).toEqual({ score: 2, evidence: "Manual, ad hoc process." });
    expect(mockFetch).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("We schedule shifts on a whiteboard.");
  });

  it("clamps an out-of-range score into 0-5", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: JSON.stringify({ score: 9, evidence: "x" }) }] }) }));
    const result = await draftAsIsScore("X", []);
    expect(result.score).toBe(5);
  });

  it("returns score 0 and empty evidence on unparseable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: "not json" }] }) }));
    expect(await draftAsIsScore("X", [])).toEqual({ score: 0, evidence: "" });
  });
});

describe("draftToBeScore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("includes engagement motive and KPI targets in the prompt", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: JSON.stringify({ score: 4, rationale: "Growth target." }) }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await draftToBeScore("Shift Scheduling", "Growth", ["On-time delivery: 95%"]);
    expect(result).toEqual({ score: 4, rationale: "Growth target." });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("Growth");
    expect(body.messages[0].content).toContain("On-time delivery: 95%");
  });

  it("returns score 0 and empty rationale on unparseable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: "not json" }] }) }));
    expect(await draftToBeScore("X", null, [])).toEqual({ score: 0, rationale: "" });
  });
});
```

Create `tests/schema/maturity-draft-routes.test.ts`:

```typescript
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { POST as draftAsIs } from "../../app/api/capabilities/[id]/draft-as-is/route";
import { POST as draftToBe } from "../../app/api/capabilities/[id]/draft-to-be/route";

describe("draft routes", () => {
  let orgId: string;

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("draft-as-is gathers approved tag evidence for the capability and returns a draft", async () => {
    const org = await createTestOrganization({ name: "Draft AsIs Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, type: "TEXT_NOTE", rawText: "Night shift scheduling is a mess.", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "Night shift scheduling is a mess." },
    });
    await prisma.tag.create({
      data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.9, status: "AUTO_APPROVED" },
    });
    // A PENDING_REVIEW tag on the same capability should be excluded
    const segment2 = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 1, text: "Unreviewed claim." },
    });
    await prisma.tag.create({
      data: { segmentId: segment2.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.4, status: "PENDING_REVIEW" },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: JSON.stringify({ score: 2, evidence: "Ad hoc scheduling." }) }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await draftAsIs(new Request("http://localhost/api/capabilities/" + capability.id + "/draft-as-is", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }) as never, { params: Promise.resolve({ id: capability.id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ score: 2, evidence: "Ad hoc scheduling." });

    const promptBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(promptBody.messages[0].content).toContain("Night shift scheduling is a mess.");
    expect(promptBody.messages[0].content).not.toContain("Unreviewed claim.");
  });

  it("draft-to-be includes engagementMotive and KPI targets from the capability's relations", async () => {
    const org = await createTestOrganization({ name: "Draft ToBe Test Org" });
    orgId = org.id;
    await prisma.organization.update({ where: { id: org.id }, data: { engagementMotive: "Acquisition Recovery" } });
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });
    const kpi = await prisma.kPI.create({ data: { organizationId: org.id, name: "On-time delivery", targetValue: "95%" } });
    await prisma.capabilityKPI.create({ data: { capabilityId: capability.id, kpiId: kpi.id } });

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: JSON.stringify({ score: 4, rationale: "Deal-driven target." }) }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await draftToBe(new Request("http://localhost/api/capabilities/" + capability.id + "/draft-to-be", { method: "POST" }) as never, {
      params: Promise.resolve({ id: capability.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ score: 4, rationale: "Deal-driven target." });

    const promptBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(promptBody.messages[0].content).toContain("Acquisition Recovery");
    expect(promptBody.messages[0].content).toContain("On-time delivery: 95%");
  });

  it("404s for a nonexistent capability on both routes", async () => {
    const resA = await draftAsIs(new Request("http://localhost/x", { method: "POST", body: "{}" }) as never, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(resA.status).toBe(404);

    const resB = await draftToBe(new Request("http://localhost/x", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(resB.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- maturity-draft-generator maturity-draft-routes`
Expected: FAIL — `lib/ai/maturity-draft.ts` and both routes don't exist.

- [ ] **Step 3: Create `lib/ai/maturity-draft.ts`**

```typescript
export async function draftAsIsScore(
  capabilityName: string,
  evidenceTexts: string[]
): Promise<{ score: number; evidence: string }> {
  const evidenceList =
    evidenceTexts.length > 0 ? evidenceTexts.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(no evidence captured yet)";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are drafting a current-state (as-is) maturity score for a business capability, on a 0-5 scale (0 = does not exist / entirely ad hoc, 5 = best-in-class, fully optimized and measured).

Capability: "${capabilityName}"

Evidence gathered from interviews/documents:
${evidenceList}

Return a JSON object with exactly these fields: score (integer 0-5), evidence (a short 1-3 sentence summary of why, grounded in the evidence above). If there's no evidence, return score 0 and evidence explaining nothing has been captured yet.`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { score: 0, evidence: "" };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(5, Math.round(Number(parsed.score) || 0)));
    return { score, evidence: typeof parsed.evidence === "string" ? parsed.evidence : "" };
  } catch {
    return { score: 0, evidence: "" };
  }
}

export async function draftToBeScore(
  capabilityName: string,
  engagementMotive: string | null,
  kpiTargets: string[]
): Promise<{ score: number; rationale: string }> {
  const motiveText = engagementMotive ?? "(not specified)";
  const kpiList = kpiTargets.length > 0 ? kpiTargets.join("\n") : "(no KPI targets captured yet)";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are drafting a target (to-be) maturity score for a business capability, on a 0-5 scale (0 = does not exist, 5 = best-in-class). This is a suggested starting point for a stakeholder to confirm or override — not a final answer.

Capability: "${capabilityName}"
Engagement motive: ${motiveText}
Related KPI targets: ${kpiList}

Return a JSON object with exactly these fields: score (integer 0-5), rationale (a short 1-2 sentence justification referencing the engagement motive and/or KPI targets where relevant).`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { score: 0, rationale: "" };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(5, Math.round(Number(parsed.score) || 0)));
    return { score, rationale: typeof parsed.rationale === "string" ? parsed.rationale : "" };
  } catch {
    return { score: 0, rationale: "" };
  }
}
```

- [ ] **Step 4: Create `app/api/capabilities/[id]/draft-as-is/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { draftAsIsScore } from "@/lib/ai/maturity-draft";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const locationTag: string | null = body.locationTag ?? null;

  const capability = await prisma.capability.findUnique({ where: { id } });
  if (!capability) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tags = await prisma.tag.findMany({
    where: {
      targetType: "CAPABILITY",
      targetId: id,
      status: { in: ["AUTO_APPROVED", "APPROVED"] },
      ...(locationTag ? { segment: { capturedInput: { locationTag } } } : {}),
    },
    include: { segment: true },
  });

  const evidenceTexts = tags.map((t) => t.segment.text);
  const draft = await draftAsIsScore(capability.name, evidenceTexts);

  return NextResponse.json(draft);
}
```

- [ ] **Step 5: Create `app/api/capabilities/[id]/draft-to-be/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { draftToBeScore } from "@/lib/ai/maturity-draft";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const capability = await prisma.capability.findUnique({
    where: { id },
    include: { domain: { include: { organization: true } }, kpis: { include: { kpi: true } } },
  });
  if (!capability) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const kpiTargets = capability.kpis
    .map((ck) => ck.kpi)
    .filter((kpi) => kpi.targetValue)
    .map((kpi) => `${kpi.name}: ${kpi.targetValue}`);

  const draft = await draftToBeScore(capability.name, capability.domain.organization.engagementMotive, kpiTargets);

  return NextResponse.json(draft);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- maturity-draft-generator maturity-draft-routes`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add lib/ai/maturity-draft.ts app/api/capabilities/\[id\]/draft-as-is app/api/capabilities/\[id\]/draft-to-be tests/schema/maturity-draft-generator.test.ts tests/schema/maturity-draft-routes.test.ts
git commit -m "Add Claude-assisted as-is/to-be maturity score drafting"
```

---

