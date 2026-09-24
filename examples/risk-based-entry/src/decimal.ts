import { Decimal } from "decimal.js";

export function parseDecimal(value: string): Decimal {
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) throw new Error("Decimal value must be finite");
  return decimal;
}

export function isPositiveDecimal(value: string): boolean {
  try {
    return parseDecimal(value).greaterThan(0);
  } catch {
    return false;
  }
}

export function sumDecimalStringsExactly(values: readonly string[]): Decimal {
  const decimals = values.map((value) => new Decimal(value));
  const integerDigits = Math.max(0, ...decimals.map((value) => Math.max(value.e + 1, 0)));
  const fractionalDigits = Math.max(
    0,
    ...decimals.map((value) => Math.max(value.sd() - value.e - 1, 0)),
  );
  const carryDigits = Math.ceil(Math.log10(Math.max(values.length, 1)));
  const ExactDecimal = Decimal.clone({
    precision: Math.max(integerDigits + fractionalDigits + carryDigits, Decimal.precision),
  });
  return values.reduce((total, value) => total.plus(value), new ExactDecimal(0));
}

/** A finite decimal product needs at most the sum of its factors' significant digits. */
export function multiplyDecimalStringsExactly(values: readonly string[]): Decimal {
  const operands = values.map(parseDecimal);
  const ExactDecimal = Decimal.clone({
    precision: Math.max(
      Decimal.precision,
      operands.reduce((total, value) => total + value.sd(), 0),
    ),
  });
  return operands.reduce((total, value) => total.times(value), new ExactDecimal(1));
}
