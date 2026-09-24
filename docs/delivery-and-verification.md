# Deployment, CI/CD, and observability

[Overview](../README.md)

A trading application needs a release process that preserves operation ownership and makes failure recoverable. A successful image build proves a different fact from a healthy, freshly reconciled account on the deployed server.

## Hosting and runtime topology

The application is hosted on an **Ubuntu VPS at Vultr**, with **Cloudflare** in front of its public domains. **Docker** packages the runtime, and **Docker Compose** describes the application services and their persistent resources.

```mermaid
flowchart TB
    Clients[Web and native clients] --> Edge[Cloudflare DNS and proxy]
    subgraph Host[Ubuntu VPS on Vultr]
        Nginx[Host Nginx]
        Static[Terminal, admin, and landing assets]
        Supervisor[Host deployment supervisor]
        subgraph Application[Application Docker Compose project]
            Server[Fastify container]
            Database[(PostgreSQL container)]
            Storage[(Persistent database volume)]
            Server --> Database
            Database --- Storage
        end
        Monitoring[Separate monitoring Compose stack]
        Nginx --> Static
        Nginx -->|HTTP API and WebSocket| Server
        Supervisor -->|Serialized runtime lifecycle| Server
        Server -.->|Metrics and logs| Monitoring
    end
    Edge --> Nginx
```

| Layer | Responsibility |
| --- | --- |
| Cloudflare | Public DNS and proxying; the deployment design adds Cloudflare Access around administrative surfaces. |
| Vultr VPS and Ubuntu | Host operating system, Docker Engine, Nginx, and the deployment supervisor. |
| Docker | Immutable backend images and isolated service processes. |
| Docker Compose | Service definitions, environment wiring, health checks, startup dependencies, networking, and volumes. |
| Host Nginx | Serve static applications and forward API and WebSocket traffic to the backend's loopback-bound port. |
| Persistent PostgreSQL volume | Retain application data across container replacement. |
| Host supervisor | Serialize deployment and recovery while preserving one active trading runtime. |

Compose checks that PostgreSQL is healthy before starting the server. The server's automatic Docker restart policy is disabled: its supervisor must verify runtime identity and ownership before a restart. The monitoring stack has a separate configuration lifecycle, so an application release can leave unchanged monitoring containers running.

This topology keeps operation on one host explicit. Host failure affects availability, and a full runtime replacement has a maintenance window. Container health checks, persistent storage, and supervised recovery each address a different part of that operating model.

## Demo isolation

The public demo uses the regular terminal bundle with a separate server composition and PostgreSQL database. It reads public Binance market data and executes against a simulated adapter with virtual funds. Visitor sessions have separate authentication and share a demo portfolio. LIVE and DEMO have separate credentials, sessions, and financial state.

## CI/CD pipeline

```mermaid
flowchart LR
    Plan[Select checks for the change] --> Checks[Run checks or reuse matching results]
    Checks --> Candidate[Verify the exact candidate and transition]
    Candidate --> Builds[Protected source gate and immutable delivery build]
    Builds --> Host[Serialized host deployment]
    Host --> Readiness[Runtime and account readiness]
    Readiness --> Readback[Public service and asset checks]
```

The certified path selects application checks from the affected product inputs, including the consumers of shared HTTP and WebSocket contracts. A browser result belongs to its scenario, engine, layout, authentication profile, fixture, and environment. The release can reuse it when those inputs, its report, and its producer artifacts still match. A later failure or interruption for the same inputs invalidates the earlier result.

After application checks, candidate verification covers the exact server and web artifacts, authenticated requests, WebSocket continuity, and any required migration and runtime handoff. The protected publication workflow runs its source gate and builds the production delivery artifacts. A manifest identifies the server image by digest and links it to its static assets.

An eligible low-risk change can use the fast path with the protected source gate, immutable production build, supervised deployment, and public readback. Changes to trading, persistence, shared transport, or runtime ownership use the certified path.

## Runtime replacement and maintenance

The host supervisor owns one serialized operation independently of an SSH session or workflow lifetime. A full release verifies compatibility, closes admission, drains work, proves predecessor termination, migrates, and starts one successor.

Reopening traffic requires fresh account recovery above the recorded revision floors. A running process or an Nginx switch alone does not establish readiness.

During maintenance, the retiring owner can continue approved protective work until it reaches a safe handoff. The single-runtime design still has a bounded stop/start window. A compatible static-only update can refresh frontend assets without replacing the trading runtime.

## Test the failure boundaries

| Layer | Representative question |
| --- | --- |
| Pure domain tests | Are sizing, allocation, and decimal calculations correct at boundary inputs? |
| Adapter contracts | Do venue-specific responses normalize into the promised contract? |
| Account runtime tests | Can a stale source result overwrite a newer command or connection generation? |
| PostgreSQL integration | Do operation facts and their completion records commit together across restart? |
| Browser behavior | Does the UI wait for factual publication, retain drafts, and recover from interruption? |
| Deployment tests | Does maintenance preserve single ownership and require fresh readiness before reopening? |
| Architecture checks | Are platform imports and transport ownership still within their intended boundaries? |

Stateful fake exchanges and disposable PostgreSQL environments make controlled failures repeatable. The E2E control plane is installed only through a dedicated test entrypoint. Ordinary production routes do not expose its controls.

The browser runner continues through the selected test batch after an individual failure and reports an aggregate result, so independent failures remain visible in the same run.

## Observe the entire user-visible operation

Opening latency can include admission, provider scheduling, exchange acceptance, factual readback, persistence, publication, network delivery, client application, and presentation.

Structured logs correlate those stages by operation, account, connection, and revision. Metrics cover account readiness, history repair, stream demand, admission failures, and publication work. High-cardinality account or order identities belong in bounded diagnostic context rather than being added indiscriminately to metric labels.

Prometheus, Grafana, Loki, and Alloy support investigation. Monitoring remains observational: a dashboard cannot authorize an order or turn last-known exposure into current truth.

## Recovery and compatibility

The release journal keeps the exact artifacts and completed phases so an interrupted observer can resume the same deployment. LIVE and DEMO have independent outcomes. After host completion, public readback checks the backend and served web assets for the targeted environment. A rollback image must support the current schema and persisted operation data.
