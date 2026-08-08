# Flow State Phase 2a Plan 1: Core Ingestion Pipeline + Text-Based Capture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the end-to-end capture → segment → tag → review pipeline for `TEXT_NOTE` and `EMAIL` (pasted) input types, with API routes and UI pages, so an advisor can paste a note or email and see it segmented, auto-tagged, and queued for review — no audio/document/inbound-email infrastructure needed yet.

**Architecture:** A capture API route creates a `CapturedInput` row and schedules background processing via Next.js `after()` (no cron, no queue polling). The background chain segments the text (plain paragraph-split, no AI needed) and tags each segment via a new Claude call (extending the existing raw-fetch pattern in `lib/ai/`), auto-approving tags ≥0.85 confidence and queuing the rest for human review on a dedicated review page.

**Tech Stack:** Next.js 16 App Router route handlers, Prisma 7 (models already exist from the Phase 1 data-model plan), Vitest integration tests against real Supabase Postgres, Claude API via raw `fetch` (matching `lib/ai/index.ts`'s existing pattern — no new SDK dependency).

## Global Constraints

- `ANTHROPIC_API_KEY` is not yet set in Vercel (confirmed via `vercel env ls` during brainstorming). Tests in this plan mock the Claude `fetch` call and do not need a real key. The key must be obtained from the user and set in Vercel before this pipeline can run against the real Claude API in dev/production — this is a deployment prerequisite, not a blocker for writing or testing the code in this plan.
- Every API route follows the existing pattern exactly: `import { prisma } from "@/lib/db"`, `import { createClient } from "@/lib/supabase/server"`, check `const { data: { user } } = await supabase.auth.getUser()` and return 401 if absent, before doing anything else. Copy this from `app/api/capabilities/route.ts`.
- Route paths are flat (`/api/captured-inputs`, `/api/tags`), matching the existing convention (`/api/capabilities`, `/api/kpis`) — not nested under `/api/clients/[id]/...`.
- UI pages match the existing raw-Tailwind + CSS-variable convention used by `app/clients/[id]/assess/page.tsx` (`"use client"`, `useState`/`useEffect`/`use(params)`, classes like `bg-[var(--card)]`, `border-[var(--card-border)]`, `text-[var(--muted)]`, `.score-pill`) — this codebase does not have shadcn/ui components installed (no `components.json`), only the underlying Radix/cva dependencies; do not introduce shadcn scaffolding.
- No new AI SDK dependency — extend the existing raw-`fetch`-to-Anthropic pattern from `lib/ai/index.ts`'s `ClaudeProvider`, in new sibling files, not by modifying `lib/ai/index.ts` itself.
- Auto-approve confidence threshold: `0.85`, exactly matching the Phase 1 design spec.
- All new models used here (`CapturedInput`, `CapturedSegment`, `Tag`, `ProcessingJob`) already exist in `prisma/schema.prisma` from the merged Phase 1 data-model plan — this plan does not modify the schema.
- Tests: integration tests against the real Supabase Postgres database (no DB mocks, matching the Phase 1 convention in `tests/helpers/db.ts`) for all data-flow logic. The Claude `fetch` call is mocked in tests (real external AI APIs are not hit in automated tests). No automated UI tests exist anywhere in this codebase yet — UI tasks are verified manually via `npm run dev` + browser, matching existing practice.

---

## File Structure

- `lib/ai/tagging.ts` — new. Pure-ish function `generateTagSuggestions()` that calls Claude via `fetch` and returns structured tag suggestions. Mockable by stubbing global `fetch`.
- `lib/ai/segmenting.ts` — new. Pure function `segmentText()`, no AI, no I/O — paragraph-based text splitting.
- `lib/ingestion/pipeline.ts` — new. Orchestrates the background chain (`processCapturedInput()`): segment → tag, creating `ProcessingJob` rows for status tracking, using the two files above plus Prisma.
- `app/api/captured-inputs/route.ts` — new. `POST` (create + schedule background processing), `GET` (list by organization, for the capture page's status list).
- `app/api/captured-inputs/[id]/route.ts` — new. `GET` single input (used for polling, though the list endpoint covers the UI's actual need — included for completeness and direct-link use).
- `app/api/tags/route.ts` — new. `GET` pending-review tags for an organization, with resolved target names and reassignment candidates.
- `app/api/tags/[id]/route.ts` — new. `PATCH` approve/reject/reassign.
- `app/clients/[id]/capture/page.tsx` — new. Capture form (Text Note / Email) + recent-captures status list.
- `app/clients/[id]/review/page.tsx` — new. Pending-tag review queue with approve/reject/reassign.

---

### Task 1: Tag suggestion generator (`lib/ai/tagging.ts`)

**Files:**
- Create: `lib/ai/tagging.ts`
- Test: `tests/schema/tagging-generator.test.ts`

**Interfaces:**
- Produces: `TaggableEntity = { targetType: "DOMAIN" | "CAPABILITY" | "KPI" | "STAKEHOLDER"; targetId: string; name: string }`, `TagSuggestion = { targetType: "DOMAIN" | "CAPABILITY" | "KPI" | "STAKEHOLDER"; targetId: string; confidence: number }`, and `generateTagSuggestions(segmentText: string, candidates: TaggableEntity[]): Promise<TagSuggestion[]>`. Task 3 imports all three from `@/lib/ai/tagging`.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/tagging-generator.test.ts`:
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTagSuggestions, type TaggableEntity } from "../../lib/ai/tagging";

describe("generateTagSuggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns suggestions matched against the candidate list, dropping hallucinated ids", async () => {
    const candidates: TaggableEntity[] = [
      { targetType: "CAPABILITY", targetId: "cap-1", name: "Shift Scheduling" },
      { targetType: "KPI", targetId: "kpi-1", name: "On-time Delivery Rate" },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        content: [
          {
            text: JSON.stringify([
              { targetId: "cap-1", confidence: 0.92 },
              { targetId: "not-a-real-id", confidence: 0.7 },
            ]),
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateTagSuggestions(
      "Night shift scheduling is a mess.",
      candidates
    );

    expect(result).toEqual([
      { targetType: "CAPABILITY", targetId: "cap-1", confidence: 0.92 },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns an empty array when there are no candidates", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateTagSuggestions("Some text.", []);

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tagging-generator`
Expected: FAIL — `Cannot find module '../../lib/ai/tagging'`.

- [ ] **Step 3: Write the implementation**

Create `lib/ai/tagging.ts`:
```typescript
export type TaggableEntity = {
  targetType: "DOMAIN" | "CAPABILITY" | "KPI" | "STAKEHOLDER";
  targetId: string;
  name: string;
};

export type TagSuggestion = {
  targetType: "DOMAIN" | "CAPABILITY" | "KPI" | "STAKEHOLDER";
  targetId: string;
  confidence: number;
};

export async function generateTagSuggestions(
  segmentText: string,
  candidates: TaggableEntity[]
): Promise<TagSuggestion[]> {
  if (candidates.length === 0) return [];

  const candidateList = candidates
    .map((c) => `${c.targetId}: ${c.name} (${c.targetType})`)
    .join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are tagging a segment of an interview transcript or document against a fixed list of candidate entities. Only suggest entities that are genuinely relevant to the segment text.

Segment:
"${segmentText}"

Candidates (id: name (type)):
${candidateList}

Return a JSON array of objects with exactly these fields: targetId (must be one of the candidate ids above, verbatim), confidence (0 to 1, how confident you are this segment relates to that entity). Only include entities with confidence >= 0.3. Return [] if nothing is relevant.`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "[]";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let raw: { targetId: string; confidence: number }[];
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  const candidateById = new Map(candidates.map((c) => [c.targetId, c]));
  const suggestions: TagSuggestion[] = [];
  for (const item of raw) {
    const candidate = candidateById.get(item.targetId);
    if (!candidate) continue;
    suggestions.push({
      targetType: candidate.targetType,
      targetId: candidate.targetId,
      confidence: item.confidence,
    });
  }
  return suggestions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tagging-generator`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/tagging.ts tests/schema/tagging-generator.test.ts
git commit -m "Add Claude-backed tag suggestion generator"
```

---

### Task 2: Text segmenting utility (`lib/ai/segmenting.ts`)

**Files:**
- Create: `lib/ai/segmenting.ts`
- Test: `tests/schema/segmenting.test.ts`

**Interfaces:**
- Produces: `RawSegment = { order: number; text: string }` and `segmentText(rawText: string): RawSegment[]`. Task 3 imports both from `@/lib/ai/segmenting`.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/segmenting.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { segmentText } from "../../lib/ai/segmenting";

describe("segmentText", () => {
  it("splits text into ordered segments on blank lines, trimming whitespace", () => {
    const raw = "First paragraph.\n\nSecond paragraph.\n\n\nThird paragraph.";
    expect(segmentText(raw)).toEqual([
      { order: 0, text: "First paragraph." },
      { order: 1, text: "Second paragraph." },
      { order: 2, text: "Third paragraph." },
    ]);
  });

  it("drops empty segments and returns a single segment for text with no blank lines", () => {
    expect(segmentText("Just one line of text.")).toEqual([
      { order: 0, text: "Just one line of text." },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(segmentText("")).toEqual([]);
    expect(segmentText("   \n\n   ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- segmenting`
Expected: FAIL — `Cannot find module '../../lib/ai/segmenting'`.

- [ ] **Step 3: Write the implementation**

Create `lib/ai/segmenting.ts`:
```typescript
export type RawSegment = {
  order: number;
  text: string;
};

export function segmentText(rawText: string): RawSegment[] {
  return rawText
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((text, order) => ({ order, text }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- segmenting`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/segmenting.ts tests/schema/segmenting.test.ts
git commit -m "Add paragraph-based text segmenting utility"
```

---

### Task 3: Ingestion pipeline orchestrator (`lib/ingestion/pipeline.ts`)

**Files:**
- Create: `lib/ingestion/pipeline.ts`
- Test: `tests/schema/pipeline.test.ts`

**Interfaces:**
- Consumes: `segmentText` from `@/lib/ai/segmenting` (Task 2); `generateTagSuggestions`, `TaggableEntity` from `@/lib/ai/tagging` (Task 1); `prisma` from `@/lib/db`.
- Produces: `processCapturedInput(capturedInputId: string): Promise<void>`. Task 4's `POST /api/captured-inputs` calls this via `after()`.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/pipeline.test.ts`:
```typescript
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";
import { processCapturedInput } from "../../lib/ingestion/pipeline";

describe("processCapturedInput", () => {
  let orgId: string;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("segments and tags a text CapturedInput end to end against real data, auto-approving high-confidence tags", async () => {
    const org = await createTestOrganization({ name: "Pipeline Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Shift Scheduling" },
    });

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        type: "TEXT_NOTE",
        rawText: "Night shift scheduling is a mess.\n\nUnrelated paragraph about lunch.",
        status: "TRANSCRIBED",
      },
    });

    const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      const segmentText: string = body.messages[0].content;
      const isSchedulingSegment = segmentText.includes("scheduling");
      return {
        json: async () => ({
          content: [
            {
              text: JSON.stringify(
                isSchedulingSegment
                  ? [{ targetId: capability.id, confidence: 0.92 }]
                  : []
              ),
            },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    await processCapturedInput(input.id);

    const updatedInput = await prisma.capturedInput.findUniqueOrThrow({ where: { id: input.id } });
    expect(updatedInput.status).toBe("TAGGED");

    const segments = await prisma.capturedSegment.findMany({
      where: { capturedInputId: input.id },
      orderBy: { order: "asc" },
    });
    expect(segments).toHaveLength(2);

    const tags = await prisma.tag.findMany({ where: { segmentId: { in: segments.map((s) => s.id) } } });
    expect(tags).toHaveLength(1);
    expect(tags[0].targetId).toBe(capability.id);
    expect(tags[0].status).toBe("AUTO_APPROVED");

    const jobs = await prisma.processingJob.findMany({ where: { targetId: input.id }, orderBy: { createdAt: "asc" } });
    expect(jobs.map((j) => j.type)).toEqual(["segment", "tag"]);
    expect(jobs.every((j) => j.status === "DONE")).toBe(true);
  });

  it("marks the input FAILED and records the error when tagging throws", async () => {
    const org = await createTestOrganization({ name: "Pipeline Failure Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        type: "TEXT_NOTE",
        rawText: "Some text that will fail to tag.",
        status: "TRANSCRIBED",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Claude API unavailable"))
    );

    await expect(processCapturedInput(input.id)).rejects.toThrow("Claude API unavailable");

    const updatedInput = await prisma.capturedInput.findUniqueOrThrow({ where: { id: input.id } });
    expect(updatedInput.status).toBe("FAILED");
    expect(updatedInput.error).toContain("Claude API unavailable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pipeline`
Expected: FAIL — `Cannot find module '../../lib/ingestion/pipeline'`.

- [ ] **Step 3: Write the implementation**

Create `lib/ingestion/pipeline.ts`:
```typescript
import { prisma } from "@/lib/db";
import { segmentText } from "@/lib/ai/segmenting";
import { generateTagSuggestions, type TaggableEntity } from "@/lib/ai/tagging";

const AUTO_APPROVE_THRESHOLD = 0.85;

export async function processCapturedInput(capturedInputId: string): Promise<void> {
  const input = await prisma.capturedInput.findUniqueOrThrow({
    where: { id: capturedInputId },
  });

  try {
    const segments = await runJob("segment", capturedInputId, async () => {
      await prisma.capturedInput.update({
        where: { id: capturedInputId },
        data: { status: "SEGMENTING" },
      });

      const rawSegments = segmentText(input.rawText ?? "");
      return Promise.all(
        rawSegments.map((s) =>
          prisma.capturedSegment.create({
            data: { capturedInputId, order: s.order, text: s.text },
          })
        )
      );
    });

    await runJob("tag", capturedInputId, async () => {
      await prisma.capturedInput.update({
        where: { id: capturedInputId },
        data: { status: "TAGGING" },
      });

      const candidates = await getTaggableEntities(input.organizationId);

      for (const segment of segments) {
        const suggestions = await generateTagSuggestions(segment.text, candidates);
        for (const suggestion of suggestions) {
          await prisma.tag.create({
            data: {
              segmentId: segment.id,
              targetType: suggestion.targetType,
              targetId: suggestion.targetId,
              confidence: suggestion.confidence,
              status:
                suggestion.confidence >= AUTO_APPROVE_THRESHOLD
                  ? "AUTO_APPROVED"
                  : "PENDING_REVIEW",
            },
          });
        }
      }
    });

    await prisma.capturedInput.update({
      where: { id: capturedInputId },
      data: { status: "TAGGED" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.capturedInput.update({
      where: { id: capturedInputId },
      data: { status: "FAILED", error: message },
    });
    throw err;
  }
}

async function runJob<T>(
  type: string,
  targetId: string,
  fn: () => Promise<T>
): Promise<T> {
  const job = await prisma.processingJob.create({
    data: { type, targetId, status: "RUNNING", attempts: 1 },
  });
  try {
    const result = await fn();
    await prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "DONE" },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: message },
    });
    throw err;
  }
}

async function getTaggableEntities(organizationId: string): Promise<TaggableEntity[]> {
  const [domains, kpis, stakeholders] = await Promise.all([
    prisma.businessDomain.findMany({
      where: { organizationId },
      include: { capabilities: true },
    }),
    prisma.kPI.findMany({ where: { organizationId } }),
    prisma.stakeholder.findMany({ where: { organizationId } }),
  ]);

  const entities: TaggableEntity[] = [];
  for (const domain of domains) {
    entities.push({ targetType: "DOMAIN", targetId: domain.id, name: domain.name });
    for (const capability of domain.capabilities) {
      entities.push({ targetType: "CAPABILITY", targetId: capability.id, name: capability.name });
    }
  }
  for (const kpi of kpis) {
    entities.push({ targetType: "KPI", targetId: kpi.id, name: kpi.name });
  }
  for (const stakeholder of stakeholders) {
    entities.push({ targetType: "STAKEHOLDER", targetId: stakeholder.id, name: stakeholder.name });
  }
  return entities;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pipeline`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/pipeline.ts tests/schema/pipeline.test.ts
git commit -m "Add ingestion pipeline orchestrator: segment, tag, track ProcessingJob status"
```

---

### Task 4: Capture API routes

**Files:**
- Create: `app/api/captured-inputs/route.ts`
- Create: `app/api/captured-inputs/[id]/route.ts`
- Test: `tests/schema/captured-inputs-route.test.ts`

**Interfaces:**
- Consumes: `processCapturedInput` from `@/lib/ingestion/pipeline` (Task 3); `prisma` from `@/lib/db`; `createClient` from `@/lib/supabase/server`.
- Produces: `POST /api/captured-inputs` (body: `{ organizationId, type, rawText, locationTag? }`, returns 201 + the created `CapturedInput`), `GET /api/captured-inputs?organizationId=...` (returns array of `CapturedInput`), `GET /api/captured-inputs/[id]` (returns single `CapturedInput` or 404). Task 6 (capture UI) calls these.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/captured-inputs-route.test.ts`:
```typescript
import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => fn() };
});

import { GET as listInputs, POST as createInput } from "../../app/api/captured-inputs/route";
import { GET as getInput } from "../../app/api/captured-inputs/[id]/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/captured-inputs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("captured-inputs routes", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates a TEXT_NOTE input and lists/gets it back (after() is stubbed so the background pipeline is invoked, but this test only asserts fields set synchronously at creation — not on pipeline completion, which Task 3's tests cover directly)", async () => {
    const org = await createTestOrganization({ name: "Route Test Org" });
    orgId = org.id;

    const createRes = await createInput(
      makeRequest({ organizationId: org.id, type: "TEXT_NOTE", rawText: "A short note." })
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.type).toBe("TEXT_NOTE");
    expect(created.status).toBe("TRANSCRIBED");

    const listReq = new Request(`http://localhost/api/captured-inputs?organizationId=${org.id}`) as never;
    const listRes = await listInputs(listReq);
    const list = await listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);

    const getRes = await getInput(new Request("http://localhost/api/captured-inputs/" + created.id) as never, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(getRes.status).toBe(200);
    const single = await getRes.json();
    expect(single.id).toBe(created.id);
  });

  it("rejects an unsupported type with 400", async () => {
    const org = await createTestOrganization({ name: "Route Reject Test Org" });
    orgId = org.id;

    const res = await createInput(
      makeRequest({ organizationId: org.id, type: "AUDIO", rawText: "n/a" })
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- captured-inputs-route`
Expected: FAIL — `Cannot find module '../../app/api/captured-inputs/route'`.

- [ ] **Step 3: Write the implementation**

Create `app/api/captured-inputs/route.ts`:
```typescript
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { processCapturedInput } from "@/lib/ingestion/pipeline";

const SUPPORTED_TYPES = new Set(["TEXT_NOTE", "EMAIL"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { organizationId, type, rawText, locationTag } = body;

  if (!organizationId || !type) {
    return NextResponse.json({ error: "organizationId and type are required" }, { status: 400 });
  }
  if (!SUPPORTED_TYPES.has(type)) {
    return NextResponse.json({ error: `Unsupported type: ${type}` }, { status: 400 });
  }
  if (!rawText?.trim()) {
    return NextResponse.json({ error: "rawText is required" }, { status: 400 });
  }

  const capturedInput = await prisma.capturedInput.create({
    data: {
      organizationId,
      type,
      rawText,
      locationTag: locationTag || null,
      status: "TRANSCRIBED",
    },
  });

  after(() => processCapturedInput(capturedInput.id));

  return NextResponse.json(capturedInput, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const inputs = await prisma.capturedInput.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(inputs);
}
```

Create `app/api/captured-inputs/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const input = await prisma.capturedInput.findUnique({ where: { id } });
  if (!input) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- captured-inputs-route`
Expected: PASS (2 tests). Note: this test exercises the real pipeline (real DB, mocked Claude `fetch` is NOT set up here since the test doesn't stub `fetch` — the "A short note." input has no capabilities to tag against in a fresh org, so `getTaggableEntities` returns `[]` and `generateTagSuggestions` short-circuits before calling `fetch` at all per Task 1's Step 3 implementation, keeping this test network-free without needing an explicit stub).

- [ ] **Step 5: Commit**

```bash
git add app/api/captured-inputs tests/schema/captured-inputs-route.test.ts
git commit -m "Add capture API routes: create/list/get CapturedInput"
```

---

### Task 5: Tag review API routes

**Files:**
- Create: `app/api/tags/route.ts`
- Create: `app/api/tags/[id]/route.ts`
- Test: `tests/schema/tags-route.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`; `createClient` from `@/lib/supabase/server`.
- Produces: `GET /api/tags?organizationId=...` (returns array of `{ id, targetType, targetId, targetName, confidence, segment: { text }, candidates: { id, name }[] }`, only `PENDING_REVIEW` tags), `PATCH /api/tags/[id]` (body: `{ action: "approve" | "reject" | "reassign", targetId? }`, returns updated `Tag`). Task 7 (review UI) calls these.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/tags-route.test.ts`:
```typescript
import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { GET as listTags } from "../../app/api/tags/route";
import { PATCH as patchTag } from "../../app/api/tags/[id]/route";

describe("tags routes", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("lists pending-review tags with resolved names and same-type reassign candidates, then approves one", async () => {
    const org = await createTestOrganization({ name: "Tags Route Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capA = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });
    const capB = await prisma.capability.create({ data: { domainId: domain.id, name: "Quality Management" } });

    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, type: "TEXT_NOTE", rawText: "text", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "Night shift scheduling is a mess." },
    });
    const tag = await prisma.tag.create({
      data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capA.id, confidence: 0.6, status: "PENDING_REVIEW" },
    });

    const listReq = new Request(`http://localhost/api/tags?organizationId=${org.id}`) as never;
    const listRes = await listTags(listReq);
    const list = await listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].targetName).toBe("Shift Scheduling");
    expect(list[0].candidates.map((c: { id: string }) => c.id).sort()).toEqual([capA.id, capB.id].sort());

    const approveRes = await patchTag(
      new Request("http://localhost/api/tags/" + tag.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "approve" }),
      }) as never,
      { params: Promise.resolve({ id: tag.id }) }
    );
    expect(approveRes.status).toBe(200);
    const approved = await approveRes.json();
    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedBy).toBe("advisor@test.com");
  });

  it("reassigns a tag to a different targetId of the same type", async () => {
    const org = await createTestOrganization({ name: "Tags Reassign Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capA = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });
    const capB = await prisma.capability.create({ data: { domainId: domain.id, name: "Quality Management" } });

    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, type: "TEXT_NOTE", rawText: "text", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "Quality issue on the line." },
    });
    const tag = await prisma.tag.create({
      data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capA.id, confidence: 0.5, status: "PENDING_REVIEW" },
    });

    const res = await patchTag(
      new Request("http://localhost/api/tags/" + tag.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "reassign", targetId: capB.id }),
      }) as never,
      { params: Promise.resolve({ id: tag.id }) }
    );
    const updated = await res.json();
    expect(updated.status).toBe("REASSIGNED");
    expect(updated.targetId).toBe(capB.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tags-route`
Expected: FAIL — `Cannot find module '../../app/api/tags/route'`.

- [ ] **Step 3: Write the implementation**

Create `app/api/tags/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

type CandidateType = "DOMAIN" | "CAPABILITY" | "KPI" | "STAKEHOLDER";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const [tags, domains, kpis, stakeholders] = await Promise.all([
    prisma.tag.findMany({
      where: { status: "PENDING_REVIEW", segment: { capturedInput: { organizationId } } },
      include: { segment: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.businessDomain.findMany({ where: { organizationId }, include: { capabilities: true } }),
    prisma.kPI.findMany({ where: { organizationId } }),
    prisma.stakeholder.findMany({ where: { organizationId } }),
  ]);

  const nameById = new Map<string, string>();
  const candidatesByType: Record<CandidateType, { id: string; name: string }[]> = {
    DOMAIN: [],
    CAPABILITY: [],
    KPI: [],
    STAKEHOLDER: [],
  };
  for (const domain of domains) {
    nameById.set(domain.id, domain.name);
    candidatesByType.DOMAIN.push({ id: domain.id, name: domain.name });
    for (const capability of domain.capabilities) {
      nameById.set(capability.id, capability.name);
      candidatesByType.CAPABILITY.push({ id: capability.id, name: capability.name });
    }
  }
  for (const kpi of kpis) {
    nameById.set(kpi.id, kpi.name);
    candidatesByType.KPI.push({ id: kpi.id, name: kpi.name });
  }
  for (const stakeholder of stakeholders) {
    nameById.set(stakeholder.id, stakeholder.name);
    candidatesByType.STAKEHOLDER.push({ id: stakeholder.id, name: stakeholder.name });
  }

  const result = tags.map((tag) => ({
    id: tag.id,
    targetType: tag.targetType,
    targetId: tag.targetId,
    targetName: nameById.get(tag.targetId) ?? "(unknown)",
    confidence: tag.confidence,
    segment: { text: tag.segment.text },
    candidates: candidatesByType[tag.targetType as CandidateType] ?? [],
  }));

  return NextResponse.json(result);
}
```

Create `app/api/tags/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

const STATUS_BY_ACTION = {
  approve: "APPROVED",
  reject: "REJECTED",
  reassign: "REASSIGNED",
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action, targetId } = body as { action: keyof typeof STATUS_BY_ACTION; targetId?: string };

  if (!(action in STATUS_BY_ACTION)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (action === "reassign" && !targetId) {
    return NextResponse.json({ error: "targetId is required for reassign" }, { status: 400 });
  }

  const tag = await prisma.tag.update({
    where: { id },
    data: {
      status: STATUS_BY_ACTION[action],
      reviewedBy: user.email ?? user.id,
      reviewedAt: new Date(),
      ...(action === "reassign" ? { targetId } : {}),
    },
  });

  return NextResponse.json(tag);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tags-route`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/tags tests/schema/tags-route.test.ts
git commit -m "Add tag review API routes: list pending, approve/reject/reassign"
```

---

### Task 6: Capture UI page

**Files:**
- Create: `app/clients/[id]/capture/page.tsx`

**Interfaces:**
- Consumes: `POST /api/captured-inputs`, `GET /api/captured-inputs?organizationId=...` (Task 4).
- Produces: nothing consumed by later tasks — leaf UI page.

- [ ] **Step 1: Write the page**

Create `app/clients/[id]/capture/page.tsx`:
```tsx
"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";

type CapturedInput = {
  id: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: string;
};

export default function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [type, setType] = useState<"TEXT_NOTE" | "EMAIL">("TEXT_NOTE");
  const [rawText, setRawText] = useState("");
  const [locationTag, setLocationTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inputs, setInputs] = useState<CapturedInput[]>([]);

  const loadInputs = useCallback(async () => {
    const res = await fetch(`/api/captured-inputs?organizationId=${organizationId}`);
    if (res.ok) setInputs(await res.json());
  }, [organizationId]);

  useEffect(() => {
    loadInputs();
    const interval = setInterval(loadInputs, 3000);
    return () => clearInterval(interval);
  }, [loadInputs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rawText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/captured-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, type, rawText, locationTag: locationTag || undefined }),
      });
      if (res.ok) {
        setRawText("");
        loadInputs();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4">
        <Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">
          &larr; Back to client
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">Capture</h1>

      <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 mb-8">
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "TEXT_NOTE" | "EMAIL")}
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm"
          >
            <option value="TEXT_NOTE">Text Note</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">Location (optional)</label>
          <input
            type="text"
            value={locationTag}
            onChange={(e) => setLocationTag(e.target.value)}
            placeholder="e.g. Alexandria, Brampton"
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm w-full"
          />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">
            {type === "EMAIL" ? "Email content (sender, subject, body)" : "Note"}
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm w-full"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !rawText.trim()}
          className="bg-[var(--accent)] text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Capture"}
        </button>
      </form>

      <h2 className="text-lg font-semibold mb-3">Recent captures</h2>
      <div className="space-y-2">
        {inputs.map((input) => (
          <div
            key={input.id}
            className="flex items-center justify-between bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
          >
            <span>{input.type}</span>
            <span className="text-[var(--muted)]">{new Date(input.createdAt).toLocaleString()}</span>
            <StatusPill status={input.status} error={input.error} />
          </div>
        ))}
        {inputs.length === 0 && <p className="text-sm text-[var(--muted)]">No captures yet.</p>}
      </div>
    </div>
  );
}

function StatusPill({ status, error }: { status: string; error: string | null }) {
  const background = status === "TAGGED" ? "#bbf7d0" : status === "FAILED" ? "#fee2e2" : "#fef9c3";
  const color = status === "TAGGED" ? "#14532d" : status === "FAILED" ? "#991b1b" : "#854d0e";
  return (
    <span className="score-pill text-xs font-bold" style={{ background, color }} title={error ?? undefined}>
      {status}
    </span>
  );
}
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev`, then in a browser visit `/clients/<an-existing-org-id>/capture` (use an org id from `npm run db:seed`'s output, or query one via `psql`/Prisma Studio).
Expected: the form renders, submitting a Text Note creates a row in "Recent captures" showing status transitioning from `TRANSCRIBED` → `SEGMENTING` → `TAGGING` → `TAGGED` (or `FAILED` with the error visible on hover, if `ANTHROPIC_API_KEY` isn't set yet in local `.env` — expected until that key is provisioned, per Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add app/clients/\[id\]/capture/page.tsx
git commit -m "Add capture page: text note / email form with live status list"
```

---

### Task 7: Review UI page

**Files:**
- Create: `app/clients/[id]/review/page.tsx`

**Interfaces:**
- Consumes: `GET /api/tags?organizationId=...`, `PATCH /api/tags/[id]` (Task 5).
- Produces: nothing consumed by later tasks — leaf UI page. Last task in this plan.

- [ ] **Step 1: Write the page**

Create `app/clients/[id]/review/page.tsx`:
```tsx
"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";

type Candidate = { id: string; name: string };

type PendingTag = {
  id: string;
  targetType: string;
  targetId: string;
  targetName: string;
  confidence: number;
  segment: { text: string };
  candidates: Candidate[];
};

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [tags, setTags] = useState<PendingTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassignChoice, setReassignChoice] = useState<Record<string, string>>({});

  const loadTags = useCallback(async () => {
    const res = await fetch(`/api/tags?organizationId=${organizationId}`);
    if (res.ok) setTags(await res.json());
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  async function act(tagId: string, action: "approve" | "reject") {
    await fetch(`/api/tags/${tagId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  async function reassign(tagId: string) {
    const targetId = reassignChoice[tagId];
    if (!targetId) return;
    await fetch(`/api/tags/${tagId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reassign", targetId }),
    });
    setTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  if (loading) return <div className="p-6 text-sm text-[var(--muted)]">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4">
        <Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">
          &larr; Back to client
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">Tag Review</h1>

      {tags.length === 0 && <p className="text-sm text-[var(--muted)]">Nothing pending review.</p>}

      <div className="space-y-3">
        {tags.map((tag) => (
          <div key={tag.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-sm mb-3">&ldquo;{tag.segment.text}&rdquo;</p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[var(--muted)]">
                {tag.targetType}: {tag.targetName} &middot; {Math.round(tag.confidence * 100)}% confidence
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => act(tag.id, "approve")}
                  className="text-xs font-medium px-3 py-1 rounded bg-[var(--success)] text-white"
                >
                  Approve
                </button>
                <button
                  onClick={() => act(tag.id, "reject")}
                  className="text-xs font-medium px-3 py-1 rounded bg-[var(--destructive)] text-white"
                >
                  Reject
                </button>
              </div>
            </div>
            {tag.candidates.length > 1 && (
              <div className="flex items-center gap-2 pt-3 border-t border-[var(--card-border)]">
                <select
                  value={reassignChoice[tag.id] ?? ""}
                  onChange={(e) => setReassignChoice((prev) => ({ ...prev, [tag.id]: e.target.value }))}
                  className="border border-[var(--card-border)] rounded px-2 py-1 text-xs flex-1"
                >
                  <option value="">Reassign to…</option>
                  {tag.candidates
                    .filter((c) => c.id !== tag.targetId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => reassign(tag.id)}
                  disabled={!reassignChoice[tag.id]}
                  className="text-xs font-medium px-3 py-1 rounded bg-[var(--accent)] text-white disabled:opacity-50"
                >
                  Reassign
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev`, then in a browser visit `/clients/<an-existing-org-id>/review` after capturing something on the capture page that produces a `PENDING_REVIEW` tag (confidence < 0.85 — with `ANTHROPIC_API_KEY` unset, no tags will be generated at all, so this step requires the key to be set; note this in the manual verification but do not block the plan on it).
Expected: pending tags render with segment text, target name, confidence; Approve/Reject remove the row; Reassign (when 2+ candidates of the same type exist) shows a dropdown and updates the tag.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all test files pass, including this plan's new tests (`tagging-generator`, `segmenting`, `pipeline`, `captured-inputs-route`, `tags-route`) alongside every Phase 1 test.

- [ ] **Step 4: Commit**

```bash
git add app/clients/\[id\]/review/page.tsx
git commit -m "Add tag review page: approve/reject/reassign pending tags"
```

---

## Definition of Done for this Plan

- `npm test` passes with all test files green (Phase 1's 8 files + this plan's 5 new files).
- `npm run build` succeeds.
- A Text Note or Email pasted via `/clients/[id]/capture` reaches `status: TAGGED` (once `ANTHROPIC_API_KEY` is set) and any low-confidence tags appear on `/clients/[id]/review` for approve/reject/reassign.
- `ANTHROPIC_API_KEY` obtained from the user and set in Vercel (Production + Preview) plus pulled to local `.env`/`.env.local`, following the same pattern used for the Supabase credentials in the Phase 1 data-model plan — required for real (non-test) end-to-end verification, not for the automated test suite.
