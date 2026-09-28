import { describe, expect, it } from "vitest";
import { extractFinancialSpreadsheet } from "@/lib/financial/spreadsheet-extraction";

describe("financial spreadsheet extraction", () => {
  it("extracts CSV values with immutable row and cell provenance", async () => {
    const workbook = await extractFinancialSpreadsheet(
      Buffer.from("Metric,FY2025,FY2026\nRevenue,8200000,9100000\nEBITDA,820000,610000\n", "utf8"),
      "management-accounts.csv",
    );

    expect(workbook).toEqual({
      format: "csv",
      sheets: [{
        name: "management-accounts",
        rows: [
          { rowNumber: 1, cells: [{ ref: "A1", value: "Metric" }, { ref: "B1", value: "FY2025" }, { ref: "C1", value: "FY2026" }] },
          { rowNumber: 2, cells: [{ ref: "A2", value: "Revenue" }, { ref: "B2", value: "8200000" }, { ref: "C2", value: "9100000" }] },
          { rowNumber: 3, cells: [{ ref: "A3", value: "EBITDA" }, { ref: "B3", value: "820000" }, { ref: "C3", value: "610000" }] },
        ],
      }],
    });
  });

  it("extracts XLSX shared strings, inline values and immutable cell provenance", async () => {
    const fixture = "UEsDBBQAAAAIAHZxPF1WPWshkAAAALgAAAAPAAAAeGwvd29ya2Jvb2sueG1sNU45DoMwEPyKtUVKDClSEANNGqQU+YIDS2yBvdauczw/VhSquTSjMcMnbOqFLJ5iB01Vw9CbN/F6J1pVCaO03IHLObVay+QwWKkoYSzZQhxsLpIfmpbFT3ih6RkwZn2s65Nm3Gwuw+J8EuiNOMQsf1TRBuzgdrAhna+gfuY4lxOguPWF8Dg3oHuj957ej/VfUEsDBBQAAAAIAHZxPF1DiVmvWAAAAHUAAAAaAAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHOzsa/IzVEoSy0qzszPs1Uy1DNQsrezCUrNSSwBChRnZBYUo3IVPFNslYo8UwyVFEISi9JTS2yVyvOLsoszUlNLivXBlKEe0EygdGVBqq1ShZK+nY0+qoEAUEsDBBQAAAAIAHZxPF2kgdc1RAAAAGMAAAAUAAAAeGwvc2hhcmVkU3RyaW5ncy54bWyzsa/IzVEoSy0qzszPs1Uy1DNQsrezKS4uARKZdjYldr6pJUWZyTb6QAF9kAhENCi1LDWvNBVd2NXJM8TFESGqDzIIAFBLAwQUAAAACAB2cTxdcI/bsq4AAACcAQAAGAAAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbH2QQQrCMBBFr1JyAJNMsShMp2jFC7hyWUrAoLaQhNbjm7YSkyJmk2T+/Hmfwer1fGSDMlb3XcnkRrCKcOzN3d6UcoTzdWpcQ2j6MTO+hxG20+MgWeZKZv1/IIF8IOTtRzsumu4eulMXZ3yPtoSOzlcQsEXuR/OpEhz1X0eROrjPEgJBCARRILkKBHN1B2I6qVYv2l6mWgLJAySPILCC5BFkxVikQv5A8GjJ/Lv7N1BLAQIUAxQAAAAIAHZxPF1WPWshkAAAALgAAAAPAAAAAAAAAAAAAACAAQAAAAB4bC93b3JrYm9vay54bWxQSwECFAMUAAAACAB2cTxdQ4lZr1gAAAB1AAAAGgAAAAAAAAAAAAAAgAG9AAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAMUAAAACAB2cTxdpIHXNUQAAABjAAAAFAAAAAAAAAAAAAAAgAFNAQAAeGwvc2hhcmVkU3RyaW5ncy54bWxQSwECFAMUAAAACAB2cTxdcI/bsq4AAACcAQAAGAAAAAAAAAAAAAAAgAHDAQAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsFBgAAAAAEAAQADQEAAKcCAAAAAA==";
    const workbook = await extractFinancialSpreadsheet(Buffer.from(fixture, "base64"), "management-accounts.xlsx");
    expect(workbook.format).toBe("xlsx");
    expect(workbook.sheets[0]?.name).toBe("P&L");
    expect(workbook.sheets[0]?.rows[0]?.cells).toEqual([{ ref: "A1", value: "Metric" }, { ref: "B1", value: "FY2025" }, { ref: "C1", value: "FY2026" }]);
    expect(workbook.sheets[0]?.rows[1]?.cells[2]).toEqual({ ref: "C2", value: "9100000" });
  });

  it("rejects unsupported spreadsheet extensions without attempting a parse", async () => {
    await expect(extractFinancialSpreadsheet(Buffer.from("x"), "management-accounts.pdf")).rejects.toThrow("Unsupported spreadsheet file extension: pdf");
  });
});
