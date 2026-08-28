import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateDocumentFile } from "../../app/clients/[id]/capture/document-validation";

const capturePage = readFileSync(resolve(process.cwd(), "app/clients/[id]/capture/page.tsx"), "utf8");

describe("Capture document ingestion contract", () => {
  it("accepts PDF and DOCX files and rejects unsupported document extensions", () => {
    expect(validateDocumentFile(new File(["pdf"], "evidence.PDF", { type: "application/pdf" }))).toBeNull();
    expect(validateDocumentFile(new File(["docx"], "evidence.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).toBeNull();
    expect(validateDocumentFile(new File(["sheet"], "evidence.xlsx"))).toBe("Documents must be PDF or DOCX files.");
    expect(validateDocumentFile(null)).toBe("Choose a PDF or DOCX file.");
  });

  it("exposes a selectable document mode with guidance and accessible upload states", () => {
    expect(capturePage).toContain('<option value="DOCUMENT">Document (PDF or DOCX)</option>');
    expect(capturePage).toContain('accept={type === "AUDIO" ? "audio/*" : ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"}');
    expect(capturePage).toContain('aria-describedby={type === "DOCUMENT" ? "document-file-help document-file-error" : undefined}');
    expect(capturePage).toContain('role="status"');
    expect(capturePage).toContain('role="alert"');
    expect(capturePage).toContain("Document upload in progress");
  });

  it("keeps text capture wired to rawText and the existing API contract", () => {
    expect(capturePage).toContain('formData.append("rawText", rawText)');
    expect(capturePage).toContain('fetch("/api/captured-inputs", { method: "POST", body: formData })');
    expect(capturePage).toContain('formData.append("type", type)');
  });
});
