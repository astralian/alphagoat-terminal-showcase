import { Decimal } from "decimal.js";
import type { MarketQuantityRules } from "./quantity-rules.js";
import { parseDecimal } from "./decimal.js";

export function quantityScale(rules: MarketQuantityRules): number {
  return parseDecimal(rules.stepSize).decimalPlaces();
}

export function quantizeQuantityDown(quantity: Decimal.Value, rules: MarketQuantityRules): Decimal {
  const step = parseDecimal(rules.stepSize);
  if (!step.isFinite() || !step.greaterThan(0)) throw new Error("Quantity step must be positive");
  return new Decimal(quantity).dividedBy(step).floor().times(step);
}

export function formatQuantity(quantity: Decimal.Value, rules: MarketQuantityRules): string {
  return new Decimal(quantity).toFixed(quantityScale(rules));
}
