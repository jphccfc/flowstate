import { describe, expect, it } from "vitest";
import { isDataRoomProgressQuestion } from "@/lib/data-room/question";

describe("Data Room progress question routing", () => {
  it("recognises the reported due-diligence percentage wording", () => {
    expect(isDataRoomProgressQuestion("whats the due dilligence data room %")).toBe(true);
  });
});
