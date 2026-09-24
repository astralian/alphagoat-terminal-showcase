# Design decisions and trade-offs

[Overview](../README.md)

This chapter collects the rationale behind choices that appear throughout the implementation.

## Why one backend runtime?

Private exchange clients, account state, protection, and settlement need a clear mutation owner. One active runtime keeps ownership concrete and allows direct feature calls. PostgreSQL ownership and generation checks provide additional safeguards.

The cost is a planned stop/start window for full releases and a single-runtime capacity boundary. Multiple owners would require an explicit account-partitioning and recovery protocol, supported by measured demand.

## Why feature-first modules?

A feature often needs its domain types, queries, calculations, and commands together. Keeping those pieces local makes changes traceable to product behavior. A helper earns its place by owning a calculation, protocol, or lifecycle step.

There are still boundaries and stateful owners. They have concrete responsibilities rather than relaying calls through a prescribed number of layers.

## Why keep the client thin while sharing financial calculations?

The server owns factual financial views and final command validation. The client needs immediate feedback during entry or stop editing, so pure draft calculations can be shared.

The boundary is semantic: a preview remains a preview. It cannot become current position state or the final executable quantity without server validation and completion.

## Why separate shared contracts from portable client behavior?

Transport schemas and pure domain functions serve backend and clients. Request orchestration, stores, receipt observation, and recovery journals are client concerns.

Separating them prevents backend code from inheriting UI lifecycle dependencies and keeps the portable client independent of a renderer. Storage, navigation, and gestures remain in each app.

## Why use HTTP and WebSocket together?

HTTP gives commands and queries explicit request/response boundaries. WebSocket delivers ongoing account and market publications. Exact receipts connect the channels when a response is lost or a socket reconnects.

A connected socket does not mean an account is ready. An HTTP response does not mean the corresponding state has been published. The protocol models both facts.

## Why avoid optimistic trading completion?

Local feedback can immediately show an action as pending. Completion requires its exchange and durable outcome. Optimistically removing a position or confirming protection could leave the user with a false picture of exposure after a later failure.

Draft interaction stays immediate; factual completion follows the authoritative publication.

## Why not retry a timed-out order?

The exchange may have executed it. The application preserves the exact identity and observes the original result. Read retries and separately proven workflow continuation are different from resubmitting an uncertain mutation.

This requires durable uncertainty and a usable recovery experience. It avoids hiding ambiguity behind a second side effect.

## Why store coverage as well as fills?

Rows prove that particular executions were observed. Coverage proves that a required interval was acquired completely. Without that distinction, restart can incorrectly assume there is nothing more to read.

Coverage and structural records commit together so recovery cannot skip missing records after a partial write.

## Why separate public streams from private accounts?

Prices and candles are shared facts; private balances and orders belong to an account. Public scopes reduce repeated acquisition while separate ownership preserves useful failure boundaries.

The market hub distributes by actual demand and coalesces updates. Account runtimes decide how those facts affect valuation and readiness.

## Why use a saga for multiple accounts?

Independent exchanges and accounts cannot share the application's database transaction. A group retains its exact targets and separate outcomes.

Reporting partial execution is more useful than representing a batch as atomically successful or issuing an invented reversal to conceal a mismatch.

## Why keep last-known views during reconnect?

The previous view provides context and preserves the working surface. It remains distinct from current actionable data. Commands require fresh readiness, and generation checks prevent late callbacks from restoring retired state.

This combines continuity of interaction with explicit execution authority.

## Why reuse real components on the landing?

Presentation exports let the static demo show the same balance, entry, editor, position, and history components as the product. Typed fixtures provide consistent examples without authentication or exchange connections.

The boundary is presentation. The landing does not import runtime controllers, start trading transport, or simulate an exchange result when a demonstration control changes.

## Why distinguish build, deployment, and readiness?

A built image is an artifact. A host apply selects and starts it. Account recovery determines whether it can safely resume commands. Public readback checks which components are actually served.

These stages support precise retries and failure reports. An older image is a valid rollback candidate only when compatible with the current schema and persisted operation data.
