import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/ai/route.ts"), "utf8");

describe("FlowCoach scratchpad meeting retrieval", () => {
  it("includes a scratchpad note's linked meeting title in searchable FlowCoach context", () => {
    expect(route).toContain("meetingContext: { select: { title: true");
    expect(route).toContain("input.meetingContext?.title");
  });
});
