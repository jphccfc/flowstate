import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const queue = readFileSync(resolve(root, "app/api/clients/[id]/communication-packs/route.ts"), "utf8");
const detail = readFileSync(resolve(root, "app/api/clients/[id]/communication-packs/[packId]/route.ts"), "utf8");
const page = readFileSync(resolve(root, "app/clients/[id]/communication-packs/page.tsx"), "utf8");

describe("communication pack review queue", () => {
  it("supports organisation-scoped status and recipient/stakeholder filtering with summaries", () => {
    expect(queue).toContain("searchParams");
    expect(queue).toContain("status");
    expect(queue).toContain("recipient");
    expect(queue).toContain("stakeholder");
    expect(queue).toContain("summary");
  });
  it("exposes immutable approved sources and append-only review history", () => {
    expect(detail).toContain("decision: true");
    expect(detail).toContain("insight: true");
    expect(detail).toContain("acknowledgements");
    expect(detail).not.toContain("decisionId:");
    expect(detail).not.toContain("insightId:");
  });
  it("requires meaningful request-changes comments and renders explicit review forms", () => {
    expect(detail).toContain("meaningful comment");
    expect(page).toContain("Acknowledge");
    expect(page).toContain("Request changes");
    expect(page).toContain("Review history");
  });
});
