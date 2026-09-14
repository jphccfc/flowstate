import { requestChatCompletion } from "@/lib/ai/client";

export type DomainCandidate = { domainId: string; name: string; description?: string | null };
export type DomainClassification = { domainId: string; domainName: string; confidence: number; reason: string };

const ACQUISITION_TERMS = /acquisition|acquire|m&a|merger|deal|due diligence|indicative offer|offer letter|cim|teaser|buyer|seller|transaction|management q&a|investment committee|loi|ioi|valuation|purchase price|spa\b/i;

/** Strong source/title signals override generic words such as process or Q&A. */
export function strongDomainHint(documentName: string, sourcePath: string | null | undefined, domains: DomainCandidate[]): DomainCandidate | null {
  const acquisition = domains.find((domain) => domain.name.trim().toLowerCase() === "acquisition");
  if (acquisition && ACQUISITION_TERMS.test(`${documentName}\n${sourcePath ?? ""}`)) return acquisition;
  return null;
}

export async function classifyDocumentDomain(input: {
  documentName: string;
  sourcePath?: string | null;
  text: string;
  domains: DomainCandidate[];
  complete?: typeof requestChatCompletion;
}): Promise<DomainClassification | null> {
  if (!input.domains.length) return null;
  const hinted = strongDomainHint(input.documentName, input.sourcePath, input.domains);
  if (hinted) return { domainId: hinted.domainId, domainName: hinted.name, confidence: 0.98, reason: "title or SharePoint path contains strong acquisition evidence" };
  const complete = input.complete ?? requestChatCompletion;
  const domainList = input.domains.map((d) => `${d.domainId}: ${d.name} — ${d.description ?? ""}`).join("\n");
  const response = await complete({
    maxTokens: 600,
    system: "Classify the document into exactly one configured business domain. Return JSON only. Do not infer a domain from a generic artefact label alone.",
    user: `Document title: ${input.documentName}\nSharePoint path: ${input.sourcePath ?? "(none)"}\n\nConfigured domains (id: name — description):\n${domainList}\n\nDocument text:\n${input.text.slice(0, 6000)}\n\nReturn {"domainId":"...","confidence":0 to 1,"reason":"short evidence-based reason"}. Choose only a configured id. If genuinely uncertain return {}. Transaction, acquisition, due diligence, CIM, offer, buyer/seller and management Q&A content belongs to Acquisition when that domain is configured.`,
  });
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as { domainId?: string; confidence?: number; reason?: string };
    const domain = input.domains.find((candidate) => candidate.domainId === raw.domainId);
    const confidence = Number(raw.confidence);
    if (!domain || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
    return { domainId: domain.domainId, domainName: domain.name, confidence, reason: typeof raw.reason === "string" ? raw.reason.slice(0, 500) : "" };
  } catch { return null; }
}
