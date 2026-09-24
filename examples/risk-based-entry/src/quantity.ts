import type { Decimal } from "decimal.js";
import type { MarketQuantityRules } from "./quantity-rules.js";
import { assertDecimalExpansion, parseDecimal } from "./decimal.js";

export function quantityScale(rules: MarketQuantityRules): number {
  return parseDecimal(rules.stepSize).decimalPlaces();
}

export function quantizeQuantityDown(quantity: Decimal.Value, rules: MarketQuantityRules): Decimal {
  const step = parseDecimal(rules.stepSize);
  if (!step.isFinite() || !step.greaterThan(0)) throw new Error("Quantity step must be positive");
  const value = parseDecimal(quantity.toString());
  const result = value.dividedBy(step).floor().times(step);
  assertDecimalExpansion(result);
  return result;
}

export function formatQuantity(quantity: Decimal.Value, rules: MarketQuantityRules): string {
  const value = parseDecimal(quantity.toString());
  const scale = quantityScale(rules);
  assertDecimalExpansion(value, scale);
  return value.toFixed(scale);
}
