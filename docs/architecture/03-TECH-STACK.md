# Tech Stack Decisions

Every choice here is opinionated and justified. We optimise for: developer productivity with a tiny team, offline-first capability, type safety across the full stack, and a clear path to scale.

---

## Summary

| Layer | Technology | Justification |
|-------|-----------|---------------|
| POS Client | React Native (Expo) | Cross-platform tablet app, large ecosystem, offline-capable |
| Local Database | SQLite (via op-sqlite) | Embedded, fast, battle-tested, zero-config |
| Local Sync Engine | Custom CRDT-based engine | Required for conflict-free offline merge |
| Back Office Web | Next.js 14+ (App Router) | SSR, React ecosystem, Vercel-deployable |
| Owner Mobile App | React Native (Expo) | Code sharing with POS client |
| API Server | Node.js + Fastify + TypeScript | Fast, typed, huge ecosystem, same language as clients |
| ORM / Query Builder | Drizzle ORM | Type-safe, lightweight, SQL-close, great migration story |
| Primary Database | PostgreSQL 16 | Best relational DB, RLS, JSONB, excellent ecosystem |
| Cache | Redis 7 | Session store, rate limiting, real-time sync coordination |
| Analytics DB | ClickHouse | Column-oriented, sub-second aggregation on billions of rows |
| Event Bus | Apache Kafka (or Redpanda) | Durable event log, replay capability, exactly-once semantics |
| Object Storage | AWS S3 | Receipt images, exports, backups |
| Auth | Custom JWT + refresh tokens | Full control, no vendor lock-in on auth |
| Payments | Stripe Connect (UK) | Best UK coverage, Connect model for future marketplace |
| Infrastructure | AWS (ECS Fargate, RDS, ElastiCache) | Mature, well-documented, UK regions available |
| IaC | Terraform | Industry standard, multi-cloud capable |
| CI/CD | GitHub Actions | Integrated with repo, sufficient for early stage |
| Monitoring | Grafana + Prometheus + Sentry | Open-source observability stack |
| Language | TypeScript everywhere | One language across entire stack, maximum code sharing |

---

## Detailed Justifications

### Why TypeScript Everywhere

**Decision:** TypeScript for client, server, and shared libraries.

**Rationale:**
- A founding team of 1-3 engineers cannot afford context-switching between languages
- Shared type definitions between API and clients eliminate an entire class of bugs
- Shared validation logic (Zod schemas) runs identically on client and server
- The npm ecosystem provides libraries for every integration we'll need
- TypeScript's type system is sophisticated enough for complex domain modelling

**Trade-off acknowledged:** Node.js is not the fastest runtime. Go or Rust would give us better raw throughput. But throughput is not our bottleneck at <1000 businesses. Developer velocity is. We can extract hot paths into Go/Rust services later if needed.

### Why React Native (Expo) for POS

**Decision:** React Native via Expo SDK for the tablet POS application.

**Rationale:**
- Must run on both iPad and Android tablets (vendors use whatever they have)
- Expo provides managed build pipelines — critical when you don't have a dedicated mobile engineer
- Direct access to SQLite for local database via `op-sqlite`
- Can share business logic, types, and validation with the server
- Large community means faster problem-solving

**Alternatives rejected:**
- **Flutter**: Dart ecosystem is smaller, fewer offline/SQLite libraries, harder to hire for
- **Native (Swift/Kotlin)**: Two codebases is unaffordable for a small team
- **PWA**: Insufficient offline storage APIs, no reliable background sync, no hardware access (card readers, receipt printers)

### Why SQLite for Local Storage (Not WatermelonDB, Not Realm)

**Decision:** Raw SQLite via `op-sqlite` with a custom sync layer.

**Rationale:**
- SQLite is the most deployed database engine in the world. It is not going away.
- `op-sqlite` gives us synchronous, JSI-based access — no bridge overhead
- We need full control over the sync protocol (CRDTs with business-rule conflict resolution)
- WatermelonDB adds abstractions we'd fight against; Realm couples us to MongoDB's sync protocol

**Trade-off:** We build and maintain our own sync engine. This is significant engineering effort. But sync is our core differentiator — outsourcing it to a third-party library means inheriting their limitations and bugs in the most critical path of our system.

### Why Fastify (Not Express, Not NestJS)

**Decision:** Fastify as the HTTP framework.

**Rationale:**
- 2-3x faster than Express in benchmarks (matters for sync endpoints under load)
- Built-in schema validation via JSON Schema (we'll use Zod-to-JSON-Schema)
- Excellent plugin architecture for modular monolith design
- TypeScript support is first-class
- Lightweight — does not impose architectural opinions (unlike NestJS)

**Alternative rejected:**
- **NestJS**: Too much abstraction for a small team. Angular-style decorators add indirection. We want to see the code path from HTTP request to database query without jumping through 5 layers of DI.
- **Express**: Slower, callback-based legacy API, middleware ordering is error-prone

### Why Drizzle ORM (Not Prisma, Not TypeORM)

**Decision:** Drizzle ORM for database access.

**Rationale:**
- SQL-close: the API maps directly to SQL concepts. No magic, no hidden queries.
- Type-safe: schema definitions generate TypeScript types automatically
- Lightweight: no heavy runtime, no query engine binary (unlike Prisma)
- Migration support built-in
- Works well with PostgreSQL's advanced features (RLS, JSONB, arrays)

**Alternative rejected:**
- **Prisma**: Heavy runtime binary, abstracts too far from SQL, poor support for advanced PostgreSQL features, migration system is opinionated in ways that conflict with event sourcing
- **TypeORM**: Buggy, inconsistent API, poor TypeScript support despite the name

### Why PostgreSQL (Not MySQL, Not MongoDB)

**Decision:** PostgreSQL 16 as the primary OLTP database.

**Rationale:**
- Row-Level Security for multi-tenant isolation
- JSONB columns for flexible metadata without sacrificing relational integrity
- Excellent support for complex queries (window functions, CTEs, lateral joins)
- `pg_cron` for scheduled jobs
- `pg_stat_statements` for query performance monitoring
- The best-supported open-source relational database, period

**Why not MongoDB:** Our data is fundamentally relational. Orders have line items. Line items reference menu items. Menu items have recipes. Recipes have ingredients. Ingredients have costs. This is a relational domain. Document databases create data integrity nightmares here.

### Why ClickHouse for Analytics

**Decision:** ClickHouse as the analytical database, populated via Kafka.

**Rationale:**
- Sub-second aggregation queries on billions of rows
- Column-oriented storage is perfect for "sum revenue by day by location" queries
- 10-40x compression on time-series transaction data
- Materialized views for pre-computed dashboards
- Open source, self-hostable, or managed via ClickHouse Cloud

**When we add it:** Not in Phase 1. PostgreSQL handles reporting fine at low scale. ClickHouse enters in Phase 2 when reporting queries start competing with OLTP queries for resources.

### Why Kafka (or Redpanda)

**Decision:** Apache Kafka as the event bus, with Redpanda as a simpler alternative for early stages.

**Rationale:**
- Durable, ordered event log — events are never lost
- Replay capability — reprocess events when we fix bugs or add new consumers
- Exactly-once semantics for payment and inventory events
- Natural fit for event-sourced architecture
- Redpanda is API-compatible with Kafka but simpler to operate (single binary, no ZooKeeper)

**When we add it:** Phase 1 uses a simple in-process event bus (Node.js EventEmitter or a lightweight library). We introduce Kafka/Redpanda in Phase 2 when we need durable events across service boundaries.

### Why Stripe Connect for Payments

**Decision:** Stripe Connect in the UK market.

**Rationale:**
- Best developer experience in payments — not close
- Connect model lets each vendor be a connected account, enabling future marketplace features
- UK regulatory coverage (FCA authorised)
- Terminal SDK for in-person card readers (BBPOS Chipper, Stripe Reader)
- Handles PCI compliance — card data never touches our servers
- Built-in dispute handling, refunds, and settlement

**Trade-off:** Stripe's pricing is higher than going direct to an acquirer. At scale (Phase 3+), we may negotiate custom rates or add Adyen as a second processor. But Stripe's developer experience and speed-to-market are worth the premium in Phase 1.

### Why NOT Firebase / Supabase for MVP

These are tempting for speed but wrong for this product:
- **Firebase**: Vendor lock-in to Google, no RLS equivalent, poor offline sync for complex relational data, Firestore's data model fights against relational domains
- **Supabase**: Better (PostgreSQL-based), but their real-time/sync story is not mature enough for our offline-first requirements, and we'd outgrow their managed platform quickly

We need full control over the database layer and sync protocol. The cost of migrating off Firebase at scale is a company-killer.
