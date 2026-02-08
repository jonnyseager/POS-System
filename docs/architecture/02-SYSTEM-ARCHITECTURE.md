# System Architecture

## High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  POS App     │  │  Back Office │  │  Owner App   │              │
│  │  (Tablet)    │  │  (Web)       │  │  (Mobile)    │              │
│  │              │  │              │  │              │              │
│  │  React Native│  │  Next.js     │  │  React Native│              │
│  │  + SQLite    │  │              │  │              │              │
│  │  + Local DB  │  │              │  │              │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                      │
│         │         SYNC LAYER (CRDT-based)     │                      │
│         └──────────────────┼──────────────────┘                      │
└────────────────────────────┼─────────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │   API Gateway   │
                    │   (Kong/Custom) │
                    └────────┬────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────────┐
│                    SERVICES LAYER                                     │
│                                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │ Auth    │ │ Catalog │ │ Orders  │ │ Inventory│ │Payments │     │
│  │ Service │ │ Service │ │ Service │ │ Service  │ │ Service │     │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘     │
│       │           │           │            │           │           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │  Sync   │ │Reporting│ │  VAT    │ │   AI    │               │
│  │ Service │ │ Service │ │ Service │ │ Service │               │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘               │
│       │           │           │            │                      │
└───────┼───────────┼───────────┼────────────┼──────────────────────┘
        │           │           │            │
┌───────┼───────────┼───────────┼────────────┼──────────────────────┐
│       │       DATA LAYER      │            │                      │
│  ┌────┴────┐ ┌────┴────┐ ┌───┴─────┐ ┌───┴─────┐               │
│  │PostgreSQL│ │ClickHouse│ │  Redis  │ │  S3     │               │
│  │ (Primary)│ │(Analytics)│ │ (Cache) │ │ (Files) │               │
│  └─────────┘ └──────────┘ └─────────┘ └─────────┘               │
│                                                                    │
│  ┌──────────────────────────────────────┐                         │
│  │     Event Bus (Apache Kafka)          │                         │
│  └──────────────────────────────────────┘                         │
└────────────────────────────────────────────────────────────────────┘
```

## Architecture Principles

### 1. Offline-First is Non-Negotiable

The POS client is a fully autonomous unit. It must:
- Process sales with zero connectivity
- Calculate prices, taxes, and discounts locally
- Queue payment authorisations for later settlement
- Store all transactions in a local SQLite database
- Sync bidirectionally when connectivity returns

This is not "graceful degradation." The offline experience IS the primary experience. The cloud is the sync and intelligence layer.

### 2. Event-Sourced Core

Every state change in the system is captured as an immutable event:
- `OrderCreated`, `OrderItemAdded`, `OrderCompleted`, `PaymentProcessed`
- `InventoryAdjusted`, `StockReceived`, `WasteRecorded`
- `MenuItemPriceChanged`, `IngredientCostUpdated`

This gives us:
- Complete audit trail (critical for VAT compliance)
- Ability to rebuild state at any point in time
- Natural feed for analytics and AI pipelines
- Clean conflict resolution during sync

### 3. Multi-Tenant from Day One

Every row in the database is scoped to a `tenant_id` (business). This is enforced at the database level via Row-Level Security (RLS) in PostgreSQL. There is no "we'll add multi-tenancy later" — that path leads to a rewrite.

### 4. CQRS for Reporting

Commands (writes) and Queries (reads) use separate paths:
- **Writes** go to PostgreSQL via the event-sourced command handlers
- **Heavy reads** (reports, dashboards, analytics) hit ClickHouse, populated via Kafka consumers
- This prevents reporting queries from degrading POS performance

### 5. API-First Design

Every capability is exposed via a well-documented API. The POS app, back office, and mobile app are all API consumers. This enables:
- Third-party integrations from day one
- Future marketplace/platform plays
- Clean separation of concerns

## Service Boundaries

| Service | Responsibility | Database | Events Published |
|---------|---------------|----------|-----------------|
| **Auth** | Authentication, authorisation, tenant management | PostgreSQL (shared) | `UserCreated`, `TenantCreated`, `RoleAssigned` |
| **Catalog** | Menu items, categories, modifiers, recipes, ingredient costs | PostgreSQL | `MenuItemCreated`, `PriceChanged`, `RecipeUpdated` |
| **Orders** | Order lifecycle, line items, discounts, tips | PostgreSQL | `OrderCreated`, `OrderCompleted`, `OrderVoided` |
| **Inventory** | Stock levels, ingredient tracking, waste recording, supplier management | PostgreSQL | `StockAdjusted`, `WasteRecorded`, `ReorderTriggered` |
| **Payments** | Payment processing, refunds, settlement, reconciliation | PostgreSQL | `PaymentProcessed`, `RefundIssued`, `SettlementCompleted` |
| **Sync** | Offline sync orchestration, conflict resolution, device management | PostgreSQL + Redis | `SyncCompleted`, `ConflictResolved` |
| **Reporting** | Dashboards, reports, export, real-time metrics | ClickHouse (read) | None (consumer only) |
| **VAT** | UK VAT calculation, MTD compliance, tax reporting | PostgreSQL | `VATReturnGenerated`, `MTDSubmissionCompleted` |
| **AI** | Demand forecasting, prep recommendations, anomaly detection | ClickHouse (read) + model store | `ForecastGenerated`, `AnomalyDetected` |

## Deployment Architecture

### Phase 1 (MVP): Modular Monolith
We do NOT start with microservices. We start with a **modular monolith** — a single deployable unit with strict internal module boundaries that mirror the service boundaries above.

Why:
- A team of 1-3 engineers cannot operate microservices
- Network boundaries between services add latency and complexity
- Module boundaries in code are sufficient for separation
- We can extract services later when we have clear scaling bottlenecks

The monolith runs on:
- **AWS ECS Fargate** (or **Fly.io** for faster iteration in early phase)
- **AWS RDS PostgreSQL** (managed, with automated backups)
- **AWS ElastiCache Redis**
- **S3** for file storage

### Phase 2+: Extract High-Load Services
When we hit scaling pressure, we extract:
1. **Sync Service** first (highest write volume, most latency-sensitive)
2. **Payments Service** second (regulatory isolation, PCI scope reduction)
3. **AI Service** third (different compute profile — GPU instances)

### Infrastructure as Code
All infrastructure defined in **Terraform** from day one. No click-ops. Every environment is reproducible.

## Security Architecture

- **Authentication**: JWT tokens with short expiry (15 min) + refresh tokens
- **Device authentication**: Each POS device gets a device certificate for sync authentication
- **Encryption at rest**: AES-256 for all databases, including local SQLite on devices
- **Encryption in transit**: TLS 1.3 everywhere
- **PCI compliance**: Payment card data never touches our servers — delegated to payment processor (Stripe/Adyen)
- **GDPR**: Data residency in EU, right-to-deletion support in event store (crypto-shredding)
- **Row-Level Security**: PostgreSQL RLS policies enforce tenant isolation at the database layer
