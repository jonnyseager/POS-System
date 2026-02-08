# Technical Risks

Ranked by severity (impact x probability). Each risk has a mitigation strategy and an owner.

---

## CRITICAL RISKS

### 1. Offline Sync Data Loss or Corruption
**Severity: CRITICAL | Probability: MEDIUM**

**Risk:** The sync engine has a bug that causes data loss, duplication, or corruption. A vendor loses a day's transactions, or stock levels become permanently wrong.

**Impact:** Complete loss of user trust. If a POS loses transaction data, the vendor will never use it again. They'll tell every vendor they know.

**Mitigation:**
- Append-only architecture for orders/payments eliminates the most dangerous conflict scenarios
- Comprehensive sync integration test suite: simulate multi-device concurrent edits, network partitions, clock drift
- Change log is never deleted until confirmed synced and verified
- Server-side reconciliation job: compare device change count vs server received count, alert on discrepancy
- Shadow write: in Phase 1 pilot, also log all transactions to a simple text file on device as a backup
- Weekly manual reconciliation with pilot vendors in early months

**Owner:** Lead engineer (sync is too critical to delegate)

---

### 2. Stripe Terminal Reliability in the Field
**Severity: CRITICAL | Probability: MEDIUM**

**Risk:** Stripe Terminal SDK has bugs, Bluetooth disconnections, or poor UX in real-world conditions (outdoor markets, rain, cold hands, impatient customers).

**Impact:** Failed card payments mean lost sales. Vendors will blame us, not Stripe.

**Mitigation:**
- Extensive field testing before launch (test at actual markets, in actual weather)
- Graceful fallback: if card payment fails, staff can mark as "card (manual)" and handle through separate card machine
- Offline card payment queuing (Stripe Terminal supports this for known amounts)
- Clear UX states: connecting, ready, processing, success, failure — with specific error messages
- Maintain relationship with Stripe developer support for escalation path

**Owner:** Mobile engineer

---

### 3. React Native Performance on Low-End Tablets
**Severity: HIGH | Probability: MEDIUM**

**Risk:** Vendors use cheap Android tablets (£100-£200). React Native's JavaScript bridge may cause lag in the order flow. SQLite queries may stutter the UI during sync.

**Impact:** Slow POS = slow service = lost revenue. Vendors won't tolerate a laggy checkout.

**Mitigation:**
- Use `op-sqlite` with JSI (no bridge overhead for DB operations)
- Run sync operations on a background thread (React Native's InteractionManager or worklet)
- Profile on the cheapest target device from day one (Samsung Galaxy Tab A series)
- Limit re-renders: use Zustand for state management with selector-based subscriptions
- Virtualized lists for large menus
- Set minimum device specification and test against it
- Escape hatch: if React Native is untenable on low-end Android, rewrite POS in Kotlin (painful but possible — isolated from server/web)

**Owner:** Mobile engineer

---

## HIGH RISKS

### 4. Multi-Tenant Data Isolation Breach
**Severity: CRITICAL | Probability: LOW**

**Risk:** A bug in the API allows Tenant A to see Tenant B's data. A missing `tenant_id` filter in one query exposes another business's financial data.

**Impact:** GDPR breach, total loss of trust, potential regulatory action.

**Mitigation:**
- PostgreSQL Row-Level Security on every tenant-scoped table (database-level enforcement, not just application-level)
- `app.current_tenant_id` set on every database connection, verified against JWT claims
- Integration tests: create two tenants, verify zero cross-contamination
- Static analysis rule: flag any raw SQL query that doesn't reference `tenant_id`
- Penetration test before public launch

**Owner:** Lead engineer

---

### 5. UK VAT Calculation Errors
**Severity: HIGH | Probability: MEDIUM**

**Risk:** Incorrect VAT calculation or categorisation leads to vendors under/over-reporting VAT, resulting in HMRC penalties or refund liability.

**Impact:** Legal liability for vendors, loss of trust, potential regulatory scrutiny of our platform.

**Mitigation:**
- UK VAT rules are complex: hot food is standard-rated (20%), cold takeaway food is zero-rated, but hot takeaway food above a threshold changes. We must model these rules correctly.
- Comprehensive test suite with real HMRC edge cases
- Consult with a UK tax accountant during Phase 1 to validate our logic
- Clear documentation to vendors: "This is a tool, not tax advice. Consult your accountant."
- VAT calculation is a pure function — heavily unit-tested, deterministic
- Store tax rate at time of transaction (denormalised) so recalculation is possible

**Owner:** Lead engineer + external tax advisor

---

### 6. Sync Engine Complexity Exceeds Team Capacity
**Severity: HIGH | Probability: HIGH**

**Risk:** Building a production-quality offline sync engine is a massive undertaking. Bugs will be subtle (race conditions, ordering violations, idempotency failures). A team of 1-2 engineers may not have the bandwidth to build and maintain it.

**Impact:** Delayed launch. Or worse: launched with bugs that corrupt data.

**Mitigation:**
- Start with the simplest sync model that works: orders are append-only (no conflicts), menu items use server-authoritative sync (server always wins on pull)
- Only introduce column-level LWW when we have multi-device menu editing (which may not be in Phase 1)
- Invest heavily in automated sync testing: property-based tests, fuzzing, chaos engineering
- Consider an external review of the sync protocol before Phase 1 launch
- Keep the sync protocol simple enough to explain in a 1-page document

**Owner:** Lead engineer

---

### 7. Payment Reconciliation Errors
**Severity: HIGH | Probability: MEDIUM**

**Risk:** The money Stripe settles doesn't match our order records. Off-by-one-penny errors, failed-but-charged payments, offline payments that never settle.

**Impact:** Vendors lose trust in financial accuracy. Accounting headaches.

**Mitigation:**
- Use Stripe webhooks as source of truth for payment status
- Nightly reconciliation job: compare our `payments` table against Stripe's charge records via API
- Alert on any discrepancy > £1
- Manual reconciliation dashboard in back office
- Never record a card payment as "completed" until Stripe confirms it

**Owner:** Backend engineer

---

## MEDIUM RISKS

### 8. POS App Store Rejection
**Severity: MEDIUM | Probability: LOW-MEDIUM**

**Risk:** Apple or Google rejects the POS app due to policy violations (payment processing rules, missing privacy disclosures, etc.)

**Mitigation:**
- Review App Store guidelines for POS/payment apps before submission
- Apple may require in-app purchase for subscription (exemption possible for B2B apps distributed via business channels)
- Consider Apple Business Manager for enterprise distribution to bypass App Store review
- Android: distribute via Google Play or direct APK (vendors can sideload)

**Owner:** Mobile engineer

### 9. Scaling Beyond Single PostgreSQL Instance
**Severity: MEDIUM | Probability: LOW (Phase 1)**

**Risk:** At high scale (1000+ tenants, millions of orders), a single PostgreSQL instance becomes a bottleneck.

**Mitigation:**
- Not a Phase 1 problem. PostgreSQL can handle millions of rows trivially.
- Connection pooling with PgBouncer from day one
- Read replicas for reporting queries (Phase 2)
- Tenant-based sharding if needed (Phase 3+) — our schema is already shard-friendly (every row has `tenant_id`)
- ClickHouse offloads analytical queries in Phase 2

**Owner:** Infrastructure

### 10. Team Bus Factor
**Severity: HIGH | Probability: MEDIUM**

**Risk:** With a 1-2 person founding engineering team, losing one person halts all development. Critical knowledge about sync, payments, and architecture lives in one head.

**Mitigation:**
- Architecture documents (like this one) capture decisions and rationale
- Code is well-tested (if a new engineer breaks something, tests catch it)
- Avoid clever code — prefer boring, readable, well-structured code
- Hire engineer #2 before Phase 1 launch, with 4-week overlap
- Use TypeScript across the full stack so any engineer can work on any layer

**Owner:** CTO / Co-founder

### 11. Ingredient Cost Data Accuracy
**Severity: MEDIUM | Probability: HIGH**

**Risk:** Vendors won't maintain accurate ingredient costs. They buy from cash-and-carry, prices change weekly, they don't weigh ingredients precisely. The margin calculations are only as good as the input data.

**Impact:** The "real-time margin" value proposition becomes unreliable.

**Mitigation:**
- Make cost entry as simple as possible: "I bought 5kg of chicken for £25" → system calculates cost per gram
- Provide default costs for common UK food service ingredients (seeded from wholesale price data)
- Show a "cost confidence" indicator — green if costs updated in last 30 days, amber if 30-90 days, red if >90 days
- Phase 3: integrate with supplier ordering systems to auto-update costs
- Phase 3: receipt scanning via AI to extract ingredient costs

**Owner:** Product + Engineering

---

## Risk Register Summary

| # | Risk | Severity | Probability | Phase | Mitigation Status |
|---|------|----------|-------------|-------|-------------------|
| 1 | Sync data loss | CRITICAL | MEDIUM | 1 | Active — core architecture |
| 2 | Stripe Terminal reliability | CRITICAL | MEDIUM | 1 | Active — field testing plan |
| 3 | RN performance on low-end devices | HIGH | MEDIUM | 1 | Active — device profiling |
| 4 | Multi-tenant data breach | CRITICAL | LOW | 1 | Active — RLS + testing |
| 5 | VAT calculation errors | HIGH | MEDIUM | 1 | Planned — tax advisor |
| 6 | Sync complexity vs team size | HIGH | HIGH | 1 | Active — simplify scope |
| 7 | Payment reconciliation errors | HIGH | MEDIUM | 1 | Planned — reconciliation job |
| 8 | App Store rejection | MEDIUM | LOW | 1 | Planned — policy review |
| 9 | PostgreSQL scaling | MEDIUM | LOW | 2+ | Deferred |
| 10 | Team bus factor | HIGH | MEDIUM | 1 | Active — documentation |
| 11 | Ingredient cost accuracy | MEDIUM | HIGH | 1 | Active — UX simplification |
