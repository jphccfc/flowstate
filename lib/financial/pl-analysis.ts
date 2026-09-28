export type CitedFinancialValue = { value: number; source: string };
export type ProfitAndLossPeriod = {
  label: string;
  revenue?: CitedFinancialValue;
  ebitda?: CitedFinancialValue;
};
export type ProfitAndLossRequest = { currency: string; periods: [ProfitAndLossPeriod, ProfitAndLossPeriod] };
export type FinancialMetric = {
  key: "revenue_growth" | "ebitda_movement" | "ebitda_margin_current";
  value: number | null;
  unit: "percentage" | string;
  inputs: string[];
  status: "COMPLETE" | "INSUFFICIENT_DATA";
  reason?: string;
};
export type ProfitAndLossAnalysis = { status: "COMPLETE" | "INSUFFICIENT_DATA"; metrics: FinancialMetric[] };

function requiredValue(
  period: ProfitAndLossPeriod,
  field: "revenue" | "ebitda",
  label: "Revenue" | "EBITDA",
): { value: CitedFinancialValue } | { reason: string } {
  const value = period[field];
  return value ? { value } : { reason: `Missing ${label} for ${period.label}` };
}

function insufficient(key: FinancialMetric["key"], unit: FinancialMetric["unit"], reason: string): FinancialMetric {
  return { key, value: null, unit, inputs: [], status: "INSUFFICIENT_DATA", reason };
}

function missingReason(...results: Array<{ value: CitedFinancialValue } | { reason: string }>): string {
  const missing = results.find((result): result is { reason: string } => "reason" in result);
  return missing?.reason ?? "Required financial source value is unavailable";
}

/**
 * Performs the first controlled finance-engine slice. Values are supplied only
 * with source citations; missing values are never coerced to zero.
 */
export function analyzeTwoPeriodProfitAndLoss(request: ProfitAndLossRequest): ProfitAndLossAnalysis {
  const [previous, current] = request.periods;
  const previousRevenue = requiredValue(previous, "revenue", "Revenue");
  const currentRevenue = requiredValue(current, "revenue", "Revenue");
  const previousEbitda = requiredValue(previous, "ebitda", "EBITDA");
  const currentEbitda = requiredValue(current, "ebitda", "EBITDA");

  const revenueGrowth = "value" in previousRevenue && "value" in currentRevenue
    ? previousRevenue.value.value === 0
      ? insufficient("revenue_growth", "percentage", `Revenue for ${previous.label} is zero; growth is not assessable`)
      : { key: "revenue_growth" as const, value: (currentRevenue.value.value - previousRevenue.value.value) / previousRevenue.value.value, unit: "percentage", inputs: [previousRevenue.value.source, currentRevenue.value.source], status: "COMPLETE" as const }
    : insufficient("revenue_growth", "percentage", missingReason(previousRevenue, currentRevenue));

  const ebitdaMovement = "value" in previousEbitda && "value" in currentEbitda
    ? { key: "ebitda_movement" as const, value: currentEbitda.value.value - previousEbitda.value.value, unit: request.currency, inputs: [previousEbitda.value.source, currentEbitda.value.source], status: "COMPLETE" as const }
    : insufficient("ebitda_movement", request.currency, missingReason(previousEbitda, currentEbitda));

  const currentMargin = "value" in currentRevenue && "value" in currentEbitda
    ? currentRevenue.value.value === 0
      ? insufficient("ebitda_margin_current", "percentage", `Revenue for ${current.label} is zero; EBITDA margin is not assessable`)
      : { key: "ebitda_margin_current" as const, value: currentEbitda.value.value / currentRevenue.value.value, unit: "percentage", inputs: [currentRevenue.value.source, currentEbitda.value.source], status: "COMPLETE" as const }
    : insufficient("ebitda_margin_current", "percentage", missingReason(currentRevenue, currentEbitda));

  const metrics = [revenueGrowth, ebitdaMovement, currentMargin];
  return { status: metrics.every((metric) => metric.status === "COMPLETE") ? "COMPLETE" : "INSUFFICIENT_DATA", metrics };
}
