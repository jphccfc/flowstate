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
      partiallyReceived: 0,
      received: 2,
      accepted: 1,
      followUpRequired: 1,
      fulfilmentPercent: 50,
      reviewPercent: 50,
    });
  });

  it("shows partially received items separately without counting them as fully received", () => {
    const summary = summarizeDataRoomRequests([{ status: "PARTIALLY_RECEIVED" }, { status: "REQUESTED" }]);
    expect(summary).toMatchObject({ applicable: 2, partiallyReceived: 1, received: 0, fulfilmentPercent: 0 });
  });
});
