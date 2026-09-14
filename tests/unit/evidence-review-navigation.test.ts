import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const nav = readFileSync(resolve(process.cwd(), "components/layout/WorkspaceNav.tsx"), "utf8");
const overview = readFileSync(resolve(process.cwd(), "app/clients/[id]/page.tsx"), "utf8");
const tagReview = readFileSync(resolve(process.cwd(), "app/clients/[id]/review/page.tsx"), "utf8");
const findings = readFileSync(resolve(process.cwd(), "app/clients/[id]/findings/page.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/findings/route.ts"), "utf8");

describe("document-first evidence review", () => {
  it("adds Evidence review to workspace navigation", () => {
    expect(nav).toContain('label: "Evidence review"');
    expect(nav).toContain("/findings");
  });

  it("renames the granular queue to Tag review", () => {
    expect(nav).toContain('label: "Tag review"');
    expect(overview).toContain('label: "Tag review"');
    expect(tagReview).toContain("Detailed segment-level AI suggestions");
  });

  it("provides a document search control", () => {
    expect(findings).toContain("Search document findings");
    expect(findings).toContain("appliedQuery");
    expect(api).toContain("request.nextUrl.searchParams.get(\"q\")");
  });

  it("shows a source removed state separately", () => {
    expect(findings).toContain("SOURCE_REMOVED");
    expect(findings).toContain("Source removed");
    expect(findings).toContain("removed from SharePoint");
  });

  it("keeps document re-analysis on the document-first page", () => {
    expect(findings).toContain("Re-analyse");
    expect(findings).toContain("/reanalyze");
    expect(tagReview).not.toContain("/reanalyze");
  });
});
