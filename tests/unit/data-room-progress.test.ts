import { describe, expect, it } from "vitest";
import { summarizeDataRoomRequests } from "@/lib/data-room/progress";

describe("Data Room Request Pack progress", () => {
  it("reports fulfilment and review separately, excluding explicitly not-applicable requests", () => {
    const summary = summarizeDataRoomRequests([
      { status: "REQUESTED" },
      { status: "RECEIVED" },
      { status: "ACCEPTED" },
      { status: "FOLLOW_UP_REQUIRED" },
      { status: "NOT_APPLICABLE" },
    ]);

    expect(summary).toEqual({
      total: 5,
      applicable: 4,
      received: 2,
      accepted: 1,
      followUpRequired: 1,
      fulfilmentPercent: 50,
      reviewPercent: 50,
    });
  });
});
