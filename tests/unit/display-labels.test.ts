import { describe, expect, it } from "vitest";
import { formatDisplayLabel } from "@/lib/ui/display-label";

describe("display labels", () => {
  it("formats enum values for user-facing UI", () => {
    expect(formatDisplayLabel("DRAFT")).toBe("Draft");
    expect(formatDisplayLabel("NOT_REQUIRED")).toBe("Not required");
    expect(formatDisplayLabel("AWAITING_INPUT")).toBe("Awaiting input");
    expect(formatDisplayLabel("IN_PROGRESS")).toBe("In progress");
  });
});
