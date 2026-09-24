# Testing strategy and engineering workflow

[Overview](../README.md) · [Delivery](delivery-and-verification.md)

Financial mathematics, exchange normalization, durable transitions, and browser interaction fail in different ways. The test strategy follows those boundaries.

## Pure domain and client tests

Vitest covers sizing, allocation, decimal behavior, position metrics, parsers, stores, and state transitions. These tests enumerate edge cases without starting an application or contacting a provider.

The [runnable entry-sizing example](../examples/risk-based-entry/README.md) includes the product's sizing test suite, covering contract units, risk allocation, per-order quantity rules, and precise decimal edge cases.

Store tests exercise ordering, not only final values. One example queues a valuation update, advances the terminal revision, and then executes the deferred callback. Neither market nor balance state may change. [The client architecture walkthrough](realtime-clients.md#walkthrough-a-late-valuation-after-a-position-change) explains this race and the commit guard that prevents it.

Client recovery tests verify that retained intent observes the original receipt, suspension stops observation, and a retired generation cannot clear a newer operation's state.

## Adapter contracts

A common contract suite checks what each exchange integration promises to the runtime. Stateful, sanitized provider fixtures exercise raw-to-normalized mapping and read-after-write behavior.

Venue-specific tests cover conditional orders, client IDs, account modes, pagination, rate-limit feedback, and history coverage. Provider combinations stay at the adapter boundary rather than multiplying every browser journey by every exchange.

## Runtime scenarios

A deterministic fake exchange makes intermediate states controllable. A test can hold a request open, deliver a private event, change generation, fail persistence, and then release the original result.

Representative scenarios include:

- An entry is accepted while final publication is delayed.
- A stale open-state read arrives after a protection change.
- A mutation times out and is recovered without another dispatch.
- Historical income remains pending while structural positions become ready.
- An account reconnects while an old preparation task is still unwinding.
- An original Close All target fills or closes while a later lifecycle opens on the same symbol.

These tests establish ordering that small happy-path mocks would miss.

## PostgreSQL integration

Database-backed suites run against disposable PostgreSQL. They exercise actual constraints, locks, transactions, operation settlement, group inventory, migration history, and restart recovery.

The important question is often what survives interruption. Tests distinguish a committed durable fact from an in-memory result that disappears when a new owner is constructed.

Migration tests verify the ordered checksum journal and compatibility conditions. Editing an old applied migration is not a substitute for a new forward transition.

## Full-stack browser behavior

Playwright drives the real web application through Nginx, HTTP, WebSocket, Fastify, PostgreSQL, and the fake exchange. Tests observe the same publications and interactions as the user.

The dedicated E2E control plane changes fake-exchange behavior. It can delay a real adapter response or a real terminal publication to make a race reproducible. It does not seed a successful React state or fabricate a product socket frame to skip the workflow being tested.

Browser scenarios cover forms, dialogs, navigation, readiness, reconnect, authentication, and responsive behavior. Financial and provider combinations remain in focused lower-level suites.

The runner discovers the requested inventory, isolates test lanes, continues after individual failures, and returns a summary of the complete batch.

## Storybook and native checks

Storybook provides repeatable component states: loading, reconnect, protected positions, selected cards, and large numerical values. It supports visual inspection and accessibility feedback while keeping fixtures away from live account execution.

Native source checks, renderer tests, fixture flows, and device qualification complement shared logic tests. Cross-platform reuse reduces duplicated behavior but leaves navigation, lifecycle, gestures, and rendering with their own validation needs.

## Architectural constraints are executable

Repository policy tests check package dependencies, transport ownership, presentation imports, numeric-display policies, and test boundaries. They prevent gradual drift, such as a component starting its own socket or a portable package importing platform code.

The source gate combines Biome, Oxlint, Fallow, TypeScript, infrastructure tests, and application tests. The normal `check` command also builds production packages. Release checks also validate deployment configuration and end-to-end behavior.

## Regression workflow

A regression starts with a reproducible scenario at the layer that owns the behavior. Domain errors belong in pure calculation tests; ordering faults belong in controlled runtime or store tests; transaction failures require PostgreSQL; interaction failures require a connected browser journey.

Focused tests support iteration, while the broader verification pipeline catches effects across package and application boundaries. Environment failures are reported separately from application failures so an unavailable dependency is not mistaken for a product regression.
