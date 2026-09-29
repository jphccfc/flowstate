import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/ai/page.tsx"), "utf8");

describe("FlowCoach Data Room progress fallback", () => {
  it("answers typo-tolerant completion wording from the protected request-pack API", () => {
    expect(page).toContain("isDataRoomProgressQuestion(question)");
    expect(page).toContain("/data-room");
    expect(page).toContain("Data room request progress");
  });
});
