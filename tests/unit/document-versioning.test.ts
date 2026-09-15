import { describe, expect, it } from "vitest";
import { compareDocumentVersions, documentFamilyKey, normalizeDocumentTitle, parseDocumentVersion } from "../../lib/documents/versioning";

describe("document version parsing", () => {
  it("parses explicit underscore versions", () => {
    expect(parseDocumentVersion("Indicative Offer · Project Vista Indicative Offer_v0_3.docx")).toEqual({
      baseTitle: "Indicative Offer · Project Vista Indicative Offer",
      versionLabel: "v0_3",
      versionMajor: 0,
      versionMinor: 3,
      explicit: true,
    });
  });

  it("treats an unversioned filename as the base version", () => {
    expect(parseDocumentVersion("Indicative Offer · Project Vista Indicative Offer.docx")).toEqual({
      baseTitle: "Indicative Offer · Project Vista Indicative Offer",
      versionLabel: null,
      versionMajor: null,
      versionMinor: null,
      explicit: false,
    });
  });

  it("does not group a similar title without an explicit version marker", () => {
    expect(parseDocumentVersion("Project Vista Indicative Offer - revised.docx").baseTitle)
      .toBe("Project Vista Indicative Offer - revised");
  });

  it("supports common numeric version markers", () => {
    expect(parseDocumentVersion("Offer_version_2.pdf")).toMatchObject({ versionLabel: "version_2", versionMajor: 2, versionMinor: 0, explicit: true });
    expect(parseDocumentVersion("Offer v1.2.pdf")).toMatchObject({ versionLabel: "v1.2", versionMajor: 1, versionMinor: 2, explicit: true });
  });

  it("groups only the same normalized title and source path", () => {
    expect(normalizeDocumentTitle("Project Vista — Indicative Offer")).toBe("project vista indicative offer");
    expect(documentFamilyKey("Offer_v0_3.docx", "/sites/Flow/Documents/Project Vista")).toBe(documentFamilyKey("Offer.docx", "/sites/flow/documents/project vista"));
    expect(documentFamilyKey("Offer_v0_3.docx", null)).toBeNull();
  });

  it("orders explicit versions after the unversioned base", () => {
    expect(compareDocumentVersions(parseDocumentVersion("Offer.docx"), parseDocumentVersion("Offer_v0_2.docx"))).toBeLessThan(0);
    expect(compareDocumentVersions(parseDocumentVersion("Offer_v0_3.docx"), parseDocumentVersion("Offer_v0_2.docx"))).toBeGreaterThan(0);
  });
});
