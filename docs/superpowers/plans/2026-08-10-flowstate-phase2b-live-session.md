# Flow State Phase 2b: Live Session Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real-time follow-up question suggestions during an active interview: the advisor types notes as the conversation happens, each chunk gets segmented/tagged (reusing the existing pipeline unchanged), and a new pipeline step generates 1-3 follow-up question suggestions based on the segment plus what's already been touched in this session, surfaced on a polling UI.

**Architecture:** Reuses the existing `AssessmentSession`/`FollowUpSuggestion` models (unused since Phase 1), the existing `POST /api/captured-inputs` route (extended with an optional `sessionId` field), and the existing pipeline (extended with one more conditional step after tagging). No new capture path, no new AI SDK, no schema changes.

**Tech Stack:** Same as Plans 1-2 — Next.js 16 App Router route handlers, Prisma 7, Vitest integration tests against real Supabase Postgres, Claude via raw `fetch`.

## Global Constraints

- Live input is **typed text only** — no audio streaming. Submitting to a session forces `type: "TEXT_NOTE"`; the route rejects any other type when `sessionId` is present (400, not a silent override).
- Suggestion delivery is **polling**, matching the existing pattern (the capture page already polls every 3s) — no SSE/WebSocket.
- The new `suggest_followups` pipeline step is **non-fatal**: if it throws, the `ProcessingJob` row for that step is marked `FAILED` (existing `runJob` behavior), but the error is caught at the call site and does **not** propagate into the outer `try/catch` — `CapturedInput.status` still reaches `TAGGED`. This is a deliberate deviation from how `transcribe`/`segment`/`tag` failures behave (those DO fail the whole input) — suggestions are a bonus on top of already-successful capture, not a required step.
- `capabilityId` on `FollowUpSuggestion` is left `null` in this implementation — not populated, per the design spec's explicit scope decision (§10 of the spec). Do not attempt to infer it from the suggestion text.
- No new AI SDK — `lib/ai/followups.ts` uses raw `fetch` to `https://api.anthropic.com/v1/messages`, matching `lib/ai/tagging.ts`'s exact pattern.
- Every API route follows the existing auth-check pattern exactly (`@/lib/db`, `@/lib/supabase/server`, 401 before anything else).
- Tests: integration tests against the real Supabase Postgres database (no DB mocks), matching every prior plan's convention. The new Claude call is mocked at `fetch`.
- This plan modifies two files from Plans 1/2: `lib/ingestion/pipeline.ts` (adds the `suggest_followups` step) and `app/api/captured-inputs/route.ts` (adds the optional `sessionId` field). Both are shown as full-file replacements below, reflecting their current (post-Plan-2) state exactly.

---

## File Structure

- `lib/ai/followups.ts` — new. `generateFollowUpSuggestions(latestSegmentText, touchedAreaNames): Promise<string[]>`.
- `lib/ingestion/pipeline.ts` — modified. Adds a `suggest_followups` step (using the file above, plus a new `getTouchedAreaNames` helper) after the existing `tag` step, only when `input.sessionId` is set.
- `app/api/sessions/route.ts` — new. `POST` (create session).
- `app/api/sessions/[id]/route.ts` — new. `GET` (session detail + feed), `PATCH` (end session).
- `app/api/sessions/[id]/suggestions/route.ts` — new. `GET` (poll pending suggestions).
- `app/api/suggestions/[id]/route.ts` — new. `PATCH` (ask/dismiss a suggestion).
- `app/api/captured-inputs/route.ts` — modified. Accepts optional `sessionId`, validates it's paired only with `type: TEXT_NOTE`.
- `app/clients/[id]/session/[sessionId]/page.tsx` — new. The live session UI.
- `app/clients/[id]/capture/page.tsx` — modified. Adds a "Start Live Session" button.

---

### Task 1: Follow-up suggestion generator (`lib/ai/followups.ts`)

**Files:**
- Create: `lib/ai/followups.ts`
- Test: `tests/schema/followups-generator.test.ts`

**Interfaces:**
- Produces: `generateFollowUpSuggestions(latestSegmentText: string, touchedAreaNames: string[]): Promise<string[]>`. Task 2 imports this from `@/lib/ai/followups`.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/followups-generator.test.ts`:
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateFollowUpSuggestions } from "../../lib/ai/followups";

describe("generateFollowUpSuggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns suggested follow-up questions parsed from the Claude response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        content: [
          {
            text: JSON.stringify([
              "What's driving the night shift labor cost specifically?",
              "Has this been an issue since the extrusion line changes?",
            ]),
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateFollowUpSuggestions(
      "We are losing money on night shift.",
      ["Shift Scheduling", "Extrusion Process Control"]
    );

    expect(result).toEqual([
      "What's driving the night shift labor cost specifically?",
      "Has this been an issue since the extrusion line changes?",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns an empty array when Claude has nothing to suggest", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: "[]" }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateFollowUpSuggestions("Unrelated small talk.", []);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- followups-generator`
Expected: FAIL — `Cannot find module '../../lib/ai/followups'`.

- [ ] **Step 3: Write the implementation**

Create `lib/ai/followups.ts`:
```typescript
export async function generateFollowUpSuggestions(
  latestSegmentText: string,
  touchedAreaNames: string[]
): Promise<string[]> {
  const areasList = touchedAreaNames.length > 0 ? touchedAreaNames.join(", ") : "(none yet)";

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
          content: `You are assisting an advisor conducting a live capability-assessment interview. Suggest specific, non-redundant follow-up questions based on what was just said.

Just captured:
"${latestSegmentText}"

Capability/domain/KPI/stakeholder areas already touched in this session: ${areasList}

Return a JSON array of 1-3 short follow-up question strings the advisor could ask next. Return [] if the segment is off-topic or nothing useful comes to mind. Do not repeat questions about areas that seem already thoroughly covered.`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "[]";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed.filter((q: unknown): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- followups-generator`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/followups.ts tests/schema/followups-generator.test.ts
git commit -m "Add Claude-backed follow-up question suggestion generator"
```

---

### Task 2: Pipeline extension — suggest follow-ups after tagging

**Files:**
- Modify: `lib/ingestion/pipeline.ts` (full file rewrite shown below)
- Modify: `tests/schema/pipeline.test.ts` (full file rewrite shown below — adds two tests, keeps the existing three unchanged)

**Interfaces:**
- Consumes: `generateFollowUpSuggestions` from `@/lib/ai/followups` (Task 1).
- Produces: `processCapturedInput(capturedInputId: string): Promise<void>` — same signature as Plans 1/2. No change to callers.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `tests/schema/pipeline.test.ts`:
```typescript
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";
import { processCapturedInput } from "../../lib/ingestion/pipeline";
import { transcribeAudio } from "../../lib/ai/transcription";
import { extractDocumentText } from "../../lib/documents/extraction";
import { generateFollowUpSuggestions } from "../../lib/ai/followups";

vi.mock("../../lib/ai/transcription", () => ({
  transcribeAudio: vi.fn(),
}));
vi.mock("../../lib/documents/extraction", () => ({
  extractDocumentText: vi.fn(),
}));
vi.mock("../../lib/ai/followups", () => ({
  generateFollowUpSuggestions: vi.fn(),
}));

describe("processCapturedInput", () => {
  let orgId: string;
  let sessionOrgId: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(transcribeAudio).mockReset();
    vi.mocked(extractDocumentText).mockReset();
    vi.mocked(generateFollowUpSuggestions).mockReset();
  });

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    if (sessionOrgId) await cleanupOrganization(sessionOrgId);
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
    expect(generateFollowUpSuggestions).not.toHaveBeenCalled();
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

  it("transcribes an AUDIO CapturedInput before segmenting, when rawText is null", async () => {
    const org = await createTestOrganization({ name: "Pipeline Audio Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        type: "AUDIO",
        sourceRef: "https://blob.example.com/interview.m4a",
        status: "PENDING",
      },
    });

    vi.mocked(transcribeAudio).mockResolvedValue("Night shift scheduling is a mess.");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: "[]" }] }) })
    );

    await processCapturedInput(input.id);

    expect(transcribeAudio).toHaveBeenCalledWith("https://blob.example.com/interview.m4a");
    expect(extractDocumentText).not.toHaveBeenCalled();

    const updatedInput = await prisma.capturedInput.findUniqueOrThrow({ where: { id: input.id } });
    expect(updatedInput.rawText).toBe("Night shift scheduling is a mess.");
    expect(updatedInput.status).toBe("TAGGED");

    const jobs = await prisma.processingJob.findMany({ where: { targetId: input.id }, orderBy: { createdAt: "asc" } });
    expect(jobs.map((j) => j.type)).toEqual(["transcribe", "segment", "tag"]);
  });

  it("generates follow-up suggestions after tagging when the input belongs to a live session", async () => {
    const org = await createTestOrganization({ name: "Pipeline Session Test Org" });
    sessionOrgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Shift Scheduling" },
    });
    const advisor = await prisma.user.create({
      data: { email: `advisor-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });

    // Prior capture in this session, already tagged, to seed "touched areas"
    const priorInput = await prisma.capturedInput.create({
      data: { organizationId: org.id, sessionId: session.id, type: "TEXT_NOTE", rawText: "Night shift scheduling.", status: "TAGGED" },
    });
    const priorSegment = await prisma.capturedSegment.create({
      data: { capturedInputId: priorInput.id, order: 0, text: "Night shift scheduling." },
    });
    await prisma.tag.create({
      data: { segmentId: priorSegment.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.9, status: "AUTO_APPROVED" },
    });

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        sessionId: session.id,
        type: "TEXT_NOTE",
        rawText: "It's worse in the winter months.",
        status: "TRANSCRIBED",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: "[]" }] }) })
    );
    vi.mocked(generateFollowUpSuggestions).mockResolvedValue([
      "How does seasonal demand affect the night shift specifically?",
    ]);

    await processCapturedInput(input.id);

    expect(generateFollowUpSuggestions).toHaveBeenCalledWith(
      "It's worse in the winter months.",
      ["Shift Scheduling"]
    );

    const suggestions = await prisma.followUpSuggestion.findMany({ where: { sessionId: session.id } });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suggestedQuestion).toBe("How does seasonal demand affect the night shift specifically?");
    expect(suggestions[0].status).toBe("SHOWN");

    const updatedInput = await prisma.capturedInput.findUniqueOrThrow({ where: { id: input.id } });
    expect(updatedInput.status).toBe("TAGGED");

    const jobs = await prisma.processingJob.findMany({ where: { targetId: input.id }, orderBy: { createdAt: "asc" } });
    expect(jobs.map((j) => j.type)).toEqual(["segment", "tag", "suggest_followups"]);
  });

  it("still reaches TAGGED when the suggest_followups step throws (non-fatal)", async () => {
    const org = await createTestOrganization({ name: "Pipeline Session Failure Test Org" });
    sessionOrgId = org.id;

    await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const advisor = await prisma.user.create({
      data: { email: `advisor2-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        sessionId: session.id,
        type: "TEXT_NOTE",
        rawText: "Some live note.",
        status: "TRANSCRIBED",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: "[]" }] }) })
    );
    vi.mocked(generateFollowUpSuggestions).mockRejectedValue(new Error("Claude unavailable"));

    await processCapturedInput(input.id);

    const updatedInput = await prisma.capturedInput.findUniqueOrThrow({ where: { id: input.id } });
    expect(updatedInput.status).toBe("TAGGED");

    const jobs = await prisma.processingJob.findMany({ where: { targetId: input.id }, orderBy: { createdAt: "asc" } });
    const suggestJob = jobs.find((j) => j.type === "suggest_followups");
    expect(suggestJob?.status).toBe("FAILED");
    expect(suggestJob?.error).toContain("Claude unavailable");
  });
});
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `npm test -- pipeline`
Expected: FAIL on the 4th and 5th tests (`generateFollowUpSuggestions` never gets called, no `FollowUpSuggestion` rows created, no `suggest_followups` job type). The first three tests still pass unchanged.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `lib/ingestion/pipeline.ts`:
```typescript
import { prisma } from "@/lib/db";
import { segmentText } from "@/lib/ai/segmenting";
import { generateTagSuggestions, type TaggableEntity } from "@/lib/ai/tagging";
import { transcribeAudio } from "@/lib/ai/transcription";
import { extractDocumentText } from "@/lib/documents/extraction";
import { generateFollowUpSuggestions } from "@/lib/ai/followups";

const AUTO_APPROVE_THRESHOLD = 0.85;

export async function processCapturedInput(capturedInputId: string): Promise<void> {
  const input = await prisma.capturedInput.findUniqueOrThrow({
    where: { id: capturedInputId },
  });

  try {
    let rawText = input.rawText;

    if (rawText == null) {
      if (!input.sourceRef) {
        throw new Error("CapturedInput has no rawText and no sourceRef to transcribe/extract from");
      }

      rawText = await runJob("transcribe", capturedInputId, async () => {
        await prisma.capturedInput.update({
          where: { id: capturedInputId },
          data: { status: "TRANSCRIBING" },
        });

        const text =
          input.type === "AUDIO"
            ? await transcribeAudio(input.sourceRef!)
            : await extractDocumentText(input.sourceRef!);

        await prisma.capturedInput.update({
          where: { id: capturedInputId },
          data: { rawText: text, status: "TRANSCRIBED" },
        });

        return text;
      });
    }

    const segments = await runJob("segment", capturedInputId, async () => {
      await prisma.capturedInput.update({
        where: { id: capturedInputId },
        data: { status: "SEGMENTING" },
      });

      const rawSegments = segmentText(rawText ?? "");
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

    if (input.sessionId) {
      const sessionId = input.sessionId;
      await runJob("suggest_followups", capturedInputId, async () => {
        const latestSegment = segments[segments.length - 1];
        if (!latestSegment) return;

        const touchedAreaNames = await getTouchedAreaNames(sessionId);
        const questions = await generateFollowUpSuggestions(latestSegment.text, touchedAreaNames);

        for (const question of questions) {
          await prisma.followUpSuggestion.create({
            data: {
              sessionId,
              triggerSegmentId: latestSegment.id,
              suggestedQuestion: question,
              status: "SHOWN",
            },
          });
        }
      }).catch((err) => {
        console.error("suggest_followups step failed (non-fatal):", err);
      });
    }

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

async function getTouchedAreaNames(sessionId: string): Promise<string[]> {
  const tags = await prisma.tag.findMany({
    where: {
      status: { in: ["AUTO_APPROVED", "APPROVED"] },
      segment: { capturedInput: { sessionId } },
    },
  });

  if (tags.length === 0) return [];

  const idsByType = new Map<string, string[]>();
  for (const tag of tags) {
    const ids = idsByType.get(tag.targetType) ?? [];
    ids.push(tag.targetId);
    idsByType.set(tag.targetType, ids);
  }

  const [domains, capabilities, kpis, stakeholders] = await Promise.all([
    prisma.businessDomain.findMany({ where: { id: { in: idsByType.get("DOMAIN") ?? [] } } }),
    prisma.capability.findMany({ where: { id: { in: idsByType.get("CAPABILITY") ?? [] } } }),
    prisma.kPI.findMany({ where: { id: { in: idsByType.get("KPI") ?? [] } } }),
    prisma.stakeholder.findMany({ where: { id: { in: idsByType.get("STAKEHOLDER") ?? [] } } }),
  ]);

  const names = [
    ...domains.map((d) => d.name),
    ...capabilities.map((c) => c.name),
    ...kpis.map((k) => k.name),
    ...stakeholders.map((s) => s.name),
  ];

  return Array.from(new Set(names));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pipeline`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/pipeline.ts tests/schema/pipeline.test.ts
git commit -m "Extend pipeline: generate follow-up suggestions after tagging in live sessions"
```

---

### Task 3: Sessions API — create, get, end

**Files:**
- Create: `app/api/sessions/route.ts`
- Create: `app/api/sessions/[id]/route.ts`
- Test: `tests/schema/sessions-route.test.ts`

**Interfaces:**
- Produces: `POST /api/sessions` (body `{ organizationId }`, returns 201 + created `AssessmentSession`), `GET /api/sessions/[id]` (returns the session with `capturedInputs` — each with `segments`/`tags` — for the feed), `PATCH /api/sessions/[id]` (body `{ action: "end" }`, sets `status: "completed"`, `completedAt`). Task 6 (session UI) and Task 7 (start-session button) call these.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/sessions-route.test.ts`:
```typescript
import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "session-advisor@test.com" } } }) },
  }),
}));

import { POST as createSession } from "../../app/api/sessions/route";
import { GET as getSession, PATCH as patchSession } from "../../app/api/sessions/[id]/route";

describe("sessions routes", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates a session, upserting the advisor User by email, and gets it back with an empty feed", async () => {
    const org = await createTestOrganization({ name: "Sessions Route Test Org" });
    orgId = org.id;

    const createRes = await createSession(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        body: JSON.stringify({ organizationId: org.id }),
      }) as never
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.status).toBe("active");
    expect(created.organizationId).toBe(org.id);

    const advisor = await prisma.user.findUniqueOrThrow({ where: { email: "session-advisor@test.com" } });
    expect(created.advisorId).toBe(advisor.id);

    const getRes = await getSession(new Request("http://localhost/api/sessions/" + created.id) as never, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.capturedInputs).toEqual([]);
  });

  it("ends a session, setting status completed and completedAt", async () => {
    const org = await createTestOrganization({ name: "Sessions End Test Org" });
    orgId = org.id;

    const createRes = await createSession(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        body: JSON.stringify({ organizationId: org.id }),
      }) as never
    );
    const created = await createRes.json();

    const patchRes = await patchSession(
      new Request("http://localhost/api/sessions/" + created.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "end" }),
      }) as never,
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(patchRes.status).toBe(200);
    const ended = await patchRes.json();
    expect(ended.status).toBe("completed");
    expect(ended.completedAt).not.toBeNull();
  });

  it("rejects an invalid PATCH action with 400", async () => {
    const org = await createTestOrganization({ name: "Sessions Invalid Action Test Org" });
    orgId = org.id;

    const createRes = await createSession(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        body: JSON.stringify({ organizationId: org.id }),
      }) as never
    );
    const created = await createRes.json();

    const patchRes = await patchSession(
      new Request("http://localhost/api/sessions/" + created.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "not-a-real-action" }),
      }) as never,
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(patchRes.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sessions-route`
Expected: FAIL — `Cannot find module '../../app/api/sessions/route'`.

- [ ] **Step 3: Write the implementation**

Create `app/api/sessions/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { organizationId } = body;
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const dbUser = await prisma.user.upsert({
    where: { email: user.email! },
    update: {},
    create: { email: user.email!, name: user.user_metadata?.name, role: "ADVISOR" },
  });

  const session = await prisma.assessmentSession.create({
    data: {
      organizationId,
      advisorId: dbUser.id,
      status: "active",
    },
  });

  return NextResponse.json(session, { status: 201 });
}
```

Create `app/api/sessions/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const session = await prisma.assessmentSession.findUnique({
    where: { id },
    include: {
      capturedInputs: {
        orderBy: { createdAt: "asc" },
        include: {
          segments: {
            orderBy: { order: "asc" },
            include: { tags: true },
          },
        },
      },
    },
  });

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(session);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  if (body.action !== "end") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const session = await prisma.assessmentSession.update({
    where: { id },
    data: { status: "completed", completedAt: new Date() },
  });

  return NextResponse.json(session);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sessions-route`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions tests/schema/sessions-route.test.ts
git commit -m "Add sessions API: create, get with feed, end"
```

---

### Task 4: Suggestions API — poll, ask/dismiss

**Files:**
- Create: `app/api/sessions/[id]/suggestions/route.ts`
- Create: `app/api/suggestions/[id]/route.ts`
- Test: `tests/schema/suggestions-route.test.ts`

**Interfaces:**
- Produces: `GET /api/sessions/[id]/suggestions` (returns `FollowUpSuggestion[]` with `status: "SHOWN"`, newest first), `PATCH /api/suggestions/[id]` (body `{ action: "ask" | "dismiss" }`, returns updated `FollowUpSuggestion`). Task 6 (session UI) calls these.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/suggestions-route.test.ts`:
```typescript
import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "suggest-advisor@test.com" } } }) },
  }),
}));

import { GET as listSuggestions } from "../../app/api/sessions/[id]/suggestions/route";
import { PATCH as patchSuggestion } from "../../app/api/suggestions/[id]/route";

describe("suggestions routes", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("lists SHOWN suggestions for a session, excluding ASKED/DISMISSED ones, then dismisses one", async () => {
    const org = await createTestOrganization({ name: "Suggestions Route Test Org" });
    orgId = org.id;

    const advisor = await prisma.user.create({
      data: { email: `suggest-advisor2-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });

    const shown = await prisma.followUpSuggestion.create({
      data: { sessionId: session.id, suggestedQuestion: "Shown question", status: "SHOWN" },
    });
    await prisma.followUpSuggestion.create({
      data: { sessionId: session.id, suggestedQuestion: "Already dismissed", status: "DISMISSED" },
    });

    const listRes = await listSuggestions(
      new Request("http://localhost/api/sessions/" + session.id + "/suggestions") as never,
      { params: Promise.resolve({ id: session.id }) }
    );
    const list = await listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(shown.id);

    const patchRes = await patchSuggestion(
      new Request("http://localhost/api/suggestions/" + shown.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "dismiss" }),
      }) as never,
      { params: Promise.resolve({ id: shown.id }) }
    );
    expect(patchRes.status).toBe(200);
    const dismissed = await patchRes.json();
    expect(dismissed.status).toBe("DISMISSED");
  });

  it("marks a suggestion ASKED", async () => {
    const org = await createTestOrganization({ name: "Suggestions Ask Test Org" });
    orgId = org.id;

    const advisor = await prisma.user.create({
      data: { email: `suggest-advisor3-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });
    const suggestion = await prisma.followUpSuggestion.create({
      data: { sessionId: session.id, suggestedQuestion: "Ask this?", status: "SHOWN" },
    });

    const res = await patchSuggestion(
      new Request("http://localhost/api/suggestions/" + suggestion.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "ask" }),
      }) as never,
      { params: Promise.resolve({ id: suggestion.id }) }
    );
    const updated = await res.json();
    expect(updated.status).toBe("ASKED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- suggestions-route`
Expected: FAIL — `Cannot find module '../../app/api/sessions/[id]/suggestions/route'`.

- [ ] **Step 3: Write the implementation**

Create `app/api/sessions/[id]/suggestions/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const suggestions = await prisma.followUpSuggestion.findMany({
    where: { sessionId: id, status: "SHOWN" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(suggestions);
}
```

Create `app/api/suggestions/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

const STATUS_BY_ACTION = {
  ask: "ASKED",
  dismiss: "DISMISSED",
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action } = body as { action: keyof typeof STATUS_BY_ACTION };

  if (!(action in STATUS_BY_ACTION)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const suggestion = await prisma.followUpSuggestion.update({
    where: { id },
    data: { status: STATUS_BY_ACTION[action] },
  });

  return NextResponse.json(suggestion);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- suggestions-route`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/\[id\]/suggestions app/api/suggestions tests/schema/suggestions-route.test.ts
git commit -m "Add suggestions API: poll pending, ask/dismiss"
```

---

### Task 5: Capture route — accept optional sessionId

**Files:**
- Modify: `app/api/captured-inputs/route.ts` (full file rewrite shown below)
- Modify: `tests/schema/captured-inputs-route.test.ts` (full file rewrite shown below — keeps the existing 4 tests, adds 2 new ones)

**Interfaces:**
- Produces: `POST /api/captured-inputs` now additionally accepts an optional `sessionId` form field. When present, `type` must be `"TEXT_NOTE"` (400 otherwise) and the created `CapturedInput.sessionId` is set. `GET` endpoints are unchanged. Task 6 (session UI) calls `POST` with `sessionId` set.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `tests/schema/captured-inputs-route.test.ts`:
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

vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({ url: "https://blob.example.com/interview.m4a" }),
}));

import { GET as listInputs, POST as createInput } from "../../app/api/captured-inputs/route";
import { GET as getInput } from "../../app/api/captured-inputs/[id]/route";

function makeFormDataRequest(fields: Record<string, string | File>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/captured-inputs", {
    method: "POST",
    body: formData,
  }) as never;
}

describe("captured-inputs routes", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates a TEXT_NOTE input via the rawText field, and lists/gets it back", async () => {
    const org = await createTestOrganization({ name: "Route Test Org" });
    orgId = org.id;

    const createRes = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "TEXT_NOTE", rawText: "A short note." })
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.type).toBe("TEXT_NOTE");
    expect(created.status).toBe("TRANSCRIBED");

    const listReq = new Request(`http://localhost/api/captured-inputs?organizationId=${org.id}`) as never;
    const listRes = await listInputs(listReq);
    const list = await listRes.json();
    expect(list.some((i: { id: string }) => i.id === created.id)).toBe(true);

    const getRes = await getInput(new Request("http://localhost/api/captured-inputs/" + created.id) as never, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(getRes.status).toBe(200);
  });

  it("uploads an AUDIO file to Blob and creates a PENDING CapturedInput with sourceRef set", async () => {
    const org = await createTestOrganization({ name: "Route Audio Test Org" });
    orgId = org.id;

    const file = new File(["fake audio bytes"], "interview.m4a", { type: "audio/m4a" });
    const res = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "AUDIO", file })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.sourceRef).toBe("https://blob.example.com/interview.m4a");
    expect(created.status).toBe("PENDING");
    expect(created.rawText).toBeNull();
  });

  it("rejects an invalid type with 400", async () => {
    const org = await createTestOrganization({ name: "Route Reject Test Org" });
    orgId = org.id;

    const res = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "NOT_A_REAL_TYPE", rawText: "n/a" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a file-based type submitted without a file", async () => {
    const org = await createTestOrganization({ name: "Route Missing File Test Org" });
    orgId = org.id;

    const res = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "AUDIO" })
    );
    expect(res.status).toBe(400);
  });

  it("sets sessionId on a TEXT_NOTE capture submitted with a session", async () => {
    const org = await createTestOrganization({ name: "Route Session Test Org" });
    orgId = org.id;

    const advisor = await prisma.user.create({
      data: { email: `route-session-advisor-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });

    const res = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "TEXT_NOTE", rawText: "Live note.", sessionId: session.id })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.sessionId).toBe(session.id);
  });

  it("rejects a sessionId paired with a non-TEXT_NOTE type", async () => {
    const org = await createTestOrganization({ name: "Route Session Reject Test Org" });
    orgId = org.id;

    const advisor = await prisma.user.create({
      data: { email: `route-session-advisor2-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });

    const res = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "EMAIL", rawText: "n/a", sessionId: session.id })
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `npm test -- captured-inputs-route`
Expected: FAIL on the 5th test (`created.sessionId` is `undefined`, not the session id — the field is silently dropped since the route doesn't read `sessionId` from the form data yet). The 6th test may pass by coincidence (no sessionId validation exists yet, so nothing rejects it) — that's expected at this point; both will be verified together after the implementation.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/api/captured-inputs/route.ts`:
```typescript
import { NextRequest, NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { processCapturedInput } from "@/lib/ingestion/pipeline";
import { InputType } from "@/app/generated/prisma/enums";

const VALID_TYPES = new Set<InputType>(["TEXT_NOTE", "EMAIL", "AUDIO", "DOCUMENT", "DATA_ROOM_FILE"]);
const TEXT_TYPES = new Set<InputType>(["TEXT_NOTE", "EMAIL"]);

function isInputType(value: string): value is InputType {
  return (VALID_TYPES as Set<string>).has(value);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const organizationId = formData.get("organizationId");
  const type = formData.get("type");
  const locationTag = formData.get("locationTag");
  const rawText = formData.get("rawText");
  const file = formData.get("file");
  const sessionIdField = formData.get("sessionId");

  if (typeof organizationId !== "string" || !organizationId || typeof type !== "string" || !type) {
    return NextResponse.json({ error: "organizationId and type are required" }, { status: 400 });
  }
  if (!isInputType(type)) {
    return NextResponse.json({ error: `Unsupported type: ${type}` }, { status: 400 });
  }

  const sessionId = typeof sessionIdField === "string" && sessionIdField ? sessionIdField : null;
  if (sessionId && type !== "TEXT_NOTE") {
    return NextResponse.json({ error: "Live session captures must be type TEXT_NOTE" }, { status: 400 });
  }

  const resolvedLocationTag = typeof locationTag === "string" && locationTag ? locationTag : null;
  let capturedInput;

  if (TEXT_TYPES.has(type)) {
    if (typeof rawText !== "string" || !rawText.trim()) {
      return NextResponse.json({ error: "rawText is required" }, { status: 400 });
    }
    capturedInput = await prisma.capturedInput.create({
      data: {
        organizationId,
        type,
        rawText,
        locationTag: resolvedLocationTag,
        sessionId,
        status: "TRANSCRIBED",
      },
    });
  } else {
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const blob = await put(file.name, file, { access: "public", addRandomSuffix: true });
    capturedInput = await prisma.capturedInput.create({
      data: {
        organizationId,
        type,
        sourceRef: blob.url,
        locationTag: resolvedLocationTag,
        sessionId,
        status: "PENDING",
      },
    });
  }

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- captured-inputs-route`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/captured-inputs/route.ts tests/schema/captured-inputs-route.test.ts
git commit -m "Accept optional sessionId on capture route, restricted to TEXT_NOTE"
```

---

### Task 6: Live session UI page

**Files:**
- Create: `app/clients/[id]/session/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/sessions/[id]` (Task 3), `PATCH /api/sessions/[id]` (Task 3), `GET /api/sessions/[id]/suggestions` (Task 4), `PATCH /api/suggestions/[id]` (Task 4), `POST /api/captured-inputs` with `sessionId` (Task 5).
- Produces: nothing consumed by later tasks — leaf UI page.

- [ ] **Step 1: Write the page**

Create `app/clients/[id]/session/[sessionId]/page.tsx`:
```tsx
"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";

type Tag = { id: string; targetType: string; targetId: string; status: string };
type Segment = { id: string; text: string; tags: Tag[] };
type CapturedInput = { id: string; rawText: string | null; status: string; segments: Segment[]; createdAt: string };
type Session = { id: string; status: string; organizationId: string; capturedInputs: CapturedInput[] };
type Suggestion = { id: string; suggestedQuestion: string };

export default function SessionPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id: organizationId, sessionId } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (res.ok) setSession(await res.json());
  }, [sessionId]);

  const loadSuggestions = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/suggestions`);
    if (res.ok) setSuggestions(await res.json());
  }, [sessionId]);

  useEffect(() => {
    loadSession();
    loadSuggestions();
    const interval = setInterval(() => {
      loadSession();
      loadSuggestions();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadSession, loadSuggestions]);

  const isActive = session?.status === "active";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("organizationId", organizationId);
      formData.append("type", "TEXT_NOTE");
      formData.append("rawText", noteText);
      formData.append("sessionId", sessionId);

      const res = await fetch("/api/captured-inputs", { method: "POST", body: formData });
      if (res.ok) {
        setNoteText("");
        loadSession();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function endSession() {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    });
    loadSession();
  }

  async function actOnSuggestion(id: string, action: "ask" | "dismiss") {
    await fetch(`/api/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }

  if (!session) return <div className="p-6 text-sm text-[var(--muted)]">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/clients/${organizationId}/capture`} className="text-sm text-[var(--muted)]">
          &larr; Back to capture
        </Link>
        {isActive && (
          <button
            onClick={endSession}
            className="text-xs font-medium px-3 py-1 rounded bg-[var(--destructive)] text-white"
          >
            End Session
          </button>
        )}
      </div>
      <h1 className="text-2xl font-bold mb-2">Live Session</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Status: {session.status}
      </p>

      {suggestions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Suggested follow-ups</h2>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
              >
                <span>{s.suggestedQuestion}</span>
                {isActive && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => actOnSuggestion(s.id, "ask")}
                      className="text-xs font-medium px-2 py-1 rounded bg-[var(--accent)] text-white"
                    >
                      Ask
                    </button>
                    <button
                      onClick={() => actOnSuggestion(s.id, "dismiss")}
                      className="text-xs font-medium px-2 py-1 rounded bg-[var(--muted-bg)] text-[var(--muted)]"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {session.capturedInputs.map((input) => (
          <div key={input.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-sm mb-2">{input.rawText}</p>
            <div className="flex flex-wrap gap-1">
              {input.segments.flatMap((seg) =>
                seg.tags.map((tag) => (
                  <span key={tag.id} className="score-pill text-xs" style={{ background: "#f1f5f9", color: "#64748b" }}>
                    {tag.targetType}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
        {session.capturedInputs.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No notes captured yet.</p>
        )}
      </div>

      {isActive && (
        <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="Type what's being discussed…"
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm w-full mb-3"
          />
          <button
            type="submit"
            disabled={submitting || !noteText.trim()}
            className="bg-[var(--accent)] text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit note"}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Run: `npm run build` (confirms compilation), then `npm run dev` and visit `/clients/<org-id>/session/<session-id>` for a session created via the API (or Task 7's button once that's done).
Expected: page renders with the note feed, submit box (while active), and suggestions panel. Full live-suggestion behavior requires `ANTHROPIC_API_KEY` to be set — not blocking this task per the established pattern from prior plans.

- [ ] **Step 3: Commit**

```bash
git add app/clients/\[id\]/session
git commit -m "Add live session page: note feed, submit box, follow-up suggestions"
```

---

### Task 7: Start Live Session entry point

**Files:**
- Modify: `app/clients/[id]/capture/page.tsx` (adds one button + one handler; shown as a full-file rewrite below for clarity)

**Interfaces:**
- Consumes: `POST /api/sessions` (Task 3).
- Produces: nothing consumed by later tasks — last task in this plan.

- [ ] **Step 1: Write the page**

Replace the full contents of `app/clients/[id]/capture/page.tsx`:
```tsx
"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CapturedInputType = "TEXT_NOTE" | "EMAIL" | "AUDIO" | "DOCUMENT" | "DATA_ROOM_FILE";

const FILE_TYPES = new Set<CapturedInputType>(["AUDIO", "DOCUMENT", "DATA_ROOM_FILE"]);

type CapturedInput = {
  id: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: string;
};

export default function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const router = useRouter();
  const [type, setType] = useState<CapturedInputType>("TEXT_NOTE");
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [locationTag, setLocationTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [inputs, setInputs] = useState<CapturedInput[]>([]);

  const isFileType = FILE_TYPES.has(type);

  const loadInputs = useCallback(async () => {
    const res = await fetch(`/api/captured-inputs?organizationId=${organizationId}`);
    if (res.ok) setInputs(await res.json());
  }, [organizationId]);

  useEffect(() => {
    loadInputs();
    const interval = setInterval(loadInputs, 3000);
    return () => clearInterval(interval);
  }, [loadInputs]);

  function handleTypeChange(next: CapturedInputType) {
    setType(next);
    setRawText("");
    setFile(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isFileType ? !file : !rawText.trim()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("organizationId", organizationId);
      formData.append("type", type);
      if (locationTag) formData.append("locationTag", locationTag);
      if (isFileType) {
        formData.append("file", file as File);
      } else {
        formData.append("rawText", rawText);
      }

      const res = await fetch("/api/captured-inputs", { method: "POST", body: formData });
      if (res.ok) {
        setRawText("");
        setFile(null);
        loadInputs();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function startLiveSession() {
    setStartingSession(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (res.ok) {
        const session = await res.json();
        router.push(`/clients/${organizationId}/session/${session.id}`);
      }
    } finally {
      setStartingSession(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">
          &larr; Back to client
        </Link>
        <button
          onClick={startLiveSession}
          disabled={startingSession}
          className="text-xs font-medium px-3 py-1 rounded bg-[var(--accent)] text-white disabled:opacity-50"
        >
          {startingSession ? "Starting…" : "Start Live Session"}
        </button>
      </div>
      <h1 className="text-2xl font-bold mb-6">Capture</h1>

      <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 mb-8">
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as CapturedInputType)}
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm"
          >
            <option value="TEXT_NOTE">Text Note</option>
            <option value="EMAIL">Email</option>
            <option value="AUDIO">Audio</option>
            <option value="DOCUMENT">Document</option>
            <option value="DATA_ROOM_FILE">Data Room File</option>
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
        {isFileType ? (
          <div className="mb-4">
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">
              {type === "AUDIO" ? "Audio file" : "Document (PDF or DOCX)"}
            </label>
            <input
              type="file"
              accept={type === "AUDIO" ? "audio/*" : ".pdf,.docx"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm w-full"
            />
          </div>
        ) : (
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
        )}
        <button
          type="submit"
          disabled={submitting || (isFileType ? !file : !rawText.trim())}
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

Run: `npm run build`.
Expected: compiles cleanly, `/clients/[id]/session/[sessionId]` and the updated `/clients/[id]/capture` both appear in the route output.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all test files pass — the 15 files from Plans 1-2 (with `pipeline.test.ts` and `captured-inputs-route.test.ts` now carrying more tests each) plus this plan's 4 new files (`followups-generator`, `sessions-route`, `suggestions-route`, and the modified `pipeline`/`captured-inputs-route`).

- [ ] **Step 4: Commit**

```bash
git add app/clients/\[id\]/capture/page.tsx
git commit -m "Add Start Live Session button to capture page"
```

---

## Definition of Done for this Plan

- `npm test` passes with all test files green.
- `npm run build` succeeds.
- `ANTHROPIC_API_KEY` already set from Plan 1 — no new credential needed for this plan (unlike Plan 2's `OPENAI_API_KEY`/Blob).
- Starting a live session, typing a note, and seeing it reach `TAGGED` with a follow-up suggestion appearing within a few seconds — required for real (non-test) end-to-end verification, not for the automated test suite.
