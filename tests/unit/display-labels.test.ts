import { describe, expect, it } from "vitest";
import { formatDisplayLabel } from "@/lib/ui/display-label";

describe("display labels", () => {
  it("formats enum values for user-facing UI", () => {
    expect(formatDisplayLabel("DRAFT")).toBe("Draft");
    expect(formatDisplayLabel("NOT_REQUIRED")).toBe("Not Required");
    expect(formatDisplayLabel("AWAITING_INPUT")).toBe("Awaiting Input");
    expect(formatDisplayLabel("IN_PROGRESS")).toBe("In Progress");
  });
});
