# Phase 2: Analytics Foundation - Research

**Researched:** 2026-03-28  
**Domain:** Browser-side spending analytics over local IndexedDB data  
**Confidence:** MEDIUM

<user_constraints>

## User Constraints

_No phase-specific `CONTEXT.md` was found under `.planning/phases/02-analytics-foundation/`. The constraints below are copied from the user prompt and governing planning docs for this phase._

### Locked Decisions
- Stay on current stack (vanilla JS, IndexedDB, Chart.js, no backend, no new framework)
- Phase 1 already implemented data safety, full backup/restore, and import quality feedback
- Keep analytics additive; do not force Dexie or other stack migrations
- Be explicit about whether free-text search belongs in phase 2 or should be split out

### Claude's Discretion
- realistic data sources already available in the repo
- what pure helpers should exist for monthly category aggregation and delta computation
- likely UI surfaces for trends and deltas
- risks from categorization quality / many 'Outros' transactions
- whether transaction free-text search should be included in this phase plan or deferred/split

### Deferred Ideas (OUT OF SCOPE)
- Backend or cloud sync
- New framework adoption
- Dexie or other IndexedDB abstraction migration
- Broad search-system redesign unless explicitly split as `SRCH-01`

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANLY-01 | User can view spending trends by category across multiple months using imported financial data. | Use merged imported spend from `lancamentos` + `extrato_transacoes`, normalize month keys, exclude non-spend/derived rows, and render a multi-series Chart.js trend chart plus category totals model. |
| ANLY-02 | User can compare month-over-month category movement in a way that highlights where spending increased or decreased. | Compute deltas from the same aggregated monthly totals, generate a sorted movers table/cards with amount and percentage, and keep the logic in pure helpers with unit tests. |

</phase_requirements>

## Project Constraints (from repo instructions)

- Keep all processing and storage local-first; no backend and no external financial data transmission.
- Preserve the existing static-app model: HTML + CSS + vanilla JS + IndexedDB + Chart.js via CDN.
- Respect the current architectural contract: `index.html` tab structure, `window` API, `js/app.js` refresh cycle, and `js/db.js` as the only persistence gateway.
- Favor additive modules and helper extraction over deep rewrites.
- Escape user-facing dynamic HTML with `escapeHtml()` from `js/utils/dom.js`.
- Follow existing naming/style conventions: kebab-case files, camelCase functions, named exports, small pure helpers where possible.
- Testing is currently lightweight and built around pure helper modules plus `node:test`; no browser UI harness is present.

## Summary

The repo already has the right raw data for Phase 2, and the safest implementation is to derive analytics from data that `app.js` already loads on every refresh: card transactions from `lancamentos` and account transactions from `extrato_transacoes`. No new store is needed. The main technical challenge is not charting; it is building a correct spend model that does **not** double-count credit card bill payments from the account statement while also ignoring non-spend derived rows such as Registrato/SCR context lines.

The best fit for the UI is the **Lançamentos** tab, not **Extrato Conta**. `initLancamentos()` already merges card and account history into one unified list, which matches the requirement language of “imported financial data” better than the account-only extrato charts. Phase 2 should add a compact analytics panel above the existing filters/table in that tab: one multi-month category trend chart plus one month-over-month movers surface. Keep the existing Extrato tab account-specific and unchanged unless a later phase wants parallel account-only analytics.

Free-text search should **not** be treated as core Phase 2 scope. The planning docs map only `ANLY-01` and `ANLY-02` to Phase 2, while `SRCH-01` lives later in `REQUIREMENTS.md`. The repo also already has real-time description search in both Lançamentos and Extrato. Recommendation: keep search out of the phase-driving plan, and at most include a small regression/smoke verification that the existing search still works after the analytics panel is added.

**Primary recommendation:** Build a new pure `js/utils/analytics.js` module, feed it from `app.js` using existing imported stores, render the results in the Lançamentos tab, and defer search hardening/scope expansion to a separate `SRCH-01` plan.

## Standard Stack

### Core

| Library / Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS ES modules | Native browser runtime | App logic and DOM rendering | This is the repo’s fixed architectural base; all views and utilities already use it. |
| IndexedDB via `js/db.js` | DB schema v5 in repo | Local persistence | Existing single persistence gateway; avoids migration risk. |
| Chart.js | 4.4.1 (repo-pinned CDN) | Trend and delta visualization | Already loaded in `index.html` and used successfully for doughnut, bar, and line charts. |

### Supporting

| Library / Module | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `js/utils/formatters.js` | Repo-local | Currency formatting and month helpers | For display labels, delta formatting, and month-related utilities. |
| `js/utils/dom.js` | Repo-local | HTML escaping | For any analytics table/card HTML built via template literals. |
| `node:test` | Built-in Node | Pure helper unit tests | For Phase 2 utility tests under `tests/phase-02/`. |
| `js/views/lancamentos.js` | Repo-local | Unified imported-history surface | Best place to mount analytics that combine card and account data. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory derived analytics on refresh | New IndexedDB analytics store | Adds migration/schema complexity for data that can already be derived cheaply. |
| Lançamentos tab analytics panel | Extrato tab-only analytics | Easier visually, but incomplete because Extrato is account-only and misses card spend as first-class spending events. |
| Existing Chart.js | New chart library | Violates stack constraint and adds no clear benefit for this phase. |
| Existing realtime list search | New custom full-text system | Scope creep; `SRCH-01` is a separate requirement and current search already exists. |

**Installation:**
```bash
# No new packages recommended for Phase 2.
# Keep using the current static stack and repo-pinned Chart.js CDN include.
```

**Version verification:**  
- `Chart.js 4.4.1` is verified from `index.html` CDN include in the repo.  
- Browser-native APIs (`IndexedDB`, ES modules) are runtime features, not npm packages.  
- No new dependency/version change is recommended for this phase.

## Architecture Patterns

### Recommended Project Structure

```text
js/
├── app.js                    # load stores, compute analytics inputs, pass context to views
├── utils/
│   ├── analytics.js          # NEW: pure spend filtering, month sorting, aggregation, delta helpers
│   ├── formatters.js         # existing money/month formatting helpers
│   └── dom.js                # existing HTML escaping
└── views/
    └── lancamentos.js        # extend to render analytics panel above filters/table

tests/
└── phase-02/
    ├── analytics-aggregation.test.js
    ├── analytics-delta.test.js
    └── analytics-months.test.js
```

### Recommended Data Sources

| Source | Use for Phase 2? | Why |
|--------|------------------|-----|
| `lancamentos` store | Yes | Primary source for card spending by `fatura`, `data`, `desc`, `valor`, `cat`. |
| `extrato_transacoes` store | Yes | Primary source for account outflows by `mes`, `tipo`, `desc`, `valor`, `cat`. |
| `extrato_summary` store | Supporting only | Good for account cashflow, but insufficient for category analytics because it has no category breakdown. |
| `registrato_scr_snapshot` / `registrato_scr_resumo_mensal` | No | These are context/credit exposure, not spending transactions for ANLY-01/02. |
| `assinaturas` / `despesas_fixas` / `orcamentos` | No | Manual/planning data, not imported actual spend history. |

### Pattern 1: Derive analytics from imported transactions already loaded by `app.js`

**What:** Build analytics from the same arrays already loaded in `renderDashboard()`, without a new store.

**When to use:** Every dashboard refresh after `loadDashboardData()`.

**Example:**
```js
// Source pattern: js/app.js + js/views/lancamentos.js
import { buildSpendAnalytics } from './utils/analytics.js';

async function renderDashboard() {
  const {
    lancamentos,
    extratoTransacoes,
    assinaturas,
    despesasFixas,
    // ...
  } = await loadDashboardData();

  const analytics = buildSpendAnalytics({
    lancamentos,
    extratoTransacoes,
  });

  initLancamentos(lancamentos, extratoTransacoes, assinaturas, despesasFixas, {
    cardBillSummaries,
    registratoContextRows: lancamentosContextRows,
    analytics,
  });
}
```

### Pattern 2: Normalize month labels once, then sort everywhere with the same helper

**What:** Introduce one shared month parser/sorter for `Jan/2026`-style labels.

**When to use:** Before building chart labels, trend matrices, delta comparisons, and month dropdowns tied to analytics.

**Example:**
```js
// Source pattern: repo month labels in js/app.js, js/views/lancamentos.js, js/utils/formatters.js
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function monthLabelToKey(label) {
  const [mes, ano] = String(label ?? '').split('/');
  const idx = MESES.indexOf(mes);
  if (idx === -1 || !ano) return null;
  return Number(ano) * 100 + (idx + 1);
}

export function sortMonthLabels(labels = []) {
  return [...new Set(labels)]
    .filter(Boolean)
    .sort((a, b) => (monthLabelToKey(a) || 0) - (monthLabelToKey(b) || 0));
}
```

### Pattern 3: Use one spend-eligibility filter before aggregation

**What:** Explicitly exclude rows that should not count as category spending.

**When to use:** Before monthly category totals are computed.

**Example:**
```js
// Source pattern: js/views/lancamentos.js merged-source model
export function isSpendTransaction(item) {
  if (!item || item.contextoDerivado) return false;
  if (item.source === 'conta') {
    if (item.tipo !== 'saida') return false;
    if (item.cat === 'Fatura Crédito') return false; // avoid bill-payment double count
  }
  return Number(item.valor) > 0;
}
```

### Pattern 4: Keep trend math and delta math pure; keep DOM code thin

**What:** Helpers should return chart/table view models, not manipulate the DOM.

**When to use:** Always. This follows the Phase 1 pattern of adding testable pure utilities (`import-integrity.js`, `import-feedback.js`, `full-backup-io.js`).

**Example:**
```js
// Source pattern: js/utils/import-integrity.js pure-function style
export function computeMonthOverMonthDeltas(monthTotals, currentMonth, previousMonth) {
  return Object.keys({ ...monthTotals[previousMonth], ...monthTotals[currentMonth] })
    .map(cat => {
      const previous = Number(monthTotals[previousMonth]?.[cat] || 0);
      const current = Number(monthTotals[currentMonth]?.[cat] || 0);
      const delta = current - previous;
      const pct = previous > 0 ? (delta / previous) * 100 : null;
      return { cat, previous, current, delta, pct };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
```

### Pattern 5: Put the new UI in `tab-lancamentos`

**What:** Render the analytics panel above the existing filters and transaction table.

**When to use:** For Phase 2’s unified imported-history analytics.

**Why this surface:**  
- It already merges `lancamentos` + `extrato_transacoes`.  
- It already has search/filter mental model.  
- It avoids changing the meaning of the account-specific Extrato tab.  
- It keeps Phase 2 additive instead of reshaping multiple tabs.

### Anti-Patterns to Avoid

- **Using `extrato_summary` alone for ANLY-01:** It has no category granularity, so it cannot satisfy category trend requirements.
- **Counting account bill payments plus card purchases:** This double-counts card spending.
- **Including `contextoDerivado` Registrato rows in spending analytics:** They are informational, not spend events.
- **Sorting month labels with raw `.sort()` or ad hoc arrays in multiple files:** This creates inconsistent cross-month trend order.
- **Spreading aggregation logic inside DOM loops:** Hard to test, easy to regress.
- **Turning search into the main Phase 2 task:** It conflicts with the current requirement mapping and slows delivery of ANLY-01/02.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Analytics persistence | A new IndexedDB “analytics” cache/store | Pure derived helpers in `js/utils/analytics.js` | Avoids schema/version churn and stale cached totals. |
| Chart rendering | Custom canvas/SVG chart code | Existing Chart.js 4.4.1 | Already in use; consistent look and lower risk. |
| Month ordering | Repeated one-off sort logic in views | Shared month parser/sorter helper | Prevents subtle chart and delta ordering bugs. |
| Search normalization | Another ad hoc lowercase-only matcher | One shared text normalization helper if search is touched | Keeps accent/case behavior consistent. |
| HTML-safe rendering | Raw interpolated category/description strings | `escapeHtml()` | Prevents unsafe rendering regressions. |

**Key insight:** In this phase, the hard part is **correct spend semantics**, not storage or visualization. Custom storage/index work is more likely to introduce bugs than to solve a real Phase 2 problem.

## Common Pitfalls

### Pitfall 1: Double-counting card spending

**What goes wrong:**  
Card purchases from `lancamentos` are counted, and the account statement payment categorized as `Fatura Crédito` is also counted as spending.

**Why it happens:**  
The repo now has both card-level purchase data and account-level payment data, and `initLancamentos()` intentionally merges both sources.

**How to avoid:**  
Exclude account rows where `cat === 'Fatura Crédito'` from analytics totals.

**Warning signs:**  
- Monthly totals jump by roughly the full card bill amount
- `Fatura Crédito` appears among top spending categories
- Totals look much larger than user intuition for the month

### Pitfall 2: Month ordering bugs

**What goes wrong:**  
Charts or delta comparisons show months out of chronological order.

**Why it happens:**  
The repo currently has multiple month-sorting styles (`app.js` custom order, `lancamentos.js` plain `.sort()` on month labels).

**How to avoid:**  
Create one shared month-label parser/sorter and use it everywhere in analytics.

**Warning signs:**  
- `Nov/2026` appearing before `Jan/2026`
- Delta computed against the wrong prior month
- Chart labels not matching filter dropdown order

### Pitfall 3: Category quality skews analytics

**What goes wrong:**  
`Outros` or `Transferência` dominates the chart, making analytics look weak or misleading.

**Why it happens:**  
`categorizer.js` is keyword-based and still returns `Outros` as fallback. Phase 4, not Phase 2, is where user-controlled rule quality improves.

**How to avoid:**  
- Keep `Outros` visible instead of hiding it
- Show a small quality note when `Outros` share is high
- Sort movers by absolute delta so the distortion is obvious
- Do not pretend the analytics is more precise than the categorization quality allows

**Warning signs:**  
- `Outros` is consistently a top category
- Major month-over-month movement is concentrated in uncategorized rows
- Users cannot explain why chart totals moved

### Pitfall 4: Building analytics on the wrong surface

**What goes wrong:**  
Phase 2 ships only in Extrato and misses card spending, or spreads partial analytics across multiple tabs.

**Why it happens:**  
Extrato already has charts, so it looks tempting, but it is semantically account-focused.

**How to avoid:**  
Use Lançamentos as the primary unified-history analytics surface. Keep Extrato account-specific.

**Warning signs:**  
- Card-heavy months look artificially light
- Users ask why the trend ignores invoice purchases
- Same metric is displayed differently in two tabs

### Pitfall 5: Recomputing expensive analytics on every search keystroke

**What goes wrong:**  
Typing in the search field becomes laggy.

**Why it happens:**  
The current list search filters in memory on every `oninput`. If chart analytics are recomputed from scratch on every keypress, the work scales poorly.

**How to avoid:**  
Compute analytics once per `refreshDashboard()` and only rerender table rows on search/filter interactions unless a deliberate analytics filter is introduced.

**Warning signs:**  
- Typing latency in Lançamentos
- Repeated chart destruction/recreation during basic text search
- Noticeable jank with larger import history

### Pitfall 6: Letting search scope creep consume the phase

**What goes wrong:**  
Phase 2 turns into search redesign instead of delivering ANLY-01/02.

**Why it happens:**  
Roadmap success criteria mention search, but `REQUIREMENTS.md` maps only analytics requirements to Phase 2, and search already exists in the repo.

**How to avoid:**  
Treat search as deferred/split work (`SRCH-01`) unless the planner intentionally inserts a tiny verification-only task.

**Warning signs:**  
- New search helper/index design appears in the plan
- Analytics tasks depend on search work
- ANLY-01/02 delivery gets blocked by text-matching debates

## Code Examples

Verified repo-derived patterns for this phase:

### Unified spend aggregation

```js
// Source pattern: js/app.js data load + js/views/lancamentos.js source normalization
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function monthLabelToKey(label) {
  const [mes, ano] = String(label ?? '').split('/');
  const idx = MESES.indexOf(mes);
  if (idx === -1 || !ano) return null;
  return Number(ano) * 100 + (idx + 1);
}

function sortMonthLabels(labels = []) {
  return [...new Set(labels)]
    .filter(Boolean)
    .sort((a, b) => (monthLabelToKey(a) || 0) - (monthLabelToKey(b) || 0));
}

function normalizeAnalyticsTransactions({ lancamentos = [], extratoTransacoes = [] }) {
  const cartao = lancamentos.map(item => ({
    ...item,
    monthLabel: item.fatura,
    source: 'cartao',
  }));

  const conta = extratoTransacoes.map(item => ({
    ...item,
    monthLabel: item.mes,
    source: 'conta',
  }));

  return [...cartao, ...conta];
}

function isSpendTransaction(item) {
  if (!item || item.contextoDerivado) return false;
  if (item.source === 'conta') {
    if (item.tipo !== 'saida') return false;
    if (item.cat === 'Fatura Crédito') return false;
  }
  return Number(item.valor) > 0;
}

export function aggregateMonthlyCategoryTotals(input) {
  const items = normalizeAnalyticsTransactions(input).filter(isSpendTransaction);
  const months = sortMonthLabels(items.map(item => item.monthLabel));
  const totalsByMonth = {};

  months.forEach(month => {
    totalsByMonth[month] = {};
  });

  items.forEach(item => {
    const month = item.monthLabel;
    const cat = String(item.cat || 'Outros').trim() || 'Outros';
    totalsByMonth[month][cat] = (totalsByMonth[month][cat] || 0) + Number(item.valor || 0);
  });

  return { months, totalsByMonth };
}
```

### Month-over-month movers

```js
// Source pattern: pure-helper style from js/utils/import-integrity.js
export function computeCategoryDeltas({ totalsByMonth, months }) {
  if (!Array.isArray(months) || months.length < 2) {
    return { currentMonth: null, previousMonth: null, movers: [] };
  }

  const currentMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];

  const cats = new Set([
    ...Object.keys(totalsByMonth[currentMonth] || {}),
    ...Object.keys(totalsByMonth[previousMonth] || {}),
  ]);

  const movers = [...cats]
    .map(cat => {
      const current = Number(totalsByMonth[currentMonth]?.[cat] || 0);
      const previous = Number(totalsByMonth[previousMonth]?.[cat] || 0);
      const delta = current - previous;
      const pct = previous > 0 ? (delta / previous) * 100 : null;

      return {
        cat,
        previous,
        current,
        delta,
        pct,
        direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { currentMonth, previousMonth, movers };
}
```

### Passing analytics into the existing tab view

```js
// Source pattern: js/app.js context object passed into initLancamentos/initExtrato
const analytics = buildSpendAnalytics({
  lancamentos,
  extratoTransacoes,
});

initLancamentos(lancamentos, extratoTransacoes, assinaturas, despesasFixas, {
  cardBillSummaries,
  registratoContextRows: lancamentosContextRows,
  analytics,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Account-only charts in Extrato | Unified spend analytics over card + account imported history | Needed for Phase 2 | Meets ANLY-01 without changing stack or stores. |
| Trend chart previously removed in favor of channel/origin | Reintroduce trend as a dedicated analytics panel, not as a replacement | Changelog notes removal in Mar/2026 | Preserves useful channel view while restoring requirement coverage. |
| Ad hoc month sorting in multiple places | Shared month parsing/sorting helper | Recommended now | Prevents broken trend and delta chronology. |
| Search as a roadmap success criterion mixed into analytics | Search treated as separate/split concern (`SRCH-01`) | Recommended now | Keeps Phase 2 focused on ANLY-01/02. |

**Deprecated/outdated:**
- Using `extrato_summary` as the primary dataset for category analytics
- Treating `contextoDerivado` rows as analytical spending input
- Planning a Dexie/store migration to solve what is really a derivation problem

## Open Questions

1. **Should `Transferência` be included in spend analytics by default?**
   - What we know: The current categorizer routes many PIX/TED/DOC rows to `Transferência`, and some are true internal moves while others may still reflect outward money movement.
   - What's unclear: The repo does not yet distinguish internal transfer vs external payment reliably.
   - Recommendation: Include `Transferência` for now, but exclude only `Fatura Crédito` by rule. Surface the category honestly rather than hiding it.

2. **How should zero-baseline delta percentages be shown?**
   - What we know: If a category is new this month, amount delta is meaningful but percentage is undefined or misleading.
   - What's unclear: Exact UI wording preference.
   - Recommendation: Always show absolute delta; show percentage only when previous month > 0, otherwise label as “novo no período”.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, observed in `tests/phase-01/*.test.js`) |
| Config file | none |
| Quick run command | `node --test tests/phase-02/analytics-aggregation.test.js tests/phase-02/analytics-delta.test.js tests/phase-02/analytics-months.test.js` |
| Full suite command | `node --test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANLY-01 | Aggregates imported card + account spending by category across ordered months, excluding non-spend rows and card-bill double counts | unit + manual UI smoke | `node --test tests/phase-02/analytics-aggregation.test.js tests/phase-02/analytics-months.test.js` | ❌ Wave 0 |
| ANLY-02 | Computes month-over-month category deltas with correct increase/decrease ordering and zero-baseline handling | unit + manual UI smoke | `node --test tests/phase-02/analytics-delta.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test tests/phase-02/analytics-aggregation.test.js tests/phase-02/analytics-delta.test.js`
- **Per wave merge:** `node --test`
- **Phase gate:** Full suite green plus manual browser verification of chart labels, deltas, and no-search-regression in Lançamentos

### Wave 0 Gaps

- [ ] `tests/phase-02/analytics-aggregation.test.js` — covers ANLY-01 merged-source aggregation and `Fatura Crédito` exclusion
- [ ] `tests/phase-02/analytics-delta.test.js` — covers ANLY-02 increase/decrease/new/disappeared category behavior
- [ ] `tests/phase-02/analytics-months.test.js` — covers chronological month sorting across year boundaries
- [ ] Manual verification checklist for chart rendering in browser — no DOM harness currently detected

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — project scope, stack lock, privacy constraints
- `.planning/ROADMAP.md` — Phase 2 goal, dependency chain, success criteria
- `.planning/REQUIREMENTS.md` — authoritative requirement mapping (`ANLY-01`, `ANLY-02`, `SRCH-01`)
- `.planning/research/SUMMARY.md` — adjusted research conclusion that analytics should stay additive and search is a later candidate
- `.planning/codebase/ARCHITECTURE.md` — centralized refresh model, extension points, persistence boundary
- `.planning/codebase/CONCERNS.md` — in-memory aggregation caution, categorization trust concerns
- `copilot-instructions.md` — conventions, stack details, workflow constraints
- `js/app.js` — actual data-loading and cross-view orchestration flow
- `js/views/lancamentos.js` — merged imported-history tab, existing realtime search/filter model
- `js/views/extrato.js` — current account-only category/month charts
- `js/views/visao-geral.js` — current dashboard surfaces and KPI patterns
- `js/utils/categorizer.js` — current category quality/fallback behavior
- `js/db.js` — current schema and proof that no analytics store is required
- `index.html` — Chart.js 4.4.1 include, existing tab surfaces, current search inputs, changelog note that the trend chart was replaced
- `tests/phase-01/import-integrity.test.js` — pure-helper test style precedent
- `tests/phase-01/import-feedback.test.js` — pure view-model test style precedent
- `tests/phase-01/full-backup-io.test.js` — additive utility-module test precedent

### Secondary (MEDIUM confidence)
- None needed; recommendations are intentionally repo-constrained.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - locked by prompt and verified directly in repo files
- Architecture: HIGH - confirmed in `app.js`, `index.html`, and architecture docs
- Pitfalls: MEDIUM - most are code-observed, but analytics quality still depends on heuristic categorization fidelity

**Research date:** 2026-03-28  
**Valid until:** 2026-04-27
