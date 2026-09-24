# Data correctness: ownership, precision, and completeness

[Overview](../README.md) · [Risk-based entry example](../examples/README.md)

Financial correctness depends on both values and provenance. A perfectly precise number is still wrong if it belongs to the wrong lifecycle or comes from an incomplete history interval.

## Define what each data source can prove

| Data | Authority | Consequence |
| --- | --- | --- |
| Current balances, positions, orders, executable settings | Exchange facts adopted by the account runtime | A failed read cannot manufacture zero exposure. |
| User intent, position plans, operation identities | PostgreSQL | Restart can recover what was requested without issuing it again. |
| Normalized fills, income, and coverage evidence | PostgreSQL after validated acquisition | History needs both deduplication and completeness evidence. |
| Current terminal view | Server-built publication | UI caches cannot authorize trading. |
| Terminal checkpoint | Disposable last-known projection | Useful for revision floors and observation; insufficient for current READY. |
| Form values, selected tabs, pending interaction | Client | Preserve drafts without treating them as exchange state. |

## Decimal strings are a boundary contract

Financial values cross transport boundaries as decimal strings. Calculations use explicit decimal arithmetic; display formatting remains distinct from executable quantity and price rules.

Using a decimal library still requires attention to precision. In the [runnable entry-sizing example](../examples/risk-based-entry/README.md#decisions-that-matter), risk allocations must sum to exactly 100%, and each order's quantity, price, and contract size determine its quote notional. The included decimal helpers derive sufficient local precision for these sums and finite products. Division and venue-specific quantity rounding require their own policies.

Exchange rules matter as much as arithmetic. Market and limit orders may use different constraints, contract sizes, minimum notionals, and tick sizes. A client estimate cannot replace final server validation against current rules.

## Rows do not prove complete history

A database containing some fills does not establish that every fill in an interval was acquired. Coverage records express what has been read completely. Partial acquisition cannot advance the coverage boundary.

Structural fills, lifecycle changes, and certified coverage commit atomically. Otherwise, a crash could leave a coverage marker that causes recovery to skip missing records. Income has an independent transaction and freshness lane, so historical income work need not roll back structural account readiness.

Deduplication uses provider identities. Ambiguous attribution is not repaired by guessing from nearby timestamps or a matching symbol. Reopening the same symbol creates another lifecycle; delayed closing fills must remain attached to the old one.

## Model missing and incomplete information explicitly

Unavailable financial data is not zero. History may retain confirmed metadata while net P&L is still being completed. That lets the interface show useful known facts without presenting incomplete accounting as a final result.

Settlement currencies remain distinct in history statistics and curves. Combining amounts with different units would require a separately defined conversion policy.

## Migrations preserve history rather than rewriting it

The migration runner checks that applied migrations form the exact ordered checksum prefix of the checked-in journal. One transaction and advisory lock own validation and application. Checksum drift and partial acknowledgement fail closed.

Rollback is therefore a compatibility question involving schema, persisted envelopes, and reader behavior. Selecting an older image does not by itself prove that the older application can interpret newer data.

## The principal trade-off

Completeness markers, exact identities, and explicit unknown states require more modeling than storing the latest JSON snapshot. In return, restart and reconciliation can reason about what is known, what is missing, and which facts are safe to publish.
