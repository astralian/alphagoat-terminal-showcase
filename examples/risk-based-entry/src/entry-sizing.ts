import { Decimal } from "decimal.js";
import { type MarketQuantityRules, marketQuantityRulesSchema } from "./quantity-rules.js";
import { multiplyDecimalStringsExactly, sumDecimalStringsExactly } from "./decimal.js";
import {
  derivedDecimalLimits,
  FinancialInputError,
  inputDecimalLimits,
  isBoundedDecimalString,
  maximumEntryDcaLevels,
  maximumProjectedPositionLevelRecords,
} from "./financial-limits.js";
import { formatQuantity, quantizeQuantityDown } from "./quantity.js";

export type EntrySizingErrorCode =
  | "INVALID_WALLET_BALANCE"
  | "INVALID_CONTRACT_SIZE"
  | "INVALID_ENTRY_PRICE"
  | "INVALID_STOP_PRICE"
  | "STOP_NOT_PROTECTIVE"
  | "INVALID_RISK_PERCENT"
  | "INVALID_ALLOCATION_TOTAL"
  | "CALCULATION_LIMIT"
  | "QUANTITY_BELOW_MINIMUM"
  | "QUANTITY_ABOVE_MAXIMUM"
  | "NOTIONAL_BELOW_MINIMUM";

export type EntrySizingLevelIntent = {
  price: string;
  allocationPercent: string;
};

export type EntrySizingInput = {
  side: "LONG" | "SHORT";
  walletBalance: string;
  effectiveEntryPrice: string;
  stopPrice: string;
  /** Crossed Soft Stop increases use distance only; ordinary entries require protection. */
  stopDistanceMode?: "PROTECTIVE" | "ABSOLUTE";
  riskPercent: string;
  retainedRiskAmount?: string;
  entryAllocationPercent: string;
  dcaLevels: EntrySizingLevelIntent[];
  contractSize: string;
  quantityRules: MarketQuantityRules;
  dcaQuantityRules?: MarketQuantityRules;
  minimumNotional?: string | null;
};

export type EntrySizingResult =
  | {
      ok: true;
      riskAmount: string;
      totalQuantity: string;
      entry: { quantity: string; cost: string };
      dcaLevels: Array<{
        price: string;
        allocationPercent: string;
        quantity: string;
        cost: string;
      }>;
    }
  | { ok: false; code: EntrySizingErrorCode };

function parsePositiveDecimal(value: string): Decimal | null {
  try {
    if (!isBoundedDecimalString(value, derivedDecimalLimits)) return null;
    const decimal = new Decimal(value);
    return decimal.isFinite() && decimal.greaterThan(0) ? decimal : null;
  } catch {
    return null;
  }
}

const plainDecimalPattern = /^\d+(?:\.\d+)?$/;

function parsePositivePlainDecimal(value: string): Decimal | null {
  return plainDecimalPattern.test(value) ? parsePositiveDecimal(value) : null;
}

type ParsedLevelIntent = {
  intent: EntrySizingLevelIntent;
  price: Decimal;
  allocationPercent: Decimal;
};

function parseLevelIntent(intent: EntrySizingLevelIntent): ParsedLevelIntent | null {
  const price = parsePositiveDecimal(intent.price);
  const allocationPercent = parsePositivePlainDecimal(intent.allocationPercent);
  return price && allocationPercent ? { intent, price, allocationPercent } : null;
}

function isBelowMinimum(quantity: Decimal, minimumQuantity: Decimal): boolean {
  return quantity.lessThan(minimumQuantity);
}

type ParsedSizingInput = {
  walletBalance: Decimal;
  effectiveEntryPrice: Decimal;
  stopPrice: Decimal;
  riskPercent: Decimal;
  entryAllocationPercent: Decimal;
  dcaLevels: ParsedLevelIntent[];
  contractSize: Decimal;
  minimumQuantity: Decimal;
};

type SizingInputValidation =
  | { ok: true; value: ParsedSizingInput }
  | { ok: false; code: EntrySizingErrorCode };

function sizingStopIsValid(input: EntrySizingInput, stop: Decimal, price: Decimal): boolean {
  if (input.stopDistanceMode === "ABSOLUTE") return !stop.equals(price);
  return input.side === "LONG" ? stop.lessThan(price) : stop.greaterThan(price);
}

function sizingRepresentationIssue(
  input: EntrySizingInput,
  envelope: "CURRENT_INPUT" | "ADMITTED_RECORD",
): EntrySizingErrorCode | null {
  if (
    input.dcaLevels.length >
    (envelope === "CURRENT_INPUT" ? maximumEntryDcaLevels : maximumProjectedPositionLevelRecords)
  )
    return "INVALID_ALLOCATION_TOTAL";
  const intentLimits = envelope === "CURRENT_INPUT" ? inputDecimalLimits : derivedDecimalLimits;
  if (!isBoundedDecimalString(input.riskPercent, intentLimits)) return "INVALID_RISK_PERCENT";
  if (!isBoundedDecimalString(input.stopPrice, intentLimits)) return "INVALID_STOP_PRICE";
  if (
    !isBoundedDecimalString(input.entryAllocationPercent, intentLimits) ||
    input.dcaLevels.some(
      (level) =>
        !isBoundedDecimalString(level.price, intentLimits) ||
        !isBoundedDecimalString(level.allocationPercent, intentLimits),
    )
  )
    return "INVALID_ALLOCATION_TOTAL";
  if (
    input.minimumNotional != null &&
    !isBoundedDecimalString(input.minimumNotional, derivedDecimalLimits)
  )
    return "NOTIONAL_BELOW_MINIMUM";
  if (
    !marketQuantityRulesSchema.safeParse(input.quantityRules).success ||
    (input.dcaQuantityRules && !marketQuantityRulesSchema.safeParse(input.dcaQuantityRules).success)
  )
    return "QUANTITY_BELOW_MINIMUM";
  return null;
}

function validMinimumQuantity(rules: EntrySizingInput["quantityRules"]): Decimal | null {
  const minimumQuantity = parsePositiveDecimal(rules.minimumQuantity);
  const quantityStep = parsePositiveDecimal(rules.stepSize);
  if (!minimumQuantity || !quantityStep || !minimumQuantity.dividedBy(quantityStep).isInteger())
    return null;
  return minimumQuantity;
}

function parseSizingInput(
  input: EntrySizingInput,
  envelope: "CURRENT_INPUT" | "ADMITTED_RECORD",
): SizingInputValidation {
  const representationIssue = sizingRepresentationIssue(input, envelope);
  if (representationIssue) return { ok: false, code: representationIssue };
  if (input.retainedRiskAmount !== undefined && !parsePositiveDecimal(input.retainedRiskAmount))
    return { ok: false, code: "INVALID_RISK_PERCENT" };
  const walletBalance = parsePositiveDecimal(input.walletBalance);
  if (!walletBalance) return { ok: false, code: "INVALID_WALLET_BALANCE" };
  const contractSize = parsePositiveDecimal(input.contractSize);
  if (!contractSize) return { ok: false, code: "INVALID_CONTRACT_SIZE" };
  const effectiveEntryPrice = parsePositiveDecimal(input.effectiveEntryPrice);
  if (!effectiveEntryPrice) return { ok: false, code: "INVALID_ENTRY_PRICE" };
  const stopPrice = parsePositiveDecimal(input.stopPrice);
  if (!stopPrice) return { ok: false, code: "INVALID_STOP_PRICE" };
  if (!sizingStopIsValid(input, stopPrice, effectiveEntryPrice))
    return { ok: false, code: "STOP_NOT_PROTECTIVE" };
  const riskPercent = parsePositiveDecimal(input.riskPercent);
  if (!riskPercent || riskPercent.greaterThan(100))
    return { ok: false, code: "INVALID_RISK_PERCENT" };
  const entryAllocationPercent = parsePositivePlainDecimal(input.entryAllocationPercent);
  const parsedDcaLevels = input.dcaLevels.map(parseLevelIntent);
  if (!entryAllocationPercent || parsedDcaLevels.some((level) => level === null))
    return { ok: false, code: "INVALID_ALLOCATION_TOTAL" };
  const dcaLevels = parsedDcaLevels.filter((level): level is ParsedLevelIntent => level !== null);
  if (dcaLevels.some(({ price }) => !sizingStopIsValid(input, stopPrice, price)))
    return { ok: false, code: "STOP_NOT_PROTECTIVE" };
  const allocationTotal = sumDecimalStringsExactly([
    input.entryAllocationPercent,
    ...input.dcaLevels.map((level) => level.allocationPercent),
  ]);
  if (!allocationTotal.equals(100)) return { ok: false, code: "INVALID_ALLOCATION_TOTAL" };
  const minimumQuantity = validMinimumQuantity(input.quantityRules);
  if (!minimumQuantity) return { ok: false, code: "QUANTITY_BELOW_MINIMUM" };
  return {
    ok: true,
    value: {
      walletBalance,
      effectiveEntryPrice,
      stopPrice,
      riskPercent,
      entryAllocationPercent,
      dcaLevels,
      contractSize,
      minimumQuantity,
    },
  };
}

type ResolvedSizing = {
  riskAmount: Decimal;
  entryQuantity: Decimal;
  resolvedDcaLevels: Array<{
    price: string;
    allocationPercent: string;
    quantity: Decimal;
  }>;
};

function resolveSizing(input: EntrySizingInput, parsed: ParsedSizingInput): ResolvedSizing {
  const riskAmount = input.retainedRiskAmount
    ? new Decimal(input.retainedRiskAmount)
    : parsed.walletBalance.times(parsed.riskPercent).dividedBy(100);
  const resolveQuantity = (
    price: Decimal,
    allocationPercent: Decimal,
    rules = input.quantityRules,
  ) =>
    quantizeQuantityDown(
      riskAmount
        .times(allocationPercent)
        .dividedBy(100)
        .dividedBy(price.minus(parsed.stopPrice).abs().times(parsed.contractSize)),
      rules,
    );
  return {
    riskAmount,
    entryQuantity: resolveQuantity(parsed.effectiveEntryPrice, parsed.entryAllocationPercent),
    resolvedDcaLevels: parsed.dcaLevels.map(({ intent, price, allocationPercent }) => ({
      price: intent.price,
      allocationPercent: intent.allocationPercent,
      quantity: resolveQuantity(
        price,
        allocationPercent,
        input.dcaQuantityRules ?? input.quantityRules,
      ),
    })),
  };
}

function sizingBelowMinimum(
  minimumQuantity: Decimal,
  entryQuantity: Decimal,
  dcaLevels: ResolvedSizing["resolvedDcaLevels"],
  dcaMinimumQuantity: Decimal,
): boolean {
  return (
    isBelowMinimum(entryQuantity, minimumQuantity) ||
    dcaLevels.some(({ quantity }) => isBelowMinimum(quantity, dcaMinimumQuantity))
  );
}

export function calculateEntrySizing(
  input: EntrySizingInput,
  envelope: "CURRENT_INPUT" | "ADMITTED_RECORD" = "CURRENT_INPUT",
): EntrySizingResult {
  try {
    const parsedInput = parseSizingInput(input, envelope);
    if (!parsedInput.ok) return parsedInput;
    const parsed = parsedInput.value;
    const resolved = resolveSizing(input, parsed);
    const dcaRules = input.dcaQuantityRules ?? input.quantityRules;
    if (
      sizingBelowMinimum(
        parsed.minimumQuantity,
        resolved.entryQuantity,
        resolved.resolvedDcaLevels,
        new Decimal(dcaRules.minimumQuantity),
      )
    )
      return { ok: false, code: "QUANTITY_BELOW_MINIMUM" };
    const levels = [
      {
        quantity: resolved.entryQuantity,
        price: input.effectiveEntryPrice,
        rules: input.quantityRules,
      },
      ...resolved.resolvedDcaLevels.map((level) => ({ ...level, rules: dcaRules })),
    ];
    if (
      levels.some(
        ({ quantity, rules }) =>
          rules.maximumQuantity !== null && quantity.greaterThan(rules.maximumQuantity),
      )
    )
      return { ok: false, code: "QUANTITY_ABOVE_MAXIMUM" };
    if (
      input.minimumNotional != null &&
      levels.some(({ quantity, price }) =>
        multiplyDecimalStringsExactly([quantity.toFixed(), price, input.contractSize]).lessThan(
          input.minimumNotional ?? "0",
        ),
      )
    )
      return { ok: false, code: "NOTIONAL_BELOW_MINIMUM" };
    const totalRules =
      new Decimal(dcaRules.stepSize).decimalPlaces() >
      new Decimal(input.quantityRules.stepSize).decimalPlaces()
        ? dcaRules
        : input.quantityRules;
    const totalQuantity = sumDecimalStringsExactly([
      formatQuantity(resolved.entryQuantity, input.quantityRules),
      ...resolved.resolvedDcaLevels.map(({ quantity }) => formatQuantity(quantity, dcaRules)),
    ]);
    return {
      ok: true,
      riskAmount: resolved.riskAmount.toString(),
      totalQuantity: formatQuantity(totalQuantity, totalRules),
      entry: {
        quantity: formatQuantity(resolved.entryQuantity, input.quantityRules),
        cost: multiplyDecimalStringsExactly([
          formatQuantity(resolved.entryQuantity, input.quantityRules),
          input.effectiveEntryPrice,
          input.contractSize,
        ]).toFixed(),
      },
      dcaLevels: resolved.resolvedDcaLevels.map(({ price, allocationPercent, quantity }) => ({
        price,
        allocationPercent,
        quantity: formatQuantity(quantity, dcaRules),
        cost: multiplyDecimalStringsExactly([
          formatQuantity(quantity, dcaRules),
          price,
          input.contractSize,
        ]).toFixed(),
      })),
    };
  } catch (cause) {
    if (cause instanceof FinancialInputError) return { ok: false, code: "CALCULATION_LIMIT" };
    throw cause;
  }
}
