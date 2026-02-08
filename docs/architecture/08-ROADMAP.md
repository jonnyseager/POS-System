# 12-Month Build Roadmap

## Assumptions

- **Team**: 1 founding engineer (you/CTO), expanding to 2-3 by month 4
- **Funding**: Bootstrapped or pre-seed. Budget for AWS, Stripe, and one contractor.
- **Target**: 10 paying pilot vendors by end of month 6, 50+ by month 12
- **Methodology**: 2-week sprints, weekly vendor check-ins during pilot

---

## Phase 1: Foundation + MVP (Months 1-6)

### Month 1: Scaffolding & Data Layer
**Goal: Build the skeleton. Every layer exists, nothing works end-to-end yet.**

- [ ] Project setup: monorepo (Turborepo), TypeScript config, ESLint, Prettier
- [ ] PostgreSQL schema: tenants, users, locations, devices, categories, menu_items, modifiers
- [ ] Drizzle ORM setup with migrations
- [ ] Fastify API scaffold with modular plugin architecture
- [ ] Auth module: registration, login, JWT, refresh tokens, device auth
- [ ] Catalog module: CRUD for categories, menu items, modifier groups
- [ ] React Native (Expo) project scaffold
- [ ] SQLite local database setup with schema mirroring cloud
- [ ] Terraform: RDS, ElastiCache, ECS, S3, VPC
- [ ] CI/CD pipeline: lint, test, build on every PR

**Deliverable:** API serves menu data. React Native app displays a menu grid from local SQLite. Nothing syncs yet.

### Month 2: Orders & Payments
**Goal: Process a sale. The core transaction loop works.**

- [ ] Orders module: create order, add items, add modifiers, apply discount, complete order
- [ ] Order number generation (device-prefixed sequential)
- [ ] Cash payment flow: enter amount, calculate change
- [ ] Stripe Connect account onboarding flow
- [ ] Stripe Terminal integration: pair reader, process payment
- [ ] Payment recording and status tracking
- [ ] POS order flow UI: menu → cart → payment → confirmation
- [ ] Shift management: open, close, cash count
- [ ] Basic order receipt (on-screen)

**Deliverable:** A vendor can process a sale (cash or card) on the tablet. No offline yet. No sync yet.

### Month 3: Offline Engine & Sync
**Goal: The POS works without internet. Data syncs when online.**

- [ ] Hybrid Logical Clock implementation
- [ ] SQLite change tracking layer
- [ ] Sync push endpoint (device → cloud)
- [ ] Sync pull endpoint (cloud → device)
- [ ] Conflict resolution: append-only for orders, LWW for menu items
- [ ] Background sync worker in React Native
- [ ] Offline order creation and completion
- [ ] Offline cash payment processing
- [ ] Stripe Terminal offline payment handling
- [ ] Sync status indicator in POS UI
- [ ] Device registration and authentication flow
- [ ] Sync integration test suite (multi-device simulation)

**Deliverable:** Two tablets can take orders offline simultaneously. When they reconnect, all data syncs correctly. This is the hardest month.

### Month 4: Back Office & Costing
**Goal: Vendor can manage their business from a web dashboard.**

- [ ] Next.js back office scaffold
- [ ] Dashboard: today's sales, revenue, order count, average order value
- [ ] Menu management UI (categories, items, modifiers)
- [ ] Ingredient management (CRUD with unit costs)
- [ ] Recipe builder (link ingredients to menu items)
- [ ] Real-time margin calculator per item
- [ ] Staff management (add, set PIN, assign role)
- [ ] Location and device management
- [ ] Shift reports: revenue, cash variance, items sold
- [ ] Basic sales reports: by day, by item, by category
- [ ] Hire engineer #2

**Deliverable:** Vendor can see their margin per item. They can manage their menu from a laptop. This is when the product starts feeling real.

### Month 5: VAT, Polish & Internal Testing
**Goal: The system is tax-compliant and reliable enough for real vendors.**

- [ ] UK VAT rate configuration (standard, reduced, zero-rated)
- [ ] VAT calculation per order item
- [ ] VAT summary report (by rate, by period)
- [ ] Tax breakdown on receipts and in reports
- [ ] Error handling and edge cases across all flows
- [ ] Loading states, empty states, error states in UI
- [ ] POS performance optimisation on target hardware (Samsung Galaxy Tab A)
- [ ] Sync reliability hardening: retry logic, idempotency verification
- [ ] Sentry error tracking integration
- [ ] Internal dog-fooding: team uses the system at a real food event
- [ ] Security review: auth, RLS, input validation, API rate limiting

**Deliverable:** System is ready for external pilot. Tax is handled. Errors are caught. Performance is acceptable.

### Month 6: Pilot Launch
**Goal: 10 real food vendors using the system for real trading.**

- [ ] Vendor onboarding flow (signup → Stripe Connect → first menu item → first sale)
- [ ] Onboarding documentation / getting-started guide
- [ ] App Store / TestFlight distribution (iOS) + APK distribution (Android)
- [ ] 1:1 onboarding with first 5 vendors (in person at their pitch)
- [ ] Daily monitoring of sync health, error rates, payment reconciliation
- [ ] Weekly feedback calls with pilot vendors
- [ ] Bug fix sprints based on real usage
- [ ] Measure Phase 1 success criteria (see MVP scope document)

**Deliverable:** 10 vendors actively trading. We know what works and what doesn't.

---

## Phase 2: Growth Features (Months 7-9)

### Month 7: Inventory & Stock Tracking
- [ ] Stock levels per ingredient per location
- [ ] Automatic stock decrement on order completion (via recipe)
- [ ] Stock movement recording (received, adjusted, transferred)
- [ ] Waste recording with reason codes
- [ ] Low stock alerts
- [ ] Stock take / count functionality
- [ ] Stock reports: consumption, waste %, stock value

### Month 8: Multi-Location & Reporting
- [ ] Multi-location data separation and filtering
- [ ] Cross-location reporting and comparison
- [ ] ClickHouse setup for analytical queries
- [ ] Kafka (or Redpanda) for event streaming to ClickHouse
- [ ] Advanced reports: margin trends, waste trends, staff performance
- [ ] Report export (CSV, PDF)
- [ ] Owner mobile app (React Native, code-shared with POS)

### Month 9: Integrations & Scale
- [ ] Receipt printer support (Bluetooth ESC/POS printers)
- [ ] Supplier management (CRUD, link to ingredients)
- [ ] Purchase order creation
- [ ] Automated reorder suggestions based on stock levels
- [ ] Improved onboarding: self-serve signup, in-app tutorials
- [ ] Performance hardening for 50+ concurrent tenants
- [ ] Monitoring and alerting: PagerDuty integration

---

## Phase 3: Intelligence Layer (Months 10-12)

### Month 10: AI Foundations
- [ ] Data pipeline: transaction + weather + event data aggregation
- [ ] Demand forecasting model v1 (per-item, per-location, per-day)
- [ ] Prep quantity recommendations ("Prepare 80 burgers for tomorrow based on weather and historical data")
- [ ] Anomaly detection: unusual waste, revenue drops, cost spikes

### Month 11: Embedded Finance Foundations
- [ ] Cash flow forecasting from transaction data
- [ ] Automated VAT return generation (MTD API integration)
- [ ] Revenue-based lending assessment model (internal, not yet offered to vendors)
- [ ] Stripe Financial Connections integration for bank account linking

### Month 12: Platform & Scale Prep
- [ ] Public API v1 (read-only: sales, menu, reports)
- [ ] Webhook system for third-party integrations
- [ ] Multi-currency foundations (for expansion beyond UK)
- [ ] Tenant sharding architecture planning
- [ ] Series A preparation: metrics dashboard, unit economics, growth model
- [ ] Hire engineers #3 and #4

---

## Milestone Summary

```
Month 1  ████░░░░░░░░  Scaffolding & data layer
Month 2  ████████░░░░  Order & payment processing
Month 3  ████████████  Offline sync engine (hardest month)
Month 4  ████████░░░░  Back office & costing
Month 5  ██████░░░░░░  VAT, polish, internal testing
Month 6  ████░░░░░░░░  PILOT LAUNCH — 10 vendors
Month 7  ████████░░░░  Inventory & stock tracking
Month 8  ████████░░░░  Multi-location & analytics
Month 9  ████████░░░░  Integrations & scale
Month 10 ████████░░░░  AI forecasting v1
Month 11 ██████░░░░░░  Embedded finance foundations
Month 12 ████████░░░░  Platform API & Series A prep
```

## Key Hiring Timeline

| Month | Hire | Role |
|-------|------|------|
| 4 | Engineer #2 | Full-stack, strong on React Native |
| 9 | Engineer #3 | Backend, strong on data/infrastructure |
| 12 | Engineer #4 | ML/data engineer for AI layer |

---

## What This Roadmap Does NOT Include

- Marketing, sales, or growth strategy
- Customer support tooling
- Legal and compliance (company formation, FCA considerations, terms of service)
- Hardware sourcing and logistics (tablets, card readers)
- Pricing strategy validation
- Competitor analysis and positioning

These are equally important but outside the scope of this technical architecture document. They need dedicated workstreams.
