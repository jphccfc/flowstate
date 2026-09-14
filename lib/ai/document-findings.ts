import { requestChatCompletion } from "@/lib/ai/client";

/**
 * Produces a structured finding about one document: what it is, which capability
 * it evidences, what it demonstrates, and the passages that support it.
 *
 * Segment-level tags alone do not answer the review question. A reviewer needs
 * one readable row per document — "this is a CIM; it demonstrates FY24 budget
 * ownership; here is the sentence" — before approving or rejecting it.
 *
 * Every citation is verified against the source text before it is returned.
 * A model asked for verbatim excerpts will occasionally paraphrase or invent
 * one, and a fabricated citation is the single most damaging thing this
 * pipeline could put in front of a consultant: it looks checkable and is not.
 * Unverifiable excerpts are dropped, and the finding is discarded entirely if
 * nothing survives — an uncited finding is an opinion, not evidence.
 */

export type FindingCandidate = {
  capabilityId: string;
  name: string;
};

export type DocumentFindingDraft = {
  documentType: string | null;
  title: string;
  summary: string;
  capabilityId: string | null;
  capabilityName: string | null;
  evidenceDemonstrated: string | null;
  strength: "NONE" | "WEAK" | "MODERATE" | "STRONG";
  confidence: number;
  /** Verified verbatim excerpts. Never contains text absent from the source. */
  citedExcerpts: string[];
};

const STRENGTHS = ["NONE", "WEAK", "MODERATE", "STRONG"] as const;

/** Documents are long; the model sees a bounded window of the analysed text. */
export const FINDING_MAX_CHARS = 12_000;

/** Excerpts shorter than this are too generic to be useful evidence. */
const MIN_EXCERPT_CHARS = 24;

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Whitespace- and case-insensitive comparison, exported so the pipeline links a
 * verified excerpt back to the segment it came from using the same rule that
 * verified it. Two different normalisers would let a citation pass verification
 * and then fail to link.
 */
export function normaliseForMatch(value: string): string {
  return normalise(value);
}

/**
 * Keeps only excerpts that genuinely appear in the source.
 *
 * Whitespace and case are normalised so formatting differences do not cause a
 * false rejection, but the words must match.
 */
export function verifyExcerpts(excerpts: unknown, source: string): string[] {
  if (!Array.isArray(excerpts)) return [];
  const haystack = normalise(source);
  const seen = new Set<string>();
  const verified: string[] = [];
  for (const candidate of excerpts) {
    if (typeof candidate !== "string") continue;
    const excerpt = candidate.trim();
    if (excerpt.length < MIN_EXCERPT_CHARS) continue;
    if (!haystack.includes(normalise(excerpt))) continue;
    const key = normalise(excerpt);
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push(excerpt);
  }
  return verified;
}

export async function generateDocumentFinding(input: {
  documentName: string;
  /** SharePoint path is a classification signal, not just display metadata. */
  sourcePath?: string | null;
  text: string;
  capabilities: FindingCandidate[];
  /** Injectable for tests; defaults to the project's chat completion client. */
  complete?: typeof requestChatCompletion;
}): Promise<DocumentFindingDraft | null> {
  const complete = input.complete ?? requestChatCompletion;
  const source = (input.text ?? "").trim();
  if (source.length === 0) return null;

  const window = source.slice(0, FINDING_MAX_CHARS);
  const capabilityList = input.capabilities.length
    ? input.capabilities.map((c) => `${c.capabilityId}: ${c.name}`).join("\n")
    : "(no capabilities defined)";

  const text = await complete({
    maxTokens: 2048,
    system:
      "You analyse a document as evidence for a capability assessment. Return JSON only. " +
      "Every excerpt you quote must be copied verbatim from the document. Never paraphrase a quote.",
    user: `Document name: ${input.documentName}
SharePoint path/context: ${input.sourcePath?.trim() || "(not provided)"}

Capabilities (id: name):
${capabilityList}

Document text:
"""
${window}
"""

Return a JSON object with:
  documentType     what this document is, briefly (e.g. "CIM", "email thread", "financial model", "acquisition Q&A")
  title            a short human title for a review queue
  summary          2-4 sentences: what this document says and why it matters
  capabilityId     the single capability this best evidences, from the list above, or null
  evidenceDemonstrated  what this document proves about that capability, specifically
  strength         one of NONE, WEAK, MODERATE, STRONG
  confidence       0 to 1
  citedExcerpts    array of 1-5 passages copied EXACTLY, character for character,
                   from the document text, each at least a full sentence

Classification rules:
- Acquisition, due diligence, M&A, CIM, deal, buyer, seller, transaction,
  management Q&A, diligence questions, investment committee, LOI, IOI and
  acquisition-related attachments are acquisition evidence when the content or
  SharePoint path supports that context.
- A Q&A document is not HR merely because it contains questions and answers.
  Classify it as acquisition Q&A when it relates to a transaction or diligence.
- Do not classify a document as HR, internal process or knowledge management
  unless the document itself clearly supports that interpretation.
- Document type describes the artefact; capability describes the business area
  or capability evidenced. Do not use the document type as the capability.

If the document evidences no listed capability, set capabilityId to null and
strength to NONE, and still summarise what the document is. Return {} if the
document is unreadable or carries no assessable content.`,
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  const citedExcerpts = verifyExcerpts(raw.citedExcerpts, source);
  if (citedExcerpts.length === 0) return null;

  const capabilityId = typeof raw.capabilityId === "string" ? raw.capabilityId : null;
  const matched = input.capabilities.find((c) => c.capabilityId === capabilityId) ?? null;
  const confidence = Number(raw.confidence);
  const strength = STRENGTHS.includes(raw.strength as (typeof STRENGTHS)[number])
    ? (raw.strength as DocumentFindingDraft["strength"])
    : "NONE";

  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : input.documentName;
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!summary) return null;

  return {
    documentType: typeof raw.documentType === "string" && raw.documentType.trim() ? raw.documentType.trim() : null,
    title: title.slice(0, 200),
    summary,
    // A capability id that is not in the candidate list is dropped rather than
    // stored as a dangling reference.
    capabilityId: matched ? matched.capabilityId : null,
    capabilityName: matched ? matched.name : null,
    evidenceDemonstrated:
      typeof raw.evidenceDemonstrated === "string" && raw.evidenceDemonstrated.trim()
        ? raw.evidenceDemonstrated.trim()
        : null,
    strength: matched ? strength : "NONE",
    confidence: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : 0,
    citedExcerpts,
  };
}
