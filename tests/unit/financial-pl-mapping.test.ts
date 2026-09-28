import { describe, expect, it } from "vitest";
import { mapControlledProfitAndLoss } from "@/lib/financial/pl-mapping";

describe("controlled P&L mapping", () => {
  it("maps recognised two-period revenue and EBITDA labels with workbook-cell provenance", () => {
    const result = mapControlledProfitAndLoss({
      format: "xlsx",
      sheets: [{
        name: "P&L",
        rows: [
          { rowNumber: 1, cells: [{ ref: "A1", value: "Metric" }, { ref: "B1", value: "FY2025" }, { ref: "C1", value: "FY2026" }] },
          { rowNumber: 2, cells: [{ ref: "A2", value: "Revenue" }, { ref: "B2", value: "8,200,000" }, { ref: "C2", value: "9,100,000" }] },
          { rowNumber: 5, cells: [{ ref: "A5", value: "EBITDA" }, { ref: "B5", value: "820,000" }, { ref: "C5", value: "610,000" }] },
        ],
      }],
    });

    expect(result).toEqual({
      status: "MAPPED",
      periods: [
        { label: "FY2025", revenue: { value: 8200000, source: "P&L!B2" }, ebitda: { value: 820000, source: "P&L!B5" } },
        { label: "FY2026", revenue: { value: 9100000, source: "P&L!C2" }, ebitda: { value: 610000, source: "P&L!C5" } },
      ],
      limitations: [],
    });
  });

  it("fails closed on an ambiguous or incomplete controlled layout", () => {
    const result = mapControlledProfitAndLoss({
      format: "csv",
      sheets: [{ name: "Export", rows: [{ rowNumber: 1, cells: [{ ref: "A1", value: "Revenue" }, { ref: "B1", value: "9,100,000" }] }] }],
    });

    expect(result).toEqual(expect.objectContaining({ status: "INSUFFICIENT_DATA" }));
    expect(result.limitations).toContain("A controlled P&L needs exactly two labelled period columns");
  });
});
