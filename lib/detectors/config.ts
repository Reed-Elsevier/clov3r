import type { AnomalyPriority, Currency } from "../schemas/enums";

export interface RuleConfig {
  duplicateWindowDays: number;
  duplicateAmountToleranceUsd: number;
  vendorAmountMultiplier: number;
  minimumVendorHistory: number;
  mediumAmountUsd: number;
  highAmountUsd: number;
  highOverdueDays: number;
  roundingTolerance: Record<Currency, number>;
}

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  duplicateWindowDays: 7,
  duplicateAmountToleranceUsd: 0.01,
  vendorAmountMultiplier: 3,
  minimumVendorHistory: 3,
  mediumAmountUsd: 10_000,
  highAmountUsd: 50_000,
  highOverdueDays: 30,
  roundingTolerance: { USD: 0.01, EUR: 0.01, GBP: 0.01, PHP: 0.01, JPY: 1 },
};

export function derivePriority(amountUsd: number, overdueDays: number, config: RuleConfig): AnomalyPriority {
  if (amountUsd >= config.highAmountUsd || overdueDays >= config.highOverdueDays) return "High";
  return amountUsd >= config.mediumAmountUsd ? "Medium" : "Low";
}

export function exceedsTolerance(actual: number, expected: number, tolerance: number): boolean {
  const floatingPointAllowance = Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected)) * 8;
  return Math.abs(actual - expected) > tolerance + floatingPointAllowance;
}