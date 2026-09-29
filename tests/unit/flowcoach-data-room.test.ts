import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/ai/route.ts"), "utf8");

describe("FlowCoach Data Room progress retrieval", () => {
  it("reads the authorized data-room pack and answers its progress deterministically", () => {
    expect(route).toContain("dataRoomRequestPack.findMany");
    expect(route).toContain("Data room request progress");
    expect(route).toContain("fulfilmentPercent");
    expect(route).toContain("complete|completion");
  });
});
