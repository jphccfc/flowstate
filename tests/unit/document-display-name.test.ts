import { describe, expect, it } from "vitest";
import { displayDocumentName } from "@/lib/documents/display-name";

describe("displayDocumentName", () => {
  it("uses the decoded SharePoint file query parameter", () => {
    expect(displayDocumentName("https://tenant.sharepoint.com/:w:/r/site/Doc.aspx?sourcedoc=%7B40B615E1-8C1E-4C54-A6F3-5E6733633F62%7D&file=2026.09.10%20-%20KP%20Site%20Visit%20Notes_Consolidated.docx&action=default&mobileredirect=true")).toBe("2026.09.10 - KP Site Visit Notes_Consolidated.docx");
  });

  it("falls back safely for ordinary source references", () => {
    expect(displayDocumentName("https://example.test/files/notes.docx")).toBe("notes.docx");
    expect(displayDocumentName(null)).toBe("Imported document");
  });
});
