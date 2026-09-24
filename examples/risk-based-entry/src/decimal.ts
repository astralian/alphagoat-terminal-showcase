import { Decimal } from "decimal.js";
import {
  assertDecimalRepresentation,
  FinancialInputError,
  maximumDecimalExpansionPlaces,
  maximumDecimalWorkPrecision,
} from "./financial-limits.js";

export function parseDecimal(value: string): Decimal {
  assertDecimalRepresentation(value);
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) throw new Error("Decimal value must be finite");
  return decimal;
}

export function assertDecimalPrecision(precision: number): void {
  if (!Number.isSafeInteger(precision) || precision < 1 || precision > maximumDecimalWorkPrecision)
    throw new FinancialInputError("Financial calculation exceeds the supported precision.");
}

export function assertDecimalExpansion(value: Decimal, scale = value.decimalPlaces()): void {
  const integerPlaces = Math.max(value.e + 1, 1);
  if (
    !value.isFinite() ||
    !Number.isSafeInteger(scale) ||
    scale < 0 ||
    integerPlaces + scale > maximumDecimalExpansionPlaces
  )
    throw new FinancialInputError("Financial calculation exceeds the supported decimal expansion.");
}

export function isPositiveDecimal(value: string): boolean {
  try {
    return parseDecimal(value).greaterThan(0);
  } catch {
    return false;
  }
}

export function sumDecimalStringsExactly(values: readonly string[]): Decimal {
  const decimals = values.map(parseDecimal);
  let integerDigits = 0;
  let fractionalDigits = 0;
  for (const value of decimals) {
    integerDigits = Math.max(integerDigits, value.e + 1);
    fractionalDigits = Math.max(fractionalDigits, value.sd() - value.e - 1);
  }
  const carryDigits = Math.ceil(Math.log10(Math.max(values.length, 1)));
  const precision = Math.max(integerDigits + fractionalDigits + carryDigits, Decimal.precision);
  assertDecimalPrecision(precision);
  // Reuse the configured constructor when it already guarantees exact finite arithmetic.
  const ExactDecimal = precision === Decimal.precision ? Decimal : Decimal.clone({ precision });
  const result = decimals.reduce((total, value) => total.plus(value), new ExactDecimal(0));
  assertDecimalExpansion(result);
  assertDecimalRepresentation(result.toString());
  return result;
}

/** A finite decimal product needs at most the sum of its factors' significant digits. */
export function multiplyDecimalStringsExactly(values: readonly string[]): Decimal {
  const operands = values.map(parseDecimal);
  const precision = Math.max(
    Decimal.precision,
    operands.reduce((total, value) => total + value.sd(), 0),
  );
  assertDecimalPrecision(precision);
  const expansion = operands.reduce(
    (total, value) => total + Math.max(value.e + 1, 0) + value.decimalPlaces(),
    0,
  );
  if (expansion > maximumDecimalExpansionPlaces)
    throw new FinancialInputError("Financial product exceeds the supported decimal expansion.");
  const ExactDecimal = precision === Decimal.precision ? Decimal : Decimal.clone({ precision });
  const result = operands.reduce((total, value) => total.times(value), new ExactDecimal(1));
  assertDecimalExpansion(result);
  assertDecimalRepresentation(result.toString());
  return result;
}
