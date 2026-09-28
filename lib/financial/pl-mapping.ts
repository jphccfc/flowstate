import type { CitedFinancialValue, ProfitAndLossPeriod } from "@/lib/financial/pl-analysis";
import type { FinancialSpreadsheet, FinancialSpreadsheetCell } from "@/lib/financial/spreadsheet-extraction";

export type ControlledProfitAndLossMapping = {
  status: "MAPPED" | "INSUFFICIENT_DATA";
  periods: ProfitAndLossPeriod[];
  limitations: string[];
};

function normaliseLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseFinancialNumber(value: string): number | null {
  const cleaned = value.trim().replace(/[$,\s]/g, "");
  if (!cleaned || cleaned === "-" || /^n\/?a$/i.test(cleaned)) return null;
  const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const numeric = Number((negative ? cleaned.slice(1, -1) : cleaned).replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(numeric) ? (negative ? -numeric : numeric) : null;
}

function valueFor(cell: FinancialSpreadsheetCell | undefined, sheet: string): CitedFinancialValue | undefined {
  if (!cell) return undefined;
  const value = parseFinancialNumber(cell.value);
  return value === null ? undefined : { value, source: `${sheet}!${cell.ref}` };
}

/**
 * Maps only the declared two-period P&L shape: a header row with two labelled
 * periods and rows explicitly named Revenue and EBITDA. It fails closed rather
 * than inferring financial semantics from arbitrary spreadsheets.
 */
export function mapControlledProfitAndLoss(workbook: FinancialSpreadsheet): ControlledProfitAndLossMapping {
  const sheet = workbook.sheets.find((candidate) => candidate.rows.length > 0);
  if (!sheet) return { status: "INSUFFICIENT_DATA", periods: [], limitations: ["Workbook contains no populated worksheet"] };

  const header = sheet.rows[0].cells;
  if (header.length < 3 || !header[1].value.trim() || !header[2].value.trim()) {
    return { status: "INSUFFICIENT_DATA", periods: [], limitations: ["A controlled P&L needs exactly two labelled period columns"] };
  }
  const periodCells = [header[1], header[2]];
  const revenueRow = sheet.rows.find((row) => normaliseLabel(row.cells[0]?.value ?? "") === "revenue");
  const ebitdaRow = sheet.rows.find((row) => normaliseLabel(row.cells[0]?.value ?? "") === "ebitda");
  const limitations: string[] = [];
  if (!revenueRow) limitations.push("Revenue row was not found");
  if (!ebitdaRow) limitations.push("EBITDA row was not found");
  if (limitations.length) return { status: "INSUFFICIENT_DATA", periods: [], limitations };

  const periods = periodCells.map((periodCell, index) => ({
    label: periodCell.value.trim(),
    revenue: valueFor(revenueRow!.cells[index + 1], sheet.name),
    ebitda: valueFor(ebitdaRow!.cells[index + 1], sheet.name),
  }));
  for (const period of periods) {
    if (!period.revenue) limitations.push(`Revenue value is invalid or missing for ${period.label}`);
    if (!period.ebitda) limitations.push(`EBITDA value is invalid or missing for ${period.label}`);
  }
  return { status: limitations.length ? "INSUFFICIENT_DATA" : "MAPPED", periods, limitations };
}
