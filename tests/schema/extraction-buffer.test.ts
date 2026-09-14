import { describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  PDFParse: vi.fn().mockImplementation(function () {
    return { getText: vi.fn().mockResolvedValue({ text: "Extracted PDF content" }), destroy: vi.fn().mockResolvedValue(undefined) };
  }),
}));
vi.mock("mammoth", () => ({
  extractRawText: vi.fn().mockResolvedValue({ value: "Extracted DOCX content" }),
}));

import { extractDocumentTextFromBuffer } from "../../lib/documents/extraction";

describe("extractDocumentTextFromBuffer", () => {
  it("uses the Graph item filename rather than an opaque download URL", async () => {
    const result = await extractDocumentTextFromBuffer(Buffer.from("bytes"), "document.docx");
    expect(result).toBe("Extracted DOCX content");
  });

  it("parses a PDF when the download URL has no useful extension", async () => {
    const result = await extractDocumentTextFromBuffer(Buffer.from("bytes"), "brief.pdf");
    expect(result).toBe("Extracted PDF content");
  });

  it("rejects unsupported filenames before attempting a parser", async () => {
    await expect(extractDocumentTextFromBuffer(Buffer.from("bytes"), "model.xlsx")).rejects.toThrow("Unsupported document file extension: xlsx");
  });
});
