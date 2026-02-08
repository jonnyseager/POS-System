# Phase 1 MVP Scope

## Guiding Principle

Phase 1 answers one question: **Can a mobile food vendor run their entire trading day using our system, offline, and understand their margin at the end of the day?**

Everything in Phase 1 exists to serve that question. Everything else waits.

---

## What's IN Phase 1

### 1. POS Tablet App (React Native)
- **Menu display**: Grid of categories and items with prices
- **Order creation**: Tap to add items, adjust quantity, add notes
- **Modifiers**: Size upgrades, extras, sauce choices
- **Order discounts**: Percentage or fixed amount
- **Cash payments**: Record amount, calculate change
- **Card payments**: Stripe Terminal integration (Reader M2 or similar)
- **Order completion and receipt**: On-screen confirmation (no printer in Phase 1)
- **Shift management**: Open shift with float, close shift with cash count
- **Offline mode**: Full functionality without internet
- **Local SQLite storage**: All data persisted locally
- **Background sync**: Push/pull when connectivity available
- **Staff PIN login**: Quick switch between staff members

### 2. Back Office Web App (Next.js)
- **Dashboard**: Today's sales, revenue, orders count, average order value
- **Menu management**: CRUD for categories, items, modifiers
- **Ingredient management**: CRUD for ingredients with unit costs
- **Recipe builder**: Link ingredients to menu items with quantities
- **Margin calculator**: Real-time cost and margin per menu item
- **Shift reports**: Sales by shift, cash variance
- **Basic sales reports**: Revenue by day/week/month, top items, sales by category
- **Location management**: CRUD for locations
- **Device management**: Register and manage POS devices
- **Staff management**: Add/remove staff, set PINs, assign roles
- **VAT settings**: Set VAT registration status, configure tax rates

### 3. API Server (Fastify + TypeScript)
- **Auth endpoints**: Register, login, refresh token, device auth
- **CRUD endpoints**: All entities above
- **Sync endpoints**: Push and pull protocol
- **Stripe integration**: Connect onboarding, payment intents, terminal connection tokens
- **Basic event logging**: Append events to events table (not full event sourcing yet)

### 4. Infrastructure
- **PostgreSQL on AWS RDS**: Primary database
- **Redis on ElastiCache**: Session store, rate limiting
- **ECS Fargate**: API server deployment
- **S3**: Database backups
- **Terraform**: All infrastructure as code
- **GitHub Actions CI/CD**: Lint, test, build, deploy
- **Sentry**: Error tracking
- **Basic Grafana dashboard**: API latency, error rates, sync queue depth

### 5. Business Operations
- **Stripe Connect onboarding flow**: Vendor creates account, completes Stripe KYC
- **UK VAT calculation**: Standard (20%), reduced (5%), zero-rated
- **Basic VAT summary report**: Total VAT collected by rate, by period

---

## What's OUT of Phase 1 (Explicitly Deferred)

| Feature | Why Deferred | Target Phase |
|---------|-------------|--------------|
| Receipt printing | Hardware integration complexity; on-screen receipt is sufficient for market testing | Phase 2 |
| Customer-facing display | Nice-to-have, not essential for validation | Phase 2 |
| Inventory stock tracking | Recipe costing works without stock tracking; stock adds sync complexity | Phase 2 |
| Waste recording | Important but not day-one essential | Phase 2 |
| Supplier management | Vendors manage supplier relationships manually in Phase 1 | Phase 2 |
| Multi-location management | Phase 1 targets single-location operators | Phase 2 |
| Owner mobile app | Back office web works on mobile browser | Phase 2 |
| ClickHouse analytics | PostgreSQL handles reporting at Phase 1 scale | Phase 2 |
| Kafka event bus | In-process events are sufficient | Phase 2 |
| AI forecasting | Requires data volume we won't have in Phase 1 | Phase 3 |
| Dynamic pricing | Requires AI layer | Phase 3 |
| Embedded finance | Requires transaction history and regulatory work | Phase 3 |
| MTD VAT submission | Manual export is sufficient initially | Phase 3 |
| Marketplace features | Requires scale | Phase 4 |
| Third-party API | Requires stable API design | Phase 3 |
| Barcode scanning | Mobile food vendors don't use barcodes | Phase 3+ |
| Kitchen display system | Mobile vendors don't need KDS | Phase 3+ |
| Table management | Not relevant for mobile food vendors | Phase 3+ |

---

## Phase 1 Success Criteria

Before moving to Phase 2, we must achieve:

1. **10 paying vendors** actively using the system for real trading
2. **Zero data loss** — every transaction recorded, synced, and reconciled
3. **<3 second** sync completion for a typical day's data (~200 orders)
4. **Cash variance** under £5 on 90% of shifts (proving accurate cash tracking)
5. **Vendor can articulate their margin** per item using our recipe costing
6. **NPS > 40** from pilot vendors
7. **<2% churn** in first 3 months after onboarding

---

## Phase 1 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| POS app cold start | < 3 seconds |
| Order creation to completion | < 10 taps for a simple order |
| Offline operation duration | Unlimited (until device storage full) |
| Sync latency (when online) | < 5 seconds for push, < 10 seconds for pull |
| API response time (p95) | < 200ms |
| API uptime | 99.5% (allows ~44 hours downtime/year — acceptable for Phase 1) |
| Data backup frequency | Every 6 hours |
| Recovery Point Objective (RPO) | 6 hours (cloud data), 0 (device data, sync on reconnect) |
| Recovery Time Objective (RTO) | 4 hours |

---

## Phase 1 Technical Architecture (Simplified)

```
┌──────────────┐     ┌──────────────┐
│  POS App     │     │  Back Office │
│  (React      │     │  (Next.js)   │
│   Native)    │     │              │
│  + SQLite    │     │  Vercel or   │
│              │     │  same server │
└──────┬───────┘     └──────┬───────┘
       │                     │
       └──────────┬──────────┘
                  │
         ┌────────┴────────┐
         │  Fastify API    │
         │  (ECS Fargate)  │
         │                 │
         │  Modules:       │
         │  - auth         │
         │  - catalog      │
         │  - orders       │
         │  - sync         │
         │  - payments     │
         │  - reporting    │
         └────────┬────────┘
                  │
        ┌─────────┼─────────┐
        │         │         │
   ┌────┴───┐ ┌──┴───┐ ┌──┴──┐
   │PostgreSQL│ │Redis │ │ S3  │
   │  (RDS)  │ │      │ │     │
   └─────────┘ └──────┘ └─────┘
```

No microservices. No Kafka. No ClickHouse. One deployable API, one database, one cache. Complexity is earned, not assumed.
