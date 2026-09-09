import { describe, expect, it } from "vitest";
import { rankWorkspaceSources, type WorkspaceSource } from "../../lib/ai/hub";

describe("AI Hub workspace retrieval", () => {
  const sources: WorkspaceSource[] = [
    {
      id: "request-1",
      kind: "document",
      title: "2026 request for proposal",
      date: new Date("2026-03-04T00:00:00Z"),
      text: "The request asks for a current data room export and delivery timeline.",
    },
    {
      id: "meeting-1",
      kind: "meeting agenda",
      title: "Quarterly planning",
      date: new Date("2026-02-01T00:00:00Z"),
      text: "Review operating priorities and owners.",
    },
  ];

  it("ranks matching request documents and returns bounded cited excerpts", () => {
    const results = rankWorkspaceSources("Where is the request for a data room export?", sources);

    expect(results[0]).toMatchObject({ id: "request-1", title: "2026 request for proposal" });
    expect(results[0].excerpt).toContain("data room export");
    expect(results[0].excerpt.length).toBeLessThanOrEqual(600);
  });

  it("returns no sources when no authorized workspace text matches", () => {
    expect(rankWorkspaceSources("What is the moon made of?", sources)).toEqual([]);
  });
});
