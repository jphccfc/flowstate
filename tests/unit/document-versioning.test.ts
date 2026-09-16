import { describe, expect, it } from "vitest";
import { compareDocumentVersions, documentFamilyKey, normalizeDocumentTitle, parseDocumentVersion } from "../../lib/documents/versioning";

describe("document versioning", () => {
  it("parses explicit versions and preserves an unversioned base", () => {
    expect(parseDocumentVersion("Offer.docx")).toMatchObject({ explicit: false, versionMajor: null });
    expect(parseDocumentVersion("Offer_v0_4.docx")).toMatchObject({ explicit: true, versionMajor: 0, versionMinor: 4 });
  });

  it("groups the four confirmed Project Vista offer versions into one family", () => {
    const names = ["Project Vista Indicative Offer.docx", "Project Vista Indicative Offer_v0_2.docx", "Project Vista Indicative Offer_v0_3.docx", "Project Vista Revised Asset Indicative Offer_v0_4.docx"];
    expect(new Set(names.map((name) => documentFamilyKey(name, "Project Vista/Offers"))).size).toBe(1);
    expect(names.slice().sort((a, b) => compareDocumentVersions(parseDocumentVersion(a), parseDocumentVersion(b)))).toEqual(names);
  });

  it("does not remove arbitrary title words while normalizing", () => {
    expect(normalizeDocumentTitle("Operations Revised Plan")).toBe("operations revised plan");
  });
});
