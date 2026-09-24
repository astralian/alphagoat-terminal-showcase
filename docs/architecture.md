# Architecture: explicit ownership before infrastructure

[Overview](../README.md) · [Command recovery](command-recovery.md)

The application coordinates several asynchronous systems: a browser or phone, a backend, PostgreSQL, and exchange REST and WebSocket interfaces. Even with one backend process, these systems can disagree temporarily. The design therefore starts with a precise answer to who may adopt each kind of fact.

## Account state and public market state have different owners

One `AccountSession` per internal account owns private state adoption, command admission, reconciliation, and permission to publish a ready terminal view. Its internal collaborators acquire data, prepare commits, execute commands, and build projections, but cannot independently declare the account ready.

Public prices and candles belong to a process-owned `MarketHub`. Public scopes are shared by exchange, environment, and market type. Adding another account does not require another copy of every public stream.

This split also defines failure scope. A public price outage invalidates the affected financial frames; it is not automatically evidence that an account's private connection failed. Conversely, an account recovery problem need not take down independent accounts.

## Acquisition and adoption are different operations

Network work can overlap. Adopting its result requires serialization and validation against the current owner, generation, scope, and command state. A response that started before a reconnect or a newer command cannot silently overwrite the newer facts.

Source work has concrete scopes: a full account read, a targeted entry read, and an account-wide open-state read. Income and balance have their own lanes. This allows urgent work to avoid some unrelated background work while retaining one account authority.

The cost is explicit scheduling, fencing, and recovery logic. Serializing every network request would be simpler to describe, but would also make slow background acquisition block unrelated interaction. Allowing every completed request to update state independently would lose ordering guarantees.

## Share behavior at stable boundaries

| Package or app | Responsibility |
| --- | --- |
| `packages/shared` | Strict transport schemas and pure financial logic. |
| `packages/client` | Portable transport, receipts, recovery, stores, and feature calculations; no React or app dependency. |
| `packages/design-tokens` | Semantic visual constants and generated platform output. |
| `apps/web` | Web rendering, browser lifecycle, routing, and interaction. |
| `apps/mobile` | Native rendering, device lifecycle, routing, and interaction. |
| `apps/server` | Exchange integration, authoritative runtime, persistence, and APIs. |
| `apps/admin` | Administrative access and observational runtime views. |
| `apps/landing` | Static product presentation using fixture-driven presentation exports. |

Features own their concrete functions and state. The system avoids adding controller/service/repository layers solely to forward calls. Shared code is extracted around actual cross-platform use, rather than around a speculative universal abstraction.

## Why one active process?

The current deployment contract accepts a single serving runtime and planned maintenance. This keeps private exchange ownership and shutdown behavior tractable without introducing leader election, brokers, or competing workers.

PostgreSQL advisory ownership and generation-fenced transactions provide additional protection against a second mutation owner. They complement physical process shutdown; a released database lock alone is insufficient proof that an old process cannot still call an exchange.

The trade-off is material: a full release pauses server-owned strategy follow-up during stop/start, and capacity remains bounded by one runtime. Exchange-native orders remain owned by the exchange. Horizontal failover is outside this single-runtime deployment model.

An expansion would need measured capacity pressure and a deliberate partitioning model, including recovery and external side effects. Splitting services merely to increase their number would not resolve those obligations.
