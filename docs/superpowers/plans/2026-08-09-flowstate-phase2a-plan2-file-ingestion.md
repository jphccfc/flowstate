# Flow State Phase 2a Plan 2: Audio & Document Ingestion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the ingestion pipeline built in Plan 1 to support `AUDIO` (via Whisper transcription), `DOCUMENT`, and `DATA_ROOM_FILE` (via PDF/DOCX text extraction) input types, uploading files to Vercel Blob and feeding extracted text into the existing segment→tag chain unchanged.

**Architecture:** File uploads go through the existing `POST /api/captured-inputs` route (now accepting `multipart/form-data` for all 5 input types, not just JSON for the two text types), which uploads the file to Vercel Blob server-side before creating the `CapturedInput` row. The background pipeline (`lib/ingestion/pipeline.ts`) gains a new first step — transcribe (audio) or extract (documents) — that populates `rawText` before falling through into Plan 1's unchanged segment→tag logic.

**Tech Stack:** OpenAI Whisper via raw `fetch` (matching the existing no-SDK pattern), `pdf-parse` + `mammoth` for text extraction, `@vercel/blob` for file storage (the one new SDK dependency in this plan — it's the official first-party client, not a raw-fetch candidate).

## Global Constraints

- `OPENAI_API_KEY` and Vercel Blob (`BLOB_READ_WRITE_TOKEN`) are not yet provisioned (confirmed via `vercel env ls` / `vercel integration list` during brainstorming). Tests in this plan mock `fetch` (for Whisper) and the `@vercel/blob` module — they do not need real credentials. Both must be obtained/provisioned before this pipeline runs end-to-end against real services — a deployment prerequisite, not a blocker for writing or testing this plan's code.
- File upload mechanism: **server-side proxy upload**. The browser sends the file to `POST /api/captured-inputs` as usual; the route uploads to Blob server-side via `put()`, then creates the `CapturedInput`. No separate signed-token endpoint.
- No `mimeType`/file-type field is added to the schema. Document type (PDF vs. DOCX) is derived from the uploaded file's extension, preserved in the Blob URL by passing the original filename to `put()`.
- Whisper integration uses raw `fetch` to `https://api.openai.com/v1/audio/transcriptions`, matching the existing no-SDK pattern in `lib/ai/index.ts` and Plan 1's `lib/ai/tagging.ts` — do not add the OpenAI SDK.
- `@vercel/blob` IS a new dependency (the one exception to "no new SDK" in this plan) — it's Vercel's first-party client for its own storage product, not a candidate for raw-fetch reimplementation.
- Every API route continues the existing auth-check pattern exactly (`@/lib/db`, `@/lib/supabase/server`, 401 before anything else).
- `CapturedInput`, `CapturedSegment`, `Tag`, `ProcessingJob` models are unchanged from Phase 1 — this plan does not modify the schema.
- Tests: integration tests against the real Supabase Postgres database (no DB mocks) for all data-flow logic, matching Plan 1's convention. External services (Whisper via `fetch`, `pdf-parse`/`mammoth` parsing, `@vercel/blob`'s `put()`) are mocked at the appropriate boundary — `fetch` for Whisper (raw HTTP), the `pdf-parse`/`mammoth` modules themselves for document extraction (testing our dispatch/orchestration logic, not re-testing well-tested upstream parsing libraries), and the `@vercel/blob` module for uploads.
- This plan modifies two files Plan 1 created: `app/api/captured-inputs/route.ts` (JSON body → `FormData`, a breaking API contract change) and `lib/ingestion/pipeline.ts` (adds a transcribe/extract step before segmenting). Plan 1's existing route test (`tests/schema/captured-inputs-route.test.ts`) must be rewritten to match the new `FormData` contract, not just extended.

---

## File Structure

- `lib/ai/transcription.ts` — new. `transcribeAudio(audioUrl: string): Promise<string>` — fetches the audio blob, posts to Whisper via raw `fetch`, returns the transcript.
- `lib/documents/extraction.ts` — new. `extractDocumentText(fileUrl: string): Promise<string>` — fetches the file, dispatches to `pdf-parse` or `mammoth` by file extension, returns extracted text.
- `lib/ingestion/pipeline.ts` — modified. Adds a `transcribe` step (using the two files above) before the existing `segment`/`tag` steps, only when `rawText` is null at pipeline start.
- `app/api/captured-inputs/route.ts` — modified. `POST` now parses `multipart/form-data`, uploads files to Vercel Blob for the 3 file-based types, and accepts `rawText` for the 2 text-based types (unchanged behavior for those two).
- `app/clients/[id]/capture/page.tsx` — modified. Type selector gains the 3 new options; form switches between a textarea (text types) and a file input (file types); submission uses `FormData` instead of JSON.
- `tests/schema/captured-inputs-route.test.ts` — rewritten (not extended) to use `FormData` throughout.
- `tests/schema/pipeline.test.ts` — extended with one new test for the AUDIO/transcribe path.

---

### Task 1: Whisper audio transcription (`lib/ai/transcription.ts`)

**Files:**
- Create: `lib/ai/transcription.ts`
- Test: `tests/schema/transcription.test.ts`

**Interfaces:**
- Produces: `transcribeAudio(audioUrl: string): Promise<string>`. Task 3 imports this from `@/lib/ai/transcription`.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/transcription.test.ts`:
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "../../lib/ai/transcription";

describe("transcribeAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the audio file and sends it to Whisper, returning the transcript text", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://blob.example.com/interview.m4a") {
        return { blob: async () => new Blob(["fake audio bytes"], { type: "audio/m4a" }) };
      }
      if (url === "https://api.openai.com/v1/audio/transcriptions") {
        return { ok: true, json: async () => ({ text: "We are losing money on night shift." }) };
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await transcribeAudio("https://blob.example.com/interview.m4a");

    expect(result).toBe("We are losing money on night shift.");
    expect(mockFetch).toHaveBeenCalledWith("https://blob.example.com/interview.m4a");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws with the API's error message when Whisper returns a non-ok response", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://blob.example.com/bad.m4a") {
        return { blob: async () => new Blob(["fake audio bytes"], { type: "audio/m4a" }) };
      }
      return { ok: false, json: async () => ({ error: { message: "Invalid file format" } }) };
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(transcribeAudio("https://blob.example.com/bad.m4a")).rejects.toThrow(
      "Invalid file format"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- transcription`
Expected: FAIL — `Cannot find module '../../lib/ai/transcription'`.

- [ ] **Step 3: Write the implementation**

Create `lib/ai/transcription.ts`:
```typescript
export async function transcribeAudio(audioUrl: string): Promise<string> {
  const audioResponse = await fetch(audioUrl);
  const audioBlob = await audioResponse.blob();

  const formData = new FormData();
  formData.append("file", audioBlob, "audio");
  formData.append("model", "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Whisper transcription failed");
  }
  return data.text ?? "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- transcription`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/transcription.ts tests/schema/transcription.test.ts
git commit -m "Add Whisper-backed audio transcription"
```

---

### Task 2: Document text extraction (`lib/documents/extraction.ts`)

**Files:**
- Create: `lib/documents/extraction.ts`
- Test: `tests/schema/extraction.test.ts`

**Interfaces:**
- Produces: `extractDocumentText(fileUrl: string): Promise<string>`. Task 3 imports this from `@/lib/documents/extraction`.

- [ ] **Step 1: Install the parsing libraries**

Run:
```bash
npm install pdf-parse mammoth
npm install -D @types/pdf-parse
```
Expected: `pdf-parse`, `mammoth` added to `dependencies`; `@types/pdf-parse` added to `devDependencies` in `package.json` (mammoth ships its own types, no separate `@types` package needed).

- [ ] **Step 2: Write the failing test**

Create `tests/schema/extraction.test.ts`:
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({ text: "Extracted PDF content" }),
}));
vi.mock("mammoth", () => ({
  extractRawText: vi.fn().mockResolvedValue({ value: "Extracted DOCX content" }),
}));

import { extractDocumentText } from "../../lib/documents/extraction";

describe("extractDocumentText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts text from a PDF file by its .pdf extension", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) }));

    const result = await extractDocumentText("https://blob.example.com/report.pdf");
    expect(result).toBe("Extracted PDF content");
  });

  it("extracts text from a DOCX file by its .docx extension", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) }));

    const result = await extractDocumentText("https://blob.example.com/memo.docx");
    expect(result).toBe("Extracted DOCX content");
  });

  it("throws for an unsupported file extension", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) }));

    await expect(extractDocumentText("https://blob.example.com/data.xlsx")).rejects.toThrow(
      "Unsupported document file extension: xlsx"
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- extraction`
Expected: FAIL — `Cannot find module '../../lib/documents/extraction'`.

- [ ] **Step 4: Write the implementation**

Create `lib/documents/extraction.ts`:
```typescript
import pdfParse from "pdf-parse";
import * as mammoth from "mammoth";

export async function extractDocumentText(fileUrl: string): Promise<string> {
  const response = await fetch(fileUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  const extension = fileUrl.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    const result = await pdfParse(buffer);
    return result.text;
  }
  if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error(`Unsupported document file extension: ${extension}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- extraction`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/documents/extraction.ts tests/schema/extraction.test.ts package.json package-lock.json
git commit -m "Add PDF/DOCX text extraction via pdf-parse and mammoth"
```

---

### Task 3: Pipeline extension — transcribe/extract before segmenting

**Files:**
- Modify: `lib/ingestion/pipeline.ts` (full file rewrite shown below)
- Modify: `tests/schema/pipeline.test.ts` (full file rewrite shown below — adds one test, keeps Plan 1's two tests unchanged)

**Interfaces:**
- Consumes: `transcribeAudio` from `@/lib/ai/transcription` (Task 1); `extractDocumentText` from `@/lib/documents/extraction` (Task 2).
- Produces: `processCapturedInput(capturedInputId: string): Promise<void>` — same signature as Plan 1, now handles all 5 `InputType`s. No change to callers (Task 4's route already calls this).

- [ ] **Step 1: Write the failing test**

Replace the full contents of `tests/schema/pipeline.test.ts`:
```typescript
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";
import { processCapturedInput } from "../../lib/ingestion/pipeline";
import { transcribeAudio } from "../../lib/ai/transcription";
import { extractDocumentText } from "../../lib/documents/extraction";

vi.mock("../../lib/ai/transcription", () => ({
  transcribeAudio: vi.fn(),
}));
vi.mock("../../lib/documents/extraction", () => ({
  extractDocumentText: vi.fn(),
}));

describe("processCapturedInput", () => {
  let orgId: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(transcribeAudio).mockReset();
    vi.mocked(extractDocumentText).mockReset();
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
});
```

- [ ] **Step 2: Run test to verify the new test fails**

Run: `npm test -- pipeline`
Expected: FAIL on the third test ("transcribes an AUDIO CapturedInput...") — `updatedInput.rawText` is `null`, not the mocked transcript, because `pipeline.ts` doesn't call `transcribeAudio` yet. The first two tests still pass (they're unchanged from Plan 1).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `lib/ingestion/pipeline.ts`:
```typescript
import { prisma } from "@/lib/db";
import { segmentText } from "@/lib/ai/segmenting";
import { generateTagSuggestions, type TaggableEntity } from "@/lib/ai/tagging";
import { transcribeAudio } from "@/lib/ai/transcription";
import { extractDocumentText } from "@/lib/documents/extraction";

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
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/pipeline.ts tests/schema/pipeline.test.ts
git commit -m "Extend pipeline to transcribe audio / extract documents before segmenting"
```

---

### Task 4: Capture route — file upload support

**Files:**
- Modify: `app/api/captured-inputs/route.ts` (full file rewrite shown below)
- Modify: `tests/schema/captured-inputs-route.test.ts` (full file rewrite shown below — replaces Plan 1's JSON-based tests with FormData-based ones)

**Interfaces:**
- Consumes: `put` from `@vercel/blob`; `processCapturedInput` from `@/lib/ingestion/pipeline` (unchanged from Plan 1).
- Produces: `POST /api/captured-inputs` now accepts `multipart/form-data` (fields: `organizationId`, `type`, `locationTag?`, plus `rawText` for `TEXT_NOTE`/`EMAIL` or `file` for `AUDIO`/`DOCUMENT`/`DATA_ROOM_FILE`), returns 201 + the created `CapturedInput`. `GET /api/captured-inputs?organizationId=...` is unchanged from Plan 1. Task 5 (capture UI) calls the `POST` with `FormData`.

- [ ] **Step 1: Install the Vercel Blob SDK**

Run: `npm install @vercel/blob`
Expected: `@vercel/blob` added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

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
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- captured-inputs-route`
Expected: FAIL — the existing route reads `req.json()`, which throws when the body is `FormData`, not JSON.

- [ ] **Step 4: Write the implementation**

Replace the full contents of `app/api/captured-inputs/route.ts`:
```typescript
import { NextRequest, NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { processCapturedInput } from "@/lib/ingestion/pipeline";

const VALID_TYPES = new Set(["TEXT_NOTE", "EMAIL", "AUDIO", "DOCUMENT", "DATA_ROOM_FILE"]);
const TEXT_TYPES = new Set(["TEXT_NOTE", "EMAIL"]);

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

  if (typeof organizationId !== "string" || !organizationId || typeof type !== "string" || !type) {
    return NextResponse.json({ error: "organizationId and type are required" }, { status: 400 });
  }
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: `Unsupported type: ${type}` }, { status: 400 });
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
        status: "TRANSCRIBED",
      },
    });
  } else {
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const blob = await put(file.name, file, { access: "public" });
    capturedInput = await prisma.capturedInput.create({
      data: {
        organizationId,
        type,
        sourceRef: blob.url,
        locationTag: resolvedLocationTag,
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

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- captured-inputs-route`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/captured-inputs/route.ts tests/schema/captured-inputs-route.test.ts package.json package-lock.json
git commit -m "Add file upload support to capture route: Vercel Blob for AUDIO/DOCUMENT/DATA_ROOM_FILE"
```

---

### Task 5: Capture UI — file input support

**Files:**
- Modify: `app/clients/[id]/capture/page.tsx` (full file rewrite shown below)

**Interfaces:**
- Consumes: `POST /api/captured-inputs` (now `FormData`), `GET /api/captured-inputs?organizationId=...` (unchanged) — both from Task 4.
- Produces: nothing consumed by later tasks — leaf UI page, last task in this plan.

- [ ] **Step 1: Write the page**

Replace the full contents of `app/clients/[id]/capture/page.tsx`:
```tsx
"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";

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
  const [type, setType] = useState<CapturedInputType>("TEXT_NOTE");
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [locationTag, setLocationTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

Run: `npm run build` (confirms compilation) and `npm run dev`, then in a browser visit `/clients/<an-existing-org-id>/capture`.
Expected: the type selector offers all 5 types; selecting Audio/Document/Data Room File swaps the textarea for a file input; selecting Text Note/Email restores the textarea. Full end-to-end status progression (PENDING → TRANSCRIBING → ... → TAGGED) requires `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/Blob credentials to be provisioned — not blocking this task, per Global Constraints.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all test files pass — Plan 1's 13 files plus this plan's `transcription`, `extraction` (new), and the modified `pipeline`, `captured-inputs-route` (test counts changed: `pipeline` now has 3 tests, `captured-inputs-route` now has 4).

- [ ] **Step 4: Commit**

```bash
git add app/clients/\[id\]/capture/page.tsx
git commit -m "Add file input support to capture page for audio/document/data-room-file types"
```

---

## Definition of Done for this Plan

- `npm test` passes with all test files green.
- `npm run build` succeeds.
- `OPENAI_API_KEY` obtained from the user and set in Vercel (Production + Preview) plus pulled to local `.env`/`.env.local`, same pattern as `ANTHROPIC_API_KEY` and the Supabase credentials.
- A Vercel Blob store provisioned (via `vercel:vercel-storage` skill guidance) and its token available as `BLOB_READ_WRITE_TOKEN` in Vercel + local env.
- With both of the above in place: an uploaded audio file or PDF/DOCX reaches `status: TAGGED` via `/clients/[id]/capture`, and any low-confidence tags appear on `/clients/[id]/review` — required for real (non-test) end-to-end verification, not for the automated test suite.
