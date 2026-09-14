import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateDocumentFinding, verifyExcerpts, normaliseForMatch } from "../../lib/ai/document-findings";

const SOURCE = [
  "Vista Programme Governance Review.",
  "The finance function maintains a monthly capital planning cycle covering all",
  "material spend above fifty thousand pounds, approved by the investment committee.",
  "Budget ownership sits with the divisional finance business partners.",
].join(" ");

const CAPABILITIES = [
  { capabilityId: "cap-finance", name: "Financial planning and control" },
  { capabilityId: "cap-data", name: "Data and reporting" },
];

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const pipeline = readFileSync(resolve(process.cwd(), "lib/ingestion/pipeline.ts"), "utf8");
const migration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260914150000_add_document_finding/migration.sql"),
  "utf8",
);

function modelReply(payload: unknown): string {
  return "Here you go:\n" + JSON.stringify(payload);
}

describe("citation verification", () => {
  it("keeps an excerpt that genuinely appears in the document", () => {
    const kept = verifyExcerpts(["Budget ownership sits with the divisional finance business partners."], SOURCE);
    expect(kept).toHaveLength(1);
  });

  it("drops a fabricated excerpt — the failure that would destroy trust", () => {
    const kept = verifyExcerpts(["The board approved a five million pound transformation budget."], SOURCE);
    expect(kept).toEqual([]);
  });

  it("drops a paraphrased excerpt that is close but not verbatim", () => {
    const kept = verifyExcerpts(["The finance function has a monthly capital planning process"], SOURCE);
    expect(kept).toEqual([]);
  });

  it("tolerates whitespace and case differences so formatting does not cause a false rejection", () => {
    const kept = verifyExcerpts(["BUDGET   OWNERSHIP sits with the divisional\nfinance business partners."], SOURCE);
    expect(kept).toHaveLength(1);
  });

  it("drops excerpts too short to be evidence", () => {
    expect(verifyExcerpts(["Budget"], SOURCE)).toEqual([]);
  });

  it("removes duplicates", () => {
    const quote = "Budget ownership sits with the divisional finance business partners.";
    expect(verifyExcerpts([quote, quote], SOURCE)).toHaveLength(1);
  });

  it("ignores non-strings rather than throwing", () => {
    expect(verifyExcerpts([42, null, { a: 1 }], SOURCE)).toEqual([]);
  });

  it("returns nothing when given a non-array", () => {
    expect(verifyExcerpts("Budget ownership sits with the divisional finance business partners.", SOURCE)).toEqual([]);
  });
});

describe("finding generation", () => {
  const valid = {
    documentType: "governance review",
    title: "Vista governance review",
    summary: "The review describes a monthly capital planning cycle with committee approval.",
    capabilityId: "cap-finance",
    evidenceDemonstrated: "Demonstrates a functioning capital planning and approval control.",
    strength: "STRONG",
    confidence: 0.82,
    citedExcerpts: ["Budget ownership sits with the divisional finance business partners."],
  };

  it("returns a structured finding that a reviewer can act on", async () => {
    const complete = vi.fn(async () => modelReply(valid));
    const finding = await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete });
    expect(finding).toMatchObject({
      documentType: "governance review",
      title: "Vista governance review",
      capabilityId: "cap-finance",
      capabilityName: "Financial planning and control",
      strength: "STRONG",
      confidence: 0.82,
    });
    expect(finding?.citedExcerpts).toHaveLength(1);
  });

  it("discards a finding with no verifiable citation rather than presenting an unsupported claim", async () => {
    const complete = vi.fn(async () => modelReply({ ...valid, citedExcerpts: ["something the model invented entirely"] }));
    expect(await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete })).toBeNull();
  });

  it("never returns an excerpt absent from the source", async () => {
    const complete = vi.fn(async () => modelReply({
      ...valid,
      citedExcerpts: ["Budget ownership sits with the divisional finance business partners.", "A fabricated sentence that is not in the document at all."],
    }));
    const finding = await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete });
    expect(finding?.citedExcerpts).toEqual(["Budget ownership sits with the divisional finance business partners."]);
    for (const excerpt of finding?.citedExcerpts ?? []) {
      expect(normaliseForMatch(SOURCE)).toContain(normaliseForMatch(excerpt));
    }
  });

  it("drops a capability id that is not in the candidate list", async () => {
    const complete = vi.fn(async () => modelReply({ ...valid, capabilityId: "cap-does-not-exist" }));
    const finding = await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete });
    expect(finding?.capabilityId).toBeNull();
    expect(finding?.capabilityName).toBeNull();
  });

  it("forces strength NONE when the document evidences no capability", async () => {
    const complete = vi.fn(async () => modelReply({ ...valid, capabilityId: null, strength: "STRONG" }));
    const finding = await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete });
    expect(finding?.strength).toBe("NONE");
  });

  it("rejects an out-of-range confidence instead of storing it", async () => {
    const complete = vi.fn(async () => modelReply({ ...valid, confidence: 4 }));
    const finding = await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete });
    expect(finding?.confidence).toBe(0);
  });

  it("falls back to an unknown strength rather than trusting the model", async () => {
    const complete = vi.fn(async () => modelReply({ ...valid, strength: "DEVASTATING" }));
    const finding = await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete });
    expect(finding?.strength).toBe("NONE");
  });

  it("returns null when the model does not return JSON", async () => {
    const complete = vi.fn(async () => "I cannot help with that.");
    expect(await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete })).toBeNull();
  });

  it("returns null for empty document text without calling the model", async () => {
    const complete = vi.fn(async () => modelReply(valid));
    expect(await generateDocumentFinding({ documentName: "empty.pdf", text: "   ", capabilities: CAPABILITIES, complete })).toBeNull();
    expect(complete).not.toHaveBeenCalled();
  });

  it("falls back to the document name when the model gives no title", async () => {
    const complete = vi.fn(async () => modelReply({ ...valid, title: "" }));
    const finding = await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete });
    expect(finding?.title).toBe("review.pdf");
  });

  it("returns null when the model gives no summary, since a summary is the point", async () => {
    const complete = vi.fn(async () => modelReply({ ...valid, summary: "" }));
    expect(await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete })).toBeNull();
  });

  it("stores the finding fields the reviewer sees: what it is, what it proves, which capability", async () => {
    const complete = vi.fn(async () => modelReply(valid));
    const finding = await generateDocumentFinding({ documentName: "review.pdf", text: SOURCE, capabilities: CAPABILITIES, complete });
    expect(finding?.documentType).toBeTruthy();
    expect(finding?.evidenceDemonstrated).toBeTruthy();
    expect(finding?.capabilityName).toBeTruthy();
    expect(finding?.summary).toBeTruthy();
  });
});

describe("schema and migration", () => {
  it("has a DocumentFinding model with the structured fields", () => {
    expect(schema).toContain("model DocumentFinding");
    for (const field of [
      "documentType", "title", "summary", "capabilityId", "capabilityName",
      "evidenceDemonstrated", "strength", "confidence", "citedSegmentIds",
      "citedExcerpts", "status", "sourceHash",
    ]) {
      expect(schema).toContain(field);
    }
  });

  it("tracks approval state and staleness", () => {
    expect(schema).toContain("enum FindingStatus");
    for (const state of ["PENDING_REVIEW", "APPROVED", "REJECTED", "STALE"]) {
      expect(schema).toContain(state);
    }
  });

  it("migrates the table and both enums", () => {
    expect(migration).toContain('CREATE TABLE "DocumentFinding"');
    expect(migration).toContain('CREATE TYPE "FindingStatus"');
    expect(migration).toContain('CREATE TYPE "FindingStrength"');
    expect(migration).toContain('FOREIGN KEY ("capturedInputId") REFERENCES "CapturedInput"("id") ON DELETE CASCADE');
  });
});

describe("findings in the pipeline", () => {
  it("only analyses documents, not human-authored notes", () => {
    expect(pipeline).toContain('if (input.type === "DOCUMENT")');
  });

  it("never replaces a human decision when re-analysing", () => {
    // Only PENDING_REVIEW rows are removed; approved and rejected survive.
    expect(pipeline).toContain('where: { capturedInputId, status: "PENDING_REVIEW" }');
  });

  it("marks a superseded finding stale instead of leaving it looking current", () => {
    expect(pipeline).toContain('data: { status: "STALE" }');
  });

  it("links citations back to the segments they came from", () => {
    expect(pipeline).toContain("citedSegmentIds");
    expect(pipeline).toContain("normaliseForMatch");
  });

  it("stores the finding in the review queue", () => {
    expect(pipeline).toContain('status: "PENDING_REVIEW"');
    expect(pipeline).toContain("prisma.documentFinding.create");
  });
});
