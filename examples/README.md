# Code example: from a risk budget to an order plan

[Project overview](../README.md)

In AlphaGoat Terminal, a trader chooses how much of the account to risk and where the stop belongs. The application calculates the order quantities. With several entry levels and different exchange rules, that calculation needs more than `risk / price distance`.

This directory contains the product's **entry-sizing calculation and its tests**, extracted into a small TypeScript package that runs on its own. It demonstrates a complete piece of shared domain logic used by the backend and client previews.

## A concrete scenario

A LONG setup has a **1,000 USDT wallet**, a **2% risk budget**, an initial entry at **100**, an additional entry at **95**, and a common stop at **90**. Half the risk budget belongs to each entry.

| Planned order | Allocated risk | Distance to stop | Quantity, with contract size 1 | Quote notional |
| --- | --- | --- | --- | --- |
| Initial entry at 100 | 10 USDT | 10 | 1.000 | 100 USDT |
| Additional entry at 95 | 10 USDT | 5 | 2.000 | 190 USDT |
| Total | **20 USDT** | | **3.000** | **290 USDT** |

Equal risk allocations produce different quantities because the second entry is closer to the stop. The 20 USDT is modeled price-distance risk; the 290 USDT is order notional. The calculator does not model fees, slippage, or a guarantee of execution at the stop.

**[Open the worked example, source map, and run instructions →](risk-based-entry/README.md)**

## What the code demonstrates

- **A shared domain boundary:** one pure calculation can support a responsive client preview and server-side validation.
- **Explicit units:** wallet risk, contract quantity, contract size, and quote notional have different meanings.
- **Exchange-aware sizing:** round each order down to its allowed quantity step, then check its minimum, maximum, and minimum notional.
- **Typed outcomes:** return a usable plan or a specific rejection code that the caller can map to the interface.
- **Behavioral tests:** verify non-unit contracts, different market/limit increments, invalid stops, and decimal edge cases.

## Related architecture walkthroughs

| Product problem | Walkthrough |
| --- | --- |
| An order times out after the exchange may have accepted it | [Preserve the operation identity and recover its outcome](../docs/command-recovery.md). |
| A late price update belongs to an older set of positions | [Keep structural state and valuation on the same revision](../docs/realtime-clients.md#walkthrough-a-late-valuation-after-a-position-change). |
| Fill rows exist, but an interval may still be incomplete | [Track historical coverage alongside financial records](../docs/data-correctness.md#rows-do-not-prove-complete-history). |
