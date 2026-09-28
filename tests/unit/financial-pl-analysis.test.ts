import { describe, expect, it } from "vitest";
import { analyzeTwoPeriodProfitAndLoss } from "@/lib/financial/pl-analysis";

describe("two-period P&L deterministic analysis", () => {
  it("calculates growth, EBITDA movement and margins from cell-cited facts", () => {
    const result = analyzeTwoPeriodProfitAndLoss({
      currency: "CAD",
      periods: [
        { label: "FY2025", revenue: { value: 8_200_000, source: "P&L!B2" }, ebitda: { value: 820_000, source: "P&L!B5" } },
        { label: "FY2026", revenue: { value: 9_100_000, source: "P&L!C2" }, ebitda: { value: 610_000, source: "P&L!C5" } },
      ],
    });

    expect(result.status).toBe("COMPLETE");
    expect(result.metrics).toEqual([
      expect.objectContaining({ key: "revenue_growth", value: 0.10975609756097561, unit: "percentage", inputs: ["P&L!B2", "P&L!C2"] }),
      expect.objectContaining({ key: "ebitda_movement", value: -210_000, unit: "CAD", inputs: ["P&L!B5", "P&L!C5"] }),
      expect.objectContaining({ key: "ebitda_margin_current", value: 0.06703296703296703, unit: "percentage", inputs: ["P&L!C2", "P&L!C5"] }),
    ]);
  });

  it("withholds a metric when a required source value is absent rather than treating it as zero", () => {
    const result = analyzeTwoPeriodProfitAndLoss({
      currency: "CAD",
      periods: [
        { label: "FY2025", revenue: { value: 8_200_000, source: "P&L!B2" } },
        { label: "FY2026", revenue: { value: 9_100_000, source: "P&L!C2" }, ebitda: { value: 610_000, source: "P&L!C5" } },
      ],
    });

    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.metrics).toContainEqual(expect.objectContaining({ key: "revenue_growth", status: "COMPLETE" }));
    expect(result.metrics).toContainEqual(expect.objectContaining({ key: "ebitda_movement", status: "INSUFFICIENT_DATA", reason: "Missing EBITDA for FY2025" }));
    expect(result.metrics).toContainEqual(expect.objectContaining({ key: "ebitda_margin_current", status: "COMPLETE" }));
  });
});
