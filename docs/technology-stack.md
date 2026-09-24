# Technology stack and implementation approach

[Overview](../README.md) · [Backend architecture](backend-architecture.md)

The stack is divided by responsibility: application rendering, portable client behavior, financial contracts, server execution, persistence, and operations. The interesting part is how those tools meet at the boundaries.

## TypeScript and the monorepo

The applications and packages live in one pnpm workspace. Strict TypeScript makes contracts visible across the workspace, while ESM and explicit package exports define which entry points consumers can import.

The shared package contains runtime schemas and pure domain functions. The client package exposes feature-specific subpaths for accounts, markets, charts, terminal state, history, and trading. Consumers import the feature owner directly instead of depending on a broad root API object.

Type checking catches internal mismatches, but external data still requires runtime validation. Zod schemas define accepted transport shapes, including explicit unavailable states and discriminated operation outcomes. A malformed network response cannot acquire validity merely because a TypeScript assertion says it has the expected type.

## React, Vite, and routing

The trading application is a static React SPA built with Vite. Fastify owns the server APIs; serving the web client does not require a separate application-rendering process. Nginx serves immutable assets and routes API and WebSocket traffic to the backend.

TanStack Router supplies file-based routes and generated route splitting. The router plugin runs before the React build plugin so generated routes participate in the same compilation pipeline.

React Compiler is enabled in the web build. Build checks inspect compiler reports and generated memoization in selected application roots. Manual memoization is reserved for concrete identity contracts, such as chart instances, subscriptions, selectors, and animation boundaries. Compiler-assisted rendering does not replace deliberate state ownership.

The landing has a different delivery requirement: it uses TanStack Start to prerender public routes to static HTML. It reuses approved web presentation exports with typed fixtures, and has no trading API or socket lifecycle. The terminal stays a SPA while the public site delivers meaningful initial HTML.

## Query cache, streaming stores, and forms

Three tools address three different update patterns:

| Owner | Examples | Update model |
| --- | --- | --- |
| TanStack Query | Accounts, catalog, settings, presets, profile | Request-based fetching and feature-specific invalidation. |
| Zustand vanilla stores | Terminal revisions, selected market frames, account summaries | Explicit application of server publications with narrow selectors. |
| React Hook Form and feature-local draft owners | Entry inputs, stops, targets, allocation, editor state | User-owned interaction and synchronous draft feedback. |

Streaming data is not copied into every query cache. Draft values are not written into the current position projection. These distinctions prevent an edit, a stale request, and a live update from competing to own the same value.

Portable stores use vanilla interfaces, so web and native can reuse them without a React dependency. Renderer batching is injected where coordinated presentation needs it; store admission still checks revisions independently.

## UI primitives and interaction

Tailwind CSS provides the web styling vocabulary. Radix primitives supply dialogs, popovers, and tabs; Lucide supplies interface icons. Semantic tokens live in their own package so platforms can share visual intent without sharing DOM markup.

Framer Motion handles coordinated transitions. Small hover and connection effects remain in CSS. Reduced-motion behavior is part of the presentation contract, and financial completion is not inferred from an animation ending.

The TP/DCA level list supports pointer, touch, and keyboard reordering. Stable row identities preserve the relationship between price, allocation, and risk-free triggers. Submission canonicalizes ordering independently of whichever field currently has focus.

Storybook renders production components with deterministic fixtures. It includes loading, reconnect, selected states, and numeric-width cases, which are particularly useful in a dense financial interface. Connected workflows are covered through the application stack.

## Charts and native graphics

The web terminal uses Lightweight Charts for candlesticks and chart interaction. Financial annotations consume server-published facts, and imperative chart instances have explicit setup, subscription, and cleanup ownership.

The Expo application uses native renderers, including Skia, alongside native gesture and animation tooling. Portable modules own calculations and renderer-neutral data; platforms own drawing, gestures, and layout.

This boundary allows shared semantics without forcing the web chart library into a WebView or treating a native gesture as a DOM event.

## Expo and device lifecycle

Expo Router owns native navigation. The app integrates networking, deep links, SecureStore, sharing, and device lifecycle behavior through app-local modules.

An unresolved trading intent must survive a phone suspending its JavaScript work. Native persistence is awaited before the relevant mutation is dispatched. Resume restarts fenced observation of that intent; it does not submit the financial action again.

The workspace also contains EAS workflows for builds and updates. A native dependency or configuration change belongs to a new binary, while an eligible JavaScript update follows its runtime and channel compatibility contract.

## Fastify and concrete composition

Fastify hosts HTTP routes, WebSocket connections, authentication integration, rate limits, and health endpoints. The application factory receives explicit dependencies, making composition usable by production startup and focused tests.

Feature routes validate inputs, authenticate the requester, enforce resource ownership, and call concrete feature functions or the account runtime. Domain execution does not depend on HTTP request objects. Stateful objects are used where they own a lifecycle, such as an account session or exchange client.

Fastify injection tests exercise route behavior without opening a listening socket. PostgreSQL and exchange-facing behavior are tested at their own boundaries.

## PostgreSQL, Drizzle, and decimal.js

PostgreSQL stores user data, desired configuration, execution intent, operation outcomes, and historical evidence. Drizzle provides typed schema and query construction over `pg`, while feature owners retain direct control over transaction boundaries.

Transactions and locks establish concrete invariants: operation admission, account settlement, immutable target inventory, migration serialization, or cooldown admission. Slow provider work runs outside short database admission transactions.

decimal.js handles financial arithmetic. Decimal strings preserve values through JSON and package boundaries. Precision, exchange rounding, and display formatting are distinct policies; choosing a decimal library alone does not determine how to size a valid order.

## CCXT and exchange-specific integration

CCXT is contained inside exchange adapters and public scopes. The normalized contract exposes the facts and capabilities required by the terminal, while adapters retain provider symbols, endpoint behavior, order identifiers, and stream details.

Venue differences remain explicit. Position mode, settlement asset, contract size, order rules, stop mechanisms, and history acquisition cannot all be erased by a common method name. Shared contract tests verify the application-facing behavior, with venue-specific tests for protocol details.

## Authentication and signal extraction

Better Auth is integrated with Fastify and PostgreSQL as the serving session authority. Authentication methods are enabled through complete configuration groups. The backend distinguishes identity from the assurance needed for a sensitive action.

The signal parser uses the OpenAI SDK within a bounded feature. It normalizes input, requests structured extraction, validates the output, and maps it to the established form contract. A versioned cache and shared in-flight work avoid repeating identical provider work. Per-user admission and parse history remain separate from the cache.

Parsing does not own exchange execution. The user-facing workflow and ordinary trading admission determine whether a resulting setup can be submitted.

## Cloudflare, Vultr, and Ubuntu

Production runs on a Vultr VPS with Ubuntu. Cloudflare provides the public DNS and proxy layer in front of the origin. Host Nginx serves the terminal, administrator console, and prerendered landing assets, and forwards API and WebSocket requests to Fastify.

The deployment design also includes Cloudflare Access as an additional boundary for the administrative surfaces. Application sessions, user roles, and action-specific authentication requirements remain enforced by the backend.

## Docker and Docker Compose

Docker packages the backend as an immutable release image. Docker Compose declares the server and PostgreSQL services, their environment, health checks, dependencies, and persistent storage. The server binds to a loopback port on the host for Nginx; PostgreSQL uses a persistent external volume that survives container replacement.

The trading server deliberately has no automatic Docker restart policy. Its host supervisor checks release identity and runtime ownership before starting a successor. Compose supplies the service mechanics, while the supervisor owns maintenance, drain, migrations, startup, readiness, and recovery.

Monitoring uses a separately managed Compose stack. Application releases can reuse the running monitoring services when their configuration is unchanged. Local development and disposable verification environments also use Docker and Compose, with their own configuration.

[Hosting topology and release lifecycle →](delivery-and-verification.md#hosting-and-runtime-topology)

## Tooling and operations

Biome handles formatting and lint checks. Oxlint supplies targeted rules. Fallow checks unused code, duplication, and complexity. TypeScript validates references across the workspace. Vitest and Playwright cover the behavior described in the [testing strategy](testing-strategy.md).

GitHub Actions builds release artifacts; Nginx serves public surfaces; the host supervisor serializes apply and recovery. Pino, Prometheus, Grafana, Loki, and Alloy provide the diagnostic path from a visible symptom to its owning stage.
