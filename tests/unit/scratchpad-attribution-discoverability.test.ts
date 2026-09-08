import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const route = readFileSync(resolve(root, "app/api/scratchpad/route.ts"), "utf8");
const scratchpad = readFileSync(resolve(root, "app/clients/[id]/scratchpad/page.tsx"), "utf8");
const overview = readFileSync(resolve(root, "app/clients/[id]/page.tsx"), "utf8");

describe("Scratch Pad update attribution", () => {
  it("derives safe actor metadata from the authenticated user", () => {
    expect(route).toContain("prisma.user.findUnique");
    expect(route).toContain("senderName");
    expect(route).toContain("senderEmail");
    expect(route).toContain("user?.name");
    expect(route).toContain("user?.email");
    expect(route).not.toContain("user.password");
    expect(route).not.toContain("user.access_token");
  });

  it("writes attribution on both create and revision-preserving update and returns metadata", () => {
    expect(route).toContain("senderName: actor.senderName");
    expect(route).toContain("senderEmail: actor.senderEmail");
    expect(route).toContain("revision: { increment: 1 }");
    expect(route).toContain("updatedAt");
  });

  it("renders truthful update attribution from persisted note metadata", () => {
    expect(scratchpad).toContain("updatedAt");
    expect(scratchpad).toContain("senderName");
    expect(scratchpad).toContain("Updated at");
    expect(scratchpad).toContain("toLocaleString");
  });
});

describe("Scratch Pad Overview discoverability", () => {
  it("offers a context-free quick notes link without removing existing workflows", () => {
    expect(overview).toContain('href: `/clients/${id}/scratchpad`');
    expect(overview).toContain("Quick notes");
    expect(overview).toContain("context-free");
    expect(overview).toContain("/clients/${id}/capture");
    expect(overview).toContain("/clients/${id}/meetings");
  });
});
