import { describe, expect, test } from "vitest";
import { calculateEntrySizing, type EntrySizingInput } from "../src/entry-sizing.js";

const validInput: EntrySizingInput = {
  side: "LONG",
  walletBalance: "1000",
  effectiveEntryPrice: "100",
  stopPrice: "90",
  riskPercent: "2",
  entryAllocationPercent: "50",
  dcaLevels: [{ price: "95", allocationPercent: "50" }],
  contractSize: "1",
  quantityRules: { stepSize: "0.001", minimumQuantity: "0.001", maximumQuantity: null },
};

describe("calculateEntrySizing", () => {
  test("keeps MARKET and DCA increments independent and validates every child notional", () => {
    const input = {
      ...validInput,
      riskPercent: "2.13",
      quantityRules: { stepSize: "1", minimumQuantity: "1", maximumQuantity: "2" },
      dcaQuantityRules: validInput.quantityRules,
    };
    expect(calculateEntrySizing(input)).toMatchObject({
      ok: true,
      entry: { quantity: "1" },
      dcaLevels: [{ quantity: "2.130" }],
      totalQuantity: "3.130",
    });
    expect(calculateEntrySizing({ ...input, minimumNotional: "101" })).toEqual({
      ok: false,
      code: "NOTIONAL_BELOW_MINIMUM",
    });
    expect(
      calculateEntrySizing({
        ...input,
        dcaQuantityRules: { ...validInput.quantityRules, maximumQuantity: "2" },
      }),
    ).toEqual({ ok: false, code: "QUANTITY_ABOVE_MAXIMUM" });
  });
  test.each([
    { price: "1.10", stop: "0.10", wallet: "500", step: "1", contract: "1", cost: "5.5" },
    {
      price: "0.000000011",
      stop: "0.000000001",
      wallet: "0.000005",
      step: "1",
      contract: "1",
      cost: "0.000000055",
    },
    { price: "1.10", stop: "0.10", wallet: "500", step: "0.1", contract: "10", cost: "5.5" },
    {
      price: "123456789012345678901.1",
      stop: "123456789012345678900.1",
      wallet: "500",
      step: "1",
      contract: "1",
      cost: "617283945061728394505.5",
    },
  ])(
    "keeps quote notional exact for $price and quantity step $step",
    ({ price, stop, wallet, step, contract, cost }) => {
      const result = calculateEntrySizing({
        ...validInput,
        walletBalance: wallet,
        effectiveEntryPrice: price,
        stopPrice: stop,
        contractSize: contract,
        entryAllocationPercent: "100",
        dcaLevels: [],
        riskPercent: "1",
        quantityRules: { stepSize: step, minimumQuantity: step, maximumQuantity: null },
      });
      expect(result).toMatchObject({ ok: true, entry: { cost } });
    },
  );
  test("sizes entry and DCA allocations from wallet risk with Decimal precision", () => {
    expect(calculateEntrySizing(validInput)).toEqual({
      ok: true,
      riskAmount: "20",
      totalQuantity: "3.000",
      entry: { quantity: "1.000", cost: "100" },
      dcaLevels: [{ price: "95", allocationPercent: "50", quantity: "2.000", cost: "190" }],
    });
  });

  test("sizes contract quantities while preserving quote notional for a non-unit contract", () => {
    expect(calculateEntrySizing({ ...validInput, contractSize: "10" })).toEqual({
      ok: true,
      riskAmount: "20",
      totalQuantity: "0.300",
      entry: { quantity: "0.100", cost: "100" },
      dcaLevels: [{ price: "95", allocationPercent: "50", quantity: "0.200", cost: "190" }],
    });
  });

  test("fails closed when contract size is missing or invalid", () => {
    expect(calculateEntrySizing({ ...validInput, contractSize: "0" })).toEqual({
      ok: false,
      code: "INVALID_CONTRACT_SIZE",
    });
    expect(
      calculateEntrySizing({
        ...validInput,
        // SAFETY: This fixture intentionally omits a required sizing fact.
        contractSize: undefined as never,
      }),
    ).toEqual({ ok: false, code: "INVALID_CONTRACT_SIZE" });
  });

  test("uses wallet balance rather than an equity-shaped fallback", () => {
    expect(
      calculateEntrySizing(
        Object.assign(
          // SAFETY: The fixture intentionally violates the wallet-balance contract to test rejection.
          {} as EntrySizingInput,
          {
            ...validInput,
            walletBalance: undefined,
            equity: "100000",
          },
        ),
      ),
    ).toEqual({ ok: false, code: "INVALID_WALLET_BALANCE" });
  });

  test("accepts protective stops in both LONG and SHORT directions", () => {
    expect(calculateEntrySizing(validInput).ok).toBe(true);
    expect(
      calculateEntrySizing({
        ...validInput,
        side: "SHORT",
        stopPrice: "110",
        dcaLevels: [{ price: "105", allocationPercent: "50" }],
      }).ok,
    ).toBe(true);

    expect(calculateEntrySizing({ ...validInput, stopPrice: "100" })).toEqual({
      ok: false,
      code: "STOP_NOT_PROTECTIVE",
    });
    expect(calculateEntrySizing({ ...validInput, side: "SHORT", stopPrice: "90" })).toEqual({
      ok: false,
      code: "STOP_NOT_PROTECTIVE",
    });
  });

  test("uses the supplied effective entry price for market-compatible and limit-compatible sizing", () => {
    expect(calculateEntrySizing(validInput)).toMatchObject({
      ok: true,
      totalQuantity: "3.000",
    });
    expect(
      calculateEntrySizing({
        ...validInput,
        effectiveEntryPrice: "95",
        stopPrice: "85",
        dcaLevels: [{ price: "90", allocationPercent: "50" }],
      }),
    ).toMatchObject({ ok: true, totalQuantity: "3.000" });
  });

  test("requires positive inputs and an exact 100 percent allocation", () => {
    expect(calculateEntrySizing({ ...validInput, effectiveEntryPrice: "0" })).toEqual({
      ok: false,
      code: "INVALID_ENTRY_PRICE",
    });
    expect(calculateEntrySizing({ ...validInput, stopPrice: "not-a-price" })).toEqual({
      ok: false,
      code: "INVALID_STOP_PRICE",
    });
    expect(calculateEntrySizing({ ...validInput, riskPercent: "0" })).toEqual({
      ok: false,
      code: "INVALID_RISK_PERCENT",
    });
    expect(
      calculateEntrySizing({
        ...validInput,
        entryAllocationPercent: "49.999999999999999999",
      }),
    ).toEqual({ ok: false, code: "INVALID_ALLOCATION_TOTAL" });
  });

  test("rejects an adjacent-invalid allocation beyond Decimal default precision", () => {
    expect(
      calculateEntrySizing({
        ...validInput,
        entryAllocationPercent: "99.9999999999999999999999999999999999",
        dcaLevels: [{ price: "95", allocationPercent: "0.0000000000000000000000000000000002" }],
      }),
    ).toEqual({ ok: false, code: "INVALID_ALLOCATION_TOTAL" });
  });

  test("rejects exponent-form entry or DCA allocation without throwing", () => {
    const inputs: EntrySizingInput[] = [
      {
        ...validInput,
        entryAllocationPercent: "1e-1000000001",
        dcaLevels: [{ price: "95", allocationPercent: "100" }],
      },
      {
        ...validInput,
        entryAllocationPercent: "100",
        dcaLevels: [{ price: "95", allocationPercent: "1e-1000000001" }],
      },
    ];

    for (const input of inputs) {
      let result: ReturnType<typeof calculateEntrySizing> | undefined;
      expect(() => {
        result = calculateEntrySizing(input);
      }).not.toThrow();
      expect(result).toEqual({ ok: false, code: "INVALID_ALLOCATION_TOTAL" });
    }
  });

  test("rounds resolved quantities down to exchange quantity precision", () => {
    expect(
      calculateEntrySizing({
        ...validInput,
        walletBalance: "123.49",
        riskPercent: "10",
        entryAllocationPercent: "100",
        dcaLevels: [],
      }),
    ).toEqual({
      ok: true,
      riskAmount: "12.349",
      totalQuantity: "1.234",
      entry: { quantity: "1.234", cost: "123.4" },
      dcaLevels: [],
    });
  });

  test("rounds each per-level risk quantity independently before summing", () => {
    expect(
      calculateEntrySizing({
        side: "LONG",
        contractSize: "1",
        walletBalance: "111.51",
        effectiveEntryPrice: "10",
        stopPrice: "1",
        riskPercent: "10",
        entryAllocationPercent: "90",
        dcaLevels: [{ price: "5", allocationPercent: "10" }],
        quantityRules: { stepSize: "0.01", minimumQuantity: "0.01", maximumQuantity: null },
      }),
    ).toEqual({
      ok: true,
      riskAmount: "11.151",
      totalQuantity: "1.38",
      entry: { quantity: "1.11", cost: "11.1" },
      dcaLevels: [{ price: "5", allocationPercent: "10", quantity: "0.27", cost: "1.35" }],
    });
  });

  test("requires the stop to protect every planned DCA price", () => {
    expect(
      calculateEntrySizing({
        ...validInput,
        dcaLevels: [{ price: "85", allocationPercent: "50" }],
      }),
    ).toEqual({ ok: false, code: "STOP_NOT_PROTECTIVE" });
    expect(
      calculateEntrySizing({
        ...validInput,
        side: "SHORT",
        stopPrice: "110",
        dcaLevels: [{ price: "115", allocationPercent: "50" }],
      }),
    ).toEqual({ ok: false, code: "STOP_NOT_PROTECTIVE" });
  });

  test("rejects a resolved non-zero entry or DCA quantity below the exchange minimum", () => {
    expect(
      calculateEntrySizing({
        ...validInput,
        walletBalance: "1",
        riskPercent: "1",
        entryAllocationPercent: "100",
        dcaLevels: [],
        quantityRules: { stepSize: "0.0001", minimumQuantity: "0.002", maximumQuantity: null },
      }),
    ).toEqual({ ok: false, code: "QUANTITY_BELOW_MINIMUM" });

    expect(
      calculateEntrySizing({
        ...validInput,
        entryAllocationPercent: "99.96",
        dcaLevels: [{ price: "95", allocationPercent: "0.04" }],
        quantityRules: { stepSize: "0.0001", minimumQuantity: "0.002", maximumQuantity: null },
      }),
    ).toEqual({ ok: false, code: "QUANTITY_BELOW_MINIMUM" });
  });

  test("rejects positive entry and DCA intent when a resolved quantity rounds to zero", () => {
    expect(
      calculateEntrySizing({
        side: "LONG",
        contractSize: "1",
        walletBalance: "0.9",
        effectiveEntryPrice: "100",
        stopPrice: "90",
        riskPercent: "1",
        entryAllocationPercent: "50",
        dcaLevels: [{ price: "95", allocationPercent: "50" }],
        quantityRules: { stepSize: "0.001", minimumQuantity: "0.001", maximumQuantity: null },
      }),
    ).toEqual({ ok: false, code: "QUANTITY_BELOW_MINIMUM" });
  });

  test("rounds entry sizing to the full exchange quantity step", () => {
    expect(
      calculateEntrySizing({
        ...validInput,
        walletBalance: "2430",
        riskPercent: "10",
        entryAllocationPercent: "100",
        dcaLevels: [],
        quantityRules: { stepSize: "10", minimumQuantity: "10", maximumQuantity: null },
      }),
    ).toMatchObject({ ok: true, entry: { quantity: "20" }, totalQuantity: "20" });
  });
});
