export const maximumTakeProfitLevels = 10;
export const maximumEntryDcaLevels = 9;
export const maximumPositionDcaLevels = 20;
export const maximumPresetRatios = 10;
export const maximumProjectedPositionLevelRecords = 256;
export const maximumHistoricalPresetRatios = maximumPositionDcaLevels + 1;
export const maximumDecimalWorkPrecision = 4096;
export const maximumDecimalExpansionPlaces = 2048;

export type DecimalRepresentationLimits = {
  characters: number;
  coefficientDigits: number;
  integerPlaces: number;
  fractionalPlaces: number;
  exponent: number;
  exponentDigits: number;
};

export const inputDecimalLimits: Readonly<DecimalRepresentationLimits> = {
  characters: 256,
  coefficientDigits: 128,
  integerPlaces: 64,
  fractionalPlaces: 64,
  exponent: 64,
  exponentDigits: 3,
};

export const derivedDecimalLimits: Readonly<DecimalRepresentationLimits> = {
  characters: 4096,
  coefficientDigits: 2048,
  integerPlaces: 1024,
  fractionalPlaces: 1024,
  exponent: 1024,
  exponentDigits: 4,
};

const decimalPattern = /^[+-]?(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/;

/** Inspect bounded text before parsing or expanding a financial decimal. */
export function isBoundedDecimalString<Value>(
  value: Value,
  limits: Readonly<DecimalRepresentationLimits> = derivedDecimalLimits,
): value is Value & string {
  if (typeof value !== "string" || value.length === 0 || value.length > limits.characters)
    return false;
  const match = decimalPattern.exec(value);
  if (!match?.[1]) return false;
  const mantissa = match[1];
  const exponentText = match[2] ?? "0";
  if (exponentText.replace(/^[+-]/, "").length > limits.exponentDigits) return false;
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > limits.exponent) return false;
  const dot = mantissa.indexOf(".");
  const coefficient = mantissa.replace(".", "");
  if (coefficient.length > limits.coefficientDigits) return false;
  const point = (dot < 0 ? mantissa.length : dot) + exponent;
  const firstNonzero = coefficient.search(/[1-9]/);
  const integerPlaces = firstNonzero < 0 ? 1 : Math.max(0, point - firstNonzero);
  const fractionalPlaces = Math.max(0, coefficient.length - point);
  return integerPlaces <= limits.integerPlaces && fractionalPlaces <= limits.fractionalPlaces;
}

export class FinancialInputError extends Error {
  readonly code = "VALIDATION_ERROR";
}

export function assertDecimalRepresentation<Value>(
  value: Value,
  limits: Readonly<DecimalRepresentationLimits> = derivedDecimalLimits,
): asserts value is Value & string {
  if (!isBoundedDecimalString(value, limits))
    throw new FinancialInputError("Financial decimal exceeds the supported representation limits.");
}

export function assertLevelCount(levels: readonly unknown[], maximum: number): void {
  if (levels.length > maximum)
    throw new FinancialInputError(`This operation supports at most ${maximum} levels.`);
}
