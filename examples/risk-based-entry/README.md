# Risk-based entry sizing

[Code examples](../README.md) · [Data architecture](../../docs/data-correctness.md)

This is the shared calculation behind an entry preview: turn a wallet risk budget, a stop, and a set of entry allocations into an exchange-compatible quantity for each planned order. DCA means an additional entry at another price; here, its allocation is a share of the **risk budget**, not a share of the final quantity.

## Where this fits in the application

```text
Editable entry form + server-provided market facts
                  ↓
          calculateEntrySizing
                  ↓
      Preview quantities and notionals
                  ↓
            Explicit submission
                  ↓
Server validates the plan against current facts
                  ↓
     Admission and exchange execution
```

The calculation belongs to `packages/shared` in the application. It has no React, Fastify, database, or exchange dependency. Client previews and backend feature code use the same financial rules; the server still owns admission, current account state, and order execution.

## Run it

Use Node.js 26.5.1 and pnpm 11.26.0, matching the source workspace. From the repository root:

```sh
cd examples/risk-based-entry
corepack pnpm install --frozen-lockfile
corepack pnpm demo
corepack pnpm check
```

The demo calculates three deterministic scenarios: a valid plan, a stop on the wrong side, and an order below minimum notional. `check` runs strict TypeScript checking and the extracted Vitest suite. All calculations run locally without credentials or network calls.

## Inputs and expected result

[The complete demo](src/demo.ts) supplies this setup:

```ts
const input: EntrySizingInput = {
  side: "LONG",
  walletBalance: "1000",
  effectiveEntryPrice: "100",
  stopPrice: "90",
  riskPercent: "2",
  entryAllocationPercent: "50",
  dcaLevels: [{ price: "95", allocationPercent: "50" }],
  contractSize: "1",
  quantityRules: {
    stepSize: "0.001",
    minimumQuantity: "0.001",
    maximumQuantity: null,
  },
};
```

The budget is `1000 × 2 / 100 = 20 USDT`. Each entry receives 10 USDT of modeled price-distance risk. Quantity is calculated separately for each level:

```text
quantity = allocated risk / (absolute distance to stop × contract size)

Initial entry:    10 / ((100 − 90) × 1) = 1
Additional entry: 10 / ((95 − 90) × 1)  = 2
```

The result is:

```json
{
  "ok": true,
  "riskAmount": "20",
  "totalQuantity": "3.000",
  "entry": { "quantity": "1.000", "cost": "100" },
  "dcaLevels": [
    { "price": "95", "allocationPercent": "50", "quantity": "2.000", "cost": "190" }
  ]
}
```

`cost` is quote notional: `quantity × price × contract size`. It is not the risk budget or the required margin. `riskAmount` is the requested budget; rounding down may leave some of it unused. Fees, slippage, funding, and actual stop execution are outside this price-distance calculation.

Changing `stopPrice` to `"105"` returns `{ "ok": false, "code": "STOP_NOT_PROTECTIVE" }`. Setting `minimumNotional` to `"101"` returns `NOTIONAL_BELOW_MINIMUM`, because the initial order is only 100 USDT even though the combined plan is worth 290 USDT.

## Read the implementation

| File | Responsibility |
| --- | --- |
| [entry-sizing.ts](src/entry-sizing.ts) | Input/result types, input validation, risk allocation, per-order sizing, and final constraints. Start at `calculateEntrySizing`. |
| [quantity.ts](src/quantity.ts) | Round down to the full quantity step and format the resulting contract quantity. |
| [decimal.ts](src/decimal.ts) | Decimal parsing and precision-aware sums/products without changing global precision. |
| [quantity-rules.ts](src/quantity-rules.ts) | The small market-rule type supplied by the surrounding application. |
| [entry-sizing.test.ts](test/entry-sizing.test.ts) | The product's sizing tests, including acceptance and rejection scenarios. |
| [demo.ts](src/demo.ts) | Synthetic inputs and printed outputs for this standalone example. |

The main function follows four steps:

1. **Validate the intent.** Require positive sizing facts, a stop that protects every ordinary entry, and allocations that sum to exactly 100%.
2. **Allocate risk before sizing.** Each level gets its own risk amount, distance to stop, and contract-size conversion.
3. **Quantize each order.** Round down to the exchange step before adding quantities. The immediate entry and later limit entries can have different rules.
4. **Check each resulting order.** Reject a zero/below-minimum quantity, a quantity over the venue maximum, or a child order below minimum notional. Return decimal strings for the accepted plan.

## Decisions that matter

**Allocate risk, not equal quantities.** In the example, a 50/50 risk split gives quantities of 1 and 2. Splitting the total quantity equally would change the intended risk distribution.

**A step is more than a decimal-place count.** A step of `0.005` allows `0.005`, `0.010`, and `0.015`; formatting `0.012` to three decimal places does not make it valid. `quantizeQuantityDown` divides by the step, floors the step count, and multiplies it back.

**Round each order independently.** Exchanges validate individual orders. Rounding an aggregate and dividing it afterwards can leave invalid child quantities. Quantizing down also avoids increasing the modeled risk budget simply to fit a step.

**Retain contract size.** If one contract represents ten base units, the same plan needs one tenth as many contracts. Its quote notional stays the same. Assuming a unit contract everywhere silently changes exposure on other venues.

**Decimal arithmetic still needs a precision policy.** Allocations differing from 100% beyond the usual precision must remain invalid. The exact sum helper sizes a local decimal context from integer and fractional digits. The finite-product helper uses the combined significant digits of its factors. Division has the configured decimal precision and is followed by the venue's downward quantity policy.

**Keep failures explicit.** The result is a discriminated union. The caller gets either a complete plan or a bounded reason such as `STOP_NOT_PROTECTIVE`, `INVALID_ALLOCATION_TOTAL`, or `NOTIONAL_BELOW_MINIMUM`. The calculation does not silently adjust the user's intent to make a rejected plan fit.

## What the tests exercise

| Scenario | Expected behavior |
| --- | --- |
| The worked 1,000 USDT setup | Quantities 1.000 and 2.000, with a 20 USDT budget. |
| Contract size changes from 1 to 10 | Quantities change to 0.100 and 0.200; notionals remain 100 and 190. |
| Market and DCA rules have different steps | Each order follows its own constraints; total formatting retains the finer scale. |
| Stop protects the first entry but not a later entry | Reject the plan. |
| A tiny positive allocation rounds to zero | Reject the order rather than silently drop that entry. |
| Allocations are just below or above 100% at high precision | Reject the plan without rounding away the difference. |
| Quantity step is 0.005 | Return a multiple of the entire step. |
| Tiny prices or more than 20 significant digits in notional | Retain the tested exact product. |

## Integration boundaries

The calculation belongs to the shared domain layer. Decimal helpers handle arithmetic, quantity helpers apply venue increments, and the sizing function combines those rules into an order plan. The standalone package includes the calculation, its tests, and a synthetic demo.

In the product, `MarketQuantityRules` is inferred from a strict Zod schema that validates and normalizes venue metadata before it reaches domain code. This package spells out the equivalent TypeScript shape to keep the example focused. The demo uses already-valid market rules; the function is not an HTTP validation boundary for arbitrary untrusted metadata.

The source also has an explicit `ABSOLUTE` stop-distance mode used by the separate crossed-soft-stop position-increase workflow. The demo uses ordinary entry behavior, which requires a protective stop. Account admission, margin checks, live exchange rules, and execution remain in the backend; this package calculates a plan.
