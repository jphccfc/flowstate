import { describe, expect, it } from "vitest";
import { sourceHref } from "../../lib/ai/source-links";

describe("AI Hub source links", () => {
  it("maps known source kinds to the current workspace internal routes", () => {
    expect(sourceHref("workspace-1", "meeting agenda", "meeting-1")).toBe("/clients/workspace-1/meetings");
    expect(sourceHref("workspace-1", "document", "document-1")).toBe("/clients/workspace-1/capture");
    expect(sourceHref("workspace-1", "project record", "project-1")).toBe("/clients/workspace-1/planning");
  });

  it("omits links for source kinds without a safe detail route", () => {
    expect(sourceHref("workspace-1", "KPI record", "kpi-1")).toBeUndefined();
    expect(sourceHref("workspace-1", "achievement record", "achievement-1")).toBeUndefined();
    expect(sourceHref("workspace-1", "unknown", "source-1")).toBeUndefined();
  });

  it("never treats source data as an external or cross-workspace URL", () => {
    expect(sourceHref("workspace/evil?next=https://example.com", "document", "id?x=https://evil.example")).toBe("/clients/workspace%2Fevil%3Fnext%3Dhttps%3A%2F%2Fexample.com/capture");
  });
});
