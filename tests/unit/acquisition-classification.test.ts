import { describe, expect, it, vi } from "vitest";
import { generateDocumentFinding } from "../../lib/ai/document-findings";

const quote = "The buyer requested management answers about the target acquisition and transaction risks.";

describe("acquisition document classification", () => {
  it("passes SharePoint context to the model", async () => {
    const complete = vi.fn(async (request: { user: string }) => {
      expect(request.user).toContain("Project Vista/Acquisition Q&A/");
      return JSON.stringify({
        documentType: "acquisition Q&A", title: "Acquisition Q&A", summary: "Due diligence responses.",
        capabilityId: null, strength: "NONE", confidence: 0.7, citedExcerpts: [quote],
      });
    });
    await generateDocumentFinding({ documentName: "Q&A.docx", sourcePath: "Project Vista/Acquisition Q&A/Q&A.docx", text: quote, capabilities: [], complete: complete as never });
    expect(complete).toHaveBeenCalledOnce();
  });

  it("explicitly instructs the model not to treat transaction Q&A as HR", async () => {
    const complete = vi.fn(async (request: { user: string }) => {
      expect(request.user).toContain("A Q&A document is not HR");
      expect(request.user).toContain("acquisition Q&A");
      return JSON.stringify({ documentType: "acquisition Q&A", title: "Q&A", summary: "Due diligence responses.", capabilityId: null, strength: "NONE", confidence: 0.7, citedExcerpts: [quote] });
    });
    await generateDocumentFinding({ documentName: "Q&A.docx", sourcePath: "Project Vista/Acquisition Q&A/Q&A.docx", text: quote, capabilities: [], complete: complete as never });
  });
});
