import { describe, expect, it } from "vitest";
import { rankWorkspaceSources, type WorkspaceSource } from "../../lib/ai/hub";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/ai/route.ts"), "utf8");
const sourceLinks = readFileSync(resolve(process.cwd(), "lib/ai/source-links.ts"), "utf8");

const source = (id: string, title: string, text: string, extras = {}): WorkspaceSource => ({ id, title, text, date: new Date("2026-09-14"), kind: "document", ...extras });

describe("FlowCoach evidence retrieval", () => {
  it("retrieves structured document findings as authorized context", () => {
    expect(route).toContain("prisma.documentFinding.findMany");
    expect(route).toContain("citedExcerpts");
    expect(route).toContain("domainName");
    expect(route).toContain("capabilityName");
  });

  it("uses document filenames rather than opaque SharePoint URLs as titles", () => {
    expect(route).toContain("input.attachments[0]?.filename");
  });

  it("boosts an exact phrase and all-term match", () => {
    const sources = [
      source("weak", "Unrelated report", "The typical delivery time is discussed."),
      source("strong", "Project Vista Indicative Offer", "The typical sales cycle is approximately one month."),
    ];
    const ranked = rankWorkspaceSources("how long is the typical sales cycle", sources);
    expect(ranked[0].id).toBe("strong");
  });

  it("returns enough surrounding context for a factual answer", () => {
    const ranked = rankWorkspaceSources("sales cycle", [source("doc", "Offer", "A".repeat(300) + " sales cycle is approximately one month and delivery follows." )]);
    expect(ranked[0].excerpt.length).toBeGreaterThanOrEqual(250);
    expect(ranked[0].excerpt).toContain("sales cycle is approximately one month");
  });

  it("makes document-finding citations link back to the findings page", () => {
    expect(sourceLinks).toContain('"document finding": "findings"');
  });
});
