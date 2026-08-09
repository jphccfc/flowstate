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
