# Roadmap: Dashboard de Gastos Pessoais

## Overview

This roadmap evolves a working local-first finance dashboard from "PDF importer with charts" into a proper analytical financial manager — all without adding a server, a build step, or any data leaving the browser. The sequencing is driven by one hard dependency chain: **clean data must precede analytics, and analytics must precede insights**. Phase 1 seals the foundation (no more re-import data loss, full backup capability). Phase 2 builds the analytics layer on top of clean data. Phase 3 wires real Registrato/SCR commitments into projections. Phase 4 makes categorization learnable and user-controlled. Phase 5 polishes the flow and makes the privacy promise explicit.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Safety & Import Reliability** - Imported data is trustworthy, re-imports never corrupt, and a full backup exists before analytics stores are added
- [x] **Phase 2: Analytics Foundation** - Spending by category across months is visible with clear month-over-month movement
- [ ] **Phase 3: Projection & Financing Tracking** - The projection tab reflects real Registrato/SCR commitments and installment payoff timelines
- [ ] **Phase 4: Smart Categorization** - The dashboard learns categorization preferences from user corrections and rule definitions
- [ ] **Phase 5: UX Polish & Privacy Transparency** - The import → understand → track flow is clear and the local-only privacy promise is made explicit

## Phase Details

### Phase 1: Data Safety & Import Reliability
**Goal**: Imported data is trustworthy and backed up — re-imports never delete data from other sources, and a full recovery path exists before any new analytics stores are added
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. User can reimport a Nubank or Itaú statement for a month that already contains Registrato/SCR data without losing the Registrato/SCR transactions
  2. User can download a complete JSON backup of all dashboard data (all IndexedDB stores) from within the app
  3. User can restore a previously exported JSON backup and see all transactions, subscriptions, and settings correctly populated in the dashboard
  4. Each imported file shows a quality badge (e.g., "28 transações · confiança 94%") and an expandable warnings panel listing any rows that failed to parse
**Plans**: 01-01, 01-02, 01-03
**UI hint**: yes

### Phase 2: Analytics Foundation
**Goal**: Users can see how spending is distributed across categories over multiple months and identify where it increased or decreased
**Depends on**: Phase 1
**Requirements**: ANLY-01, ANLY-02
**Success Criteria** (what must be TRUE):
  1. User can view a multi-month category trend chart showing actual spending per category for each imported month
  2. User can see which categories rose or fell compared to the prior month, with the delta amount or percentage visually highlighted
  3. User can filter the transaction list by free-text search and see results narrow in real time
**Plans**: 02-01, 02-02, 02-03
**UI hint**: yes

### Phase 3: Projection & Financing Tracking
**Goal**: The projection tab reflects real financial commitments sourced from Registrato/SCR data, and installment purchases show a clear payoff timeline
**Depends on**: Phase 2
**Requirements**: PROJ-01, PROJ-02
**Success Criteria** (what must be TRUE):
  1. User can see Registrato/SCR financing commitments automatically appear as monthly outflows in the projection tab without any manual entry
  2. User can distinguish which projected values are sourced from Registrato/SCR versus manually entered commitments (clearly labeled or visually differentiated)
  3. User can view an installment tracker showing remaining payments, expected payoff date, and a progress bar for each tracked installment
**Plans**: TBD
**UI hint**: yes

### Phase 4: Smart Categorization
**Goal**: Users can define their own categorization rules and have manual category corrections automatically remembered and applied to future matching transactions
**Depends on**: Phase 3
**Requirements**: CATG-01, CATG-02, CATG-03
**Success Criteria** (what must be TRUE):
  1. User can create a categorization rule (keyword → category), edit it, and delete it from a dedicated rules management UI
  2. User can confirm that their custom rules are applied before the app's default categorizer — a transaction matching a user rule is never overridden by the default
  3. User can manually change a transaction's category and see that correction automatically remembered and applied the next time a matching transaction is imported
**Plans**: TBD
**UI hint**: yes

### Phase 5: UX Polish & Privacy Transparency
**Goal**: The end-to-end flow (import → understand → track) is intuitive for new and returning users, and the app makes its local-only privacy guarantee explicit and verifiable
**Depends on**: Phase 4
**Requirements**: None (v1) — addresses active PROJECT.md goal: "Refinar a experiencia de uso"
**Success Criteria** (what must be TRUE):
  1. User can open a privacy audit screen that shows local storage usage, last import dates per source, and a confirmation that no outbound network calls are made with financial data
  2. A first-time user with no imported data sees helpful empty states with clear next-step instructions rather than empty charts
  3. User can export the transaction list to Excel/CSV from the transactions tab
  4. The dashboard is fully usable on a mobile-width screen without horizontal scrolling or overlapping elements
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Safety & Import Reliability | 3/3 | Completed | 2026-03-28 |
| 2. Analytics Foundation | 3/3 | Completed | 2026-03-28 |
| 3. Projection & Financing Tracking | 0/? | Next up | - |
| 4. Smart Categorization | 0/? | Not started | - |
| 5. UX Polish & Privacy Transparency | 0/? | Not started | - |
