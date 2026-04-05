# Phase 1: KPI, Visual & Dashboard Enrichment - Research

**Researched:** 2026-04-05
**Domain:** Financial KPI computation, SVG/Chart.js visualization, vanilla JS dashboard enrichment
**Confidence:** HIGH

## Summary

This phase enriches a vanilla JS + IndexedDB personal finance dashboard with new KPI cards, charts, a purchase simulator, and visual polish (alerts, progress bars, modals). The existing codebase already has a well-structured financial analysis model (`financial-analysis.js`, 370 lines) that computes budget status, debt exposure, spending analytics, and cashflow -- providing a solid foundation to extend with the new KPIs.

Chart.js v4.4.1 is already vendored and used extensively (doughnut, bar, line charts in `visao-geral.js`, `projecao.js`, `extrato.js`, `registrato.js`). New chart types (additional line charts for SCR evolution and invoice evolution, donut for expense composition) fit naturally into the existing Chart.js infrastructure. No new charting library is needed.

The IndexedDB schema (16 stores, DB version 8) already contains all the raw data needed for every proposed KPI: `extrato_summary` for cashflow/balance history, `lancamentos` + `extrato_transacoes` for spending/category analytics, `registrato_scr_snapshot` + `registrato_scr_resumo_mensal` for SCR/debt data, `despesas_fixas` for installment tracking, and `orcamentos` for budget comparisons. No schema changes are required.

**Primary recommendation:** Extend `buildFinancialAnalysisModel()` with new KPI computation functions, add chart rendering functions using the existing Chart.js vendor bundle, build the simulator as a self-contained UI component, and enrich the HTML/CSS with new card containers, alert styles, and a detail modal.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KPI-01 | Enriched KPI cards: margem livre, saude financeira, parcelas ativas com alivio futuro, divida consolidada, comprometimento da renda | `financial-analysis.js` already computes `freeBudgetEstimate`, `commitmentRatio`, `pressureRatio`, `budgetStatus`; needs extension for health score, installment relief, consolidated debt card |
| KPI-02 | Market-standard KPIs: net worth, savings rate, debt-to-income, emergency fund coverage, spending velocity, cash runway | New computations derivable from existing `cashflow`, `budget`, `debt`, `spending` objects; all source data available in IndexedDB |
| KPI-03 | Next-month projection card in overview | `projection-auto.js` already builds automatic projection inputs; `buildProjectionSchedule()` generates future months; needs a highlighted card in visao-geral |
| VIS-01 | Enriched card visuals: icons, progress bars, MoM variations, contextual inline alerts | CSS `.progress-wrap`/`.progress-bar` and `.badge-*` classes exist; needs new alert component styles and icon integration |
| VIS-02 | Line charts (invoice/SCR evolution), donut charts (expense composition), annual projection table | Chart.js v4.4.1 already vendored; `visao-geral.js` already renders doughnut and line charts; needs new chart instances and an HTML table |
| SIM-01 | Installment purchase simulator with value, installments, interest rate, impact on free balance | `buildBudget()` computes `freeBudgetEstimate`; simulator needs UI form + real-time impact calculation referencing budget model |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Chart.js | 4.4.1 | All charts (line, doughnut, bar) | Already vendored at `vendor/chartjs/chart.umd.js`, used across 5+ views [VERIFIED: vendor/chartjs/chart.umd.js header] |
| Vanilla JS (ES modules) | ES2022 | All application logic | Project convention -- no framework, no build step [VERIFIED: codebase inspection] |
| IndexedDB | Browser native | All data persistence | 16 stores already defined in `db.js` [VERIFIED: js/db.js] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Intl.NumberFormat | Browser native | Currency formatting (BRL) | Already used via `fmtCurrency()` in financial-analysis.js [VERIFIED: financial-analysis.js:13-17] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Chart.js for all charts | Pure SVG/CSS charts | Chart.js already vendored and used; adding SVG would create inconsistency. Use Chart.js for everything |
| Custom modal | Dialog element (native) | `<dialog>` with `showModal()` is well-supported and already styled in CSS (`.app-modal`, `.modal-card`) [VERIFIED: css/styles.css lines 1281+] |

## Architecture Patterns

### Recommended Project Structure
```
js/
  utils/
    financial-analysis.js     # EXTEND: add new KPI computations (health score, market KPIs)
    kpi-market.js             # NEW: market-standard KPI functions (net worth, savings rate, etc.)
    purchase-simulator.js     # NEW: installment simulator logic (pure computation)
    alert-engine.js           # NEW: contextual alert generation from KPI thresholds
  views/
    visao-geral.js            # EXTEND: new KPI card section, next-month projection card, alerts
    analise-financeira.js     # EXTEND: new charts, annual projection table
css/
  styles.css                  # EXTEND: alert styles, enriched card styles, modal enhancements
index.html                    # EXTEND: new card containers, chart canvases, modal markup
```

### Pattern 1: KPI Computation as Pure Functions
**What:** All KPI calculations are pure functions that take data objects and return result objects. No DOM access, no side effects.
**When to use:** Every new KPI (health score, net worth, savings rate, etc.)
**Example:**
```javascript
// Source: follows existing pattern in financial-analysis.js
function buildHealthScore({ budget, debt, cashflow }) {
  // Returns { score: 0-100, label: string, emoji: string, tone: string }
  // Pure computation, testable without DOM
}
```

### Pattern 2: View Functions Consume Model Objects
**What:** View rendering functions receive pre-computed model objects from `app.js` orchestration. They never query IndexedDB directly.
**When to use:** All new visual components (charts, cards, simulator UI)
**Example:**
```javascript
// Source: follows existing pattern in visao-geral.js:buildVisaoGeral()
// app.js loads data -> computes models -> passes to view functions
export function buildVisaoGeral(assinaturas, despesasFixas, extratoSummary,
  transacoes, lancamentos, registratoInsights, cardBillSummaries, options) {
  // options.financialAnalysis contains the pre-computed model
  renderFinancialOverviewPanel(options?.financialAnalysis || null);
}
```

### Pattern 3: Inline HTML Rendering with escapeHtml
**What:** All dynamic content rendered via template literals with `escapeHtml()` from `dom.js`. No innerHTML without escaping.
**When to use:** Every new card, alert, table row
**Example:**
```javascript
// Source: existing pattern throughout views
import { escapeHtml } from '../utils/dom.js';
container.innerHTML = `
  <div class="card" style="--accent:${color}">
    <div class="label">${escapeHtml(label)}</div>
    <div class="value">${escapeHtml(fmt(value))}</div>
  </div>`;
```

### Pattern 4: Chart.js Instance Management
**What:** Each Chart.js instance stored in a module-level variable, destroyed before re-creation to prevent memory leaks.
**When to use:** Every new chart (SCR evolution, invoice evolution, expense donut)
**Example:**
```javascript
// Source: existing pattern in visao-geral.js
let _chartScrEvolution = null;

function buildScrEvolutionChart(data) {
  if (_chartScrEvolution) { _chartScrEvolution.destroy(); _chartScrEvolution = null; }
  const ctx = document.getElementById('chartScrEvolution');
  if (!ctx) return;
  _chartScrEvolution = new Chart(ctx, { type: 'line', data: {...}, options: {...} });
}
```

### Anti-Patterns to Avoid
- **Direct IndexedDB queries in view functions:** Views receive data through `app.js` orchestration, never call `getAll()` directly
- **Creating Chart instances without destroying previous:** Always check and destroy before re-creating
- **Hardcoded currency formatting:** Always use `fmt()` from `formatters.js`
- **innerHTML without escapeHtml:** XSS risk; always escape user-derived content
- **Adding new stores for derived KPI data:** KPIs are computed on the fly from existing stores

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Charts (line, donut, bar) | Custom SVG chart library | Chart.js v4.4.1 (already vendored) | Responsive, accessible, tooltip support, consistent with existing charts |
| Currency formatting | Custom format function | `Intl.NumberFormat` via existing `fmt()` / `fmtCurrency()` | Handles BRL locale, edge cases, negative values |
| Modal dialogs | Custom overlay div | Native `<dialog>` element with `.app-modal` CSS | Already styled in project CSS, handles backdrop, focus trap, keyboard |
| Interest rate calculations | Simple multiplication | Compound interest formula: `PMT = PV * [r(1+r)^n / ((1+r)^n - 1)]` | Simple interest gives wrong results for installment simulations |
| Month arithmetic | String manipulation | Existing `shiftMonthLabel()`, `diffMonthLabels()` from projection-model.js | Handles year rollover, consistent with existing code |

**Key insight:** The project already has robust utility functions for money formatting, month arithmetic, and chart rendering patterns. Reuse them rather than creating parallel implementations.

## Common Pitfalls

### Pitfall 1: Double-counting card bill payments in spending analytics
**What goes wrong:** Including `Fatura Credito` transactions from bank account alongside individual card purchases creates double-counted totals.
**Why it happens:** Bank statement shows the card bill payment as a single debit; card statement shows individual purchases.
**How to avoid:** The existing `isSpendTransaction()` in `analytics.js` already filters out `cat === 'Fatura Credito'` for account transactions. New KPIs must use the same filtering logic.
**Warning signs:** KPI totals significantly higher than expected; spending velocity seems inflated.

### Pitfall 2: Division by zero in ratio KPIs
**What goes wrong:** Debt-to-income, savings rate, emergency fund coverage all divide by income or expenses. Zero income = NaN/Infinity.
**Why it happens:** New users with no imported data, or users who only imported card statements without bank account.
**How to avoid:** Always guard with `if (total <= 0) return 0` pattern, matching existing `percentage()` function in financial-analysis.js.
**Warning signs:** KPI cards showing NaN%, Infinity, or blank values.

### Pitfall 3: Chart.js canvas reuse without destroy
**What goes wrong:** Creating a new Chart on an existing canvas without destroying the previous instance causes memory leaks and rendering glitches.
**Why it happens:** `refreshDashboard()` is called on every data change; charts get re-rendered frequently.
**How to avoid:** Follow the existing pattern: store chart instance in module variable, check and `.destroy()` before creating new one.
**Warning signs:** Charts flickering, tooltips appearing in wrong positions, increasing memory usage.

### Pitfall 4: Market KPIs requiring data not yet available
**What goes wrong:** Net worth requires user to input assets (savings, investments); emergency fund coverage needs explicit emergency fund balance. This data may not exist in any store.
**Why it happens:** The dashboard imports bank/card PDFs; it doesn't have investment account data.
**How to avoid:** Design these KPIs with graceful degradation: show what can be computed (e.g., net worth = bank balance - total debt), and label as "partial" when asset data is incomplete. Use `cashflow.currentBalance` as the available liquid asset.
**Warning signs:** Net worth showing large negative values because only debt side is populated.

### Pitfall 5: Simulator state not persisting across tab switches
**What goes wrong:** User fills in simulator form, switches tabs, comes back and values are reset.
**Why it happens:** View functions re-render from scratch on tab activation.
**How to avoid:** The projection view already handles this with `projecao_parametros` store and `_persistedSimulatorConfig`. The purchase simulator should follow the same pattern -- persist to a store or to `projecao_parametros` with a distinct key.
**Warning signs:** User-entered simulation values lost on navigation.

### Pitfall 6: Compound interest formula misapplication
**What goes wrong:** Simulator shows wrong monthly installment amounts when interest is involved.
**Why it happens:** Using simple division (total / n) instead of PMT formula for interest-bearing installments.
**How to avoid:** Use the standard PMT formula: `PMT = PV * [r(1+r)^n / ((1+r)^n - 1)]` where r is monthly rate, n is number of installments.
**Warning signs:** Simulated installment values don't match what banks would charge.

## Code Examples

### KPI Health Score Computation
```javascript
// Pattern following existing buildBudgetStatus()
function buildHealthScore({ budget, debt, cashflow }) {
  let score = 50; // baseline

  // Budget pressure (0-25 points)
  if (budget.pressureRatio < 0.7) score += 25;
  else if (budget.pressureRatio < 0.85) score += 15;
  else if (budget.pressureRatio < 1.0) score += 5;

  // Debt status (0-25 points)
  if (debt.overdue <= 0 && debt.totalExposure <= 0) score += 25;
  else if (debt.overdue <= 0) score += 15;
  else score -= 10;

  // Cashflow trend (0-15 points)
  if (cashflow.averageNet > 0) score += 15;
  else if (cashflow.averageNet > -500) score += 5;

  // Free budget (0-10 points)
  if (budget.freeBudgetEstimate > budget.estimatedIncome * 0.2) score += 10;
  else if (budget.freeBudgetEstimate > 0) score += 5;

  score = Math.max(0, Math.min(100, score));

  const label = score >= 70 ? 'Saudavel' : score >= 40 ? 'Atencao' : 'Critico';
  const emoji = score >= 70 ? '💚' : score >= 40 ? '⚠️' : '🔴';
  const tone = score >= 70 ? 'healthy' : score >= 40 ? 'attention' : 'critical';

  return { score, label, emoji, tone };
}
```

### Market KPIs (derived from existing data)
```javascript
// All pure functions, no DOM, testable
function computeMarketKpis({ budget, debt, cashflow, spending }) {
  const income = budget.estimatedIncome || 0;
  const currentBalance = cashflow.currentBalance || 0;
  const totalDebt = debt.totalExposure || 0;
  const totalSpend = spending.latestMonthSpend || 0;
  const daysInMonth = 30;

  return {
    netWorth: roundMoney(currentBalance - totalDebt), // partial: bank balance - SCR debt
    savingsRate: income > 0 ? percentage(income - budget.totalPlannedSpend, income) : 0,
    debtToIncome: income > 0 ? percentage(totalDebt, income * 12) : 0,
    emergencyFundCoverage: budget.totalPlannedSpend > 0
      ? roundMoney(currentBalance / budget.totalPlannedSpend) : 0, // months of expenses
    spendingVelocity: totalSpend > 0
      ? roundMoney(totalSpend / daysInMonth) : 0, // R$/day
    cashRunway: budget.totalPlannedSpend > 0
      ? roundMoney(currentBalance / budget.totalPlannedSpend) : 0, // months
  };
}
```

### Installment Purchase Simulator
```javascript
// Pure computation -- UI calls this and re-renders impact
function simulateInstallmentPurchase({ totalValue, installments, monthlyInterestRate = 0 }) {
  if (totalValue <= 0 || installments <= 0) return null;

  let monthlyPayment;
  if (monthlyInterestRate <= 0) {
    monthlyPayment = roundMoney(totalValue / installments);
  } else {
    // PMT formula for compound interest
    const r = monthlyInterestRate / 100;
    const factor = Math.pow(1 + r, installments);
    monthlyPayment = roundMoney(totalValue * (r * factor) / (factor - 1));
  }

  const totalPaid = roundMoney(monthlyPayment * installments);
  const totalInterest = roundMoney(totalPaid - totalValue);

  return {
    monthlyPayment,
    totalPaid,
    totalInterest,
    installments,
    effectiveRate: totalValue > 0 ? percentage(totalInterest, totalValue) : 0,
  };
}
```

### Contextual Alert Generation
```javascript
// Returns array of { type: 'danger'|'warning'|'info'|'success', message, icon }
function generateContextualAlerts({ budget, debt, spending, cashflow, healthScore }) {
  const alerts = [];

  if (budget.pressureRatio >= 1) {
    alerts.push({ type: 'danger', message: 'Despesas excedem a renda estimada', icon: '🚨' });
  }
  if (debt.overdue > 0) {
    alerts.push({ type: 'danger', message: `Divida vencida de ${fmtCurrency(debt.overdue)}`, icon: '⚠️' });
  }
  if (budget.freeBudgetEstimate > 0 && budget.freeBudgetEstimate < budget.estimatedIncome * 0.1) {
    alerts.push({ type: 'warning', message: 'Margem livre abaixo de 10% da renda', icon: '📉' });
  }
  if (cashflow.averageNet > 0) {
    alerts.push({ type: 'success', message: 'Fluxo de caixa medio positivo', icon: '✅' });
  }

  return alerts.slice(0, 4);
}
```

### Enriched Card with Progress Bar and MoM Variation
```html
<!-- CSS pattern using existing .card and .progress-wrap classes -->
<div class="card" style="--accent:#68d391">
  <div class="label">
    <span class="card-icon">💰</span> Comprometimento da Renda
  </div>
  <div class="value" style="color:#68d391">72%</div>
  <div class="progress-wrap" style="margin:8px 0 4px">
    <div class="progress-bar" style="width:72%;--color:#68d391"></div>
  </div>
  <div class="sub">
    <span class="badge badge-green" style="font-size:0.7rem">▼ 3% vs mes anterior</span>
  </div>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static HTML dashboard | Dynamic vanilla JS + IndexedDB | v1.0 (2026-03) | All KPIs now computed from real imported data |
| No charting | Chart.js v4.4.1 vendored | v1.0 (2026-03) | Doughnut, bar, line charts already available |
| Manual budget tracking | `buildBudget()` auto-estimation | v1.0 Phase 3 | Income, commitment ratio auto-computed from history |

**Deprecated/outdated:**
- Static HTML dashboard referenced as "Dashboard_Mikael.html" is the design reference, not an active component

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Health score algorithm (scoring weights for budget pressure, debt, cashflow, free budget) is appropriate | Code Examples | Score could feel arbitrary; may need user feedback to tune thresholds |
| A2 | Net worth = bank balance - SCR debt is an acceptable partial calculation | Common Pitfalls | Users with significant assets outside the dashboard may see misleadingly negative net worth |
| A3 | Emergency fund coverage = current balance / monthly planned spend is the right formula | Code Examples | Some finance apps use 3-6 month expenses as the denominator reference |
| A4 | The purchase simulator should persist state to `projecao_parametros` store | Common Pitfalls | Could warrant its own store if simulator state becomes complex |
| A5 | All new charts should use Chart.js (not pure SVG/CSS) | Standard Stack | Consistent with existing codebase; SVG could be lighter for very simple visualizations |
| A6 | Fixed expenses priority field (Essencial/Importante/Opcional) requires a schema migration to add a `prioridade` field to despesas_fixas records | Architecture | Could use a separate mapping instead if schema migration is undesirable |

## Open Questions

1. **Fixed expense priority classification**
   - What we know: The spreadsheet has priorities (Essencial/Importante/Opcional) for fixed expenses
   - What's unclear: Should priority be a new field on `despesas_fixas` records (requires existing data migration), or a separate mapping?
   - Recommendation: Add `prioridade` field with default `'Essencial'` for existing records; no store schema change needed since IndexedDB is schemaless for record properties

2. **Net worth scope**
   - What we know: Dashboard only has bank balance and SCR debt data
   - What's unclear: Should we show a partial net worth or prompt user for additional asset inputs?
   - Recommendation: Show partial net worth with clear labeling ("Patrimonio liquido visivel") and a note that it excludes investments/other assets

3. **Annual projection table format**
   - What we know: Spreadsheet has a month-by-month table; `buildProjectionSchedule()` already generates future month data
   - What's unclear: How many columns (income, fixed, variable, installments, free balance, SCR?)
   - Recommendation: Match the spreadsheet format: Mes, Renda, Fixos, Parcelas, Variaveis, Saldo Livre

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | None -- tests run directly with `node --test` |
| Quick run command | `node --test tests/phase-01/*.test.js` (will be created) |
| Full suite command | `node --test tests/**/*.test.js` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KPI-01 | Health score computation, margem livre, installment relief date | unit | `node --test tests/phase-01/kpi-enrichment.test.js` | Wave 0 |
| KPI-02 | Market KPI formulas (net worth, savings rate, DTI, etc.) | unit | `node --test tests/phase-01/kpi-market.test.js` | Wave 0 |
| KPI-03 | Next-month projection card data | unit | `node --test tests/phase-01/kpi-projection-card.test.js` | Wave 0 |
| VIS-01 | Alert generation from thresholds | unit | `node --test tests/phase-01/alert-engine.test.js` | Wave 0 |
| VIS-02 | Chart data preparation (not rendering) | unit | `node --test tests/phase-01/chart-data.test.js` | Wave 0 |
| SIM-01 | Simulator PMT formula, impact calculation | unit | `node --test tests/phase-01/purchase-simulator.test.js` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/phase-01/*.test.js`
- **Per wave merge:** `node --test tests/**/*.test.js`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/phase-01/kpi-enrichment.test.js` -- covers KPI-01 health score, margem livre, installment relief
- [ ] `tests/phase-01/kpi-market.test.js` -- covers KPI-02 market KPI formulas
- [ ] `tests/phase-01/purchase-simulator.test.js` -- covers SIM-01 PMT formula, edge cases
- [ ] `tests/phase-01/alert-engine.test.js` -- covers VIS-01 alert threshold logic

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A -- local-only app, no auth |
| V3 Session Management | no | N/A -- no sessions |
| V4 Access Control | no | N/A -- single-user local app |
| V5 Input Validation | yes | `escapeHtml()` for all dynamic content; numeric validation via `toNumber()` / `Number.isFinite()` |
| V6 Cryptography | no | N/A -- no encryption needed |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via user-entered descriptions | Tampering | `escapeHtml()` from `dom.js` on all innerHTML interpolations |
| Numeric overflow in KPI calculations | Information Disclosure | Guard all divisions with zero-check; clamp percentages to 0-100 range |
| Simulator input injection | Tampering | Parse all numeric inputs via `parseFloat` + `Number.isFinite` check |

## Data Availability Matrix

This matrix maps each required KPI to its data source, confirming feasibility.

| KPI | Data Source (IndexedDB Store) | Already Computed? | Gap |
|-----|------------------------------|-------------------|-----|
| Margem Livre (R$ + %) | `budget.freeBudgetEstimate` from financial-analysis.js | YES | Just needs card rendering |
| Saude Financeira (score) | `budget`, `debt`, `cashflow` objects | NO | New scoring function needed |
| Parcelas Ativas + Alivio Futuro | `despesas_fixas` (parcelas) + `lancamentos` (parcela field) | Partially (`parcelamento-summary.js`) | Need relief date calculation |
| Projecao Proximo Mes | `projection-auto.js` + `projection-model.js` | YES | Needs highlighted card in overview |
| Divida Total Consolidada | `registrato_scr_snapshot` + `registrato_scr_resumo_mensal` + `despesas_fixas` | Partially (`debt.totalExposure`) | Needs to include financing from despesas_fixas |
| Comprometimento da Renda | `budget.commitmentRatio` + `budget.pressureRatio` | YES | Needs progress bar visual |
| Net Worth | `cashflow.currentBalance` - `debt.totalExposure` | NO | New computation, partial data |
| Savings Rate | `budget.estimatedIncome` - `budget.totalPlannedSpend` | Derivable | New formula |
| Debt-to-Income Ratio | `debt.totalExposure` / `budget.estimatedIncome * 12` | NO | New formula |
| Emergency Fund Coverage | `cashflow.currentBalance` / `budget.totalPlannedSpend` | NO | New formula |
| Spending Velocity | `spending.latestMonthSpend` / days in month | NO | New formula |
| Cash Runway | `cashflow.currentBalance` / `budget.totalPlannedSpend` | NO | Same as emergency fund coverage |
| SCR Evolution Chart | `registrato_scr_resumo_mensal` (mesRef, emDia, vencida) | Data exists | New Chart.js line chart |
| Donut Expense Composition | `analytics.categoryTotals` | Data exists | New Chart.js doughnut |
| Invoice Evolution | `cardBillSummaries` (fatura, total per month) | Data exists | New Chart.js line chart |
| Annual Projection Table | `buildProjectionSchedule()` with 12 months | Logic exists | New HTML table rendering |
| Purchase Simulator | Pure computation + `budget.freeBudgetEstimate` for impact | NO | New computation + UI |
| Contextual Alerts | All KPI thresholds | NO | New alert engine |
| KPI Detail Modal | All KPI data objects | NO | New modal component |

## Sources

### Primary (HIGH confidence)
- `js/utils/financial-analysis.js` -- full read, 370 lines, confirmed all existing KPI functions
- `js/utils/analytics.js` -- full read, spending analytics and month-over-month computations
- `js/utils/projection-model.js` -- full read, SCR projection and schedule generation
- `js/utils/parcelamento-summary.js` -- full read, installment grouping and relief dates
- `js/utils/projection-auto.js` -- partial read, automatic projection input estimation
- `js/views/visao-geral.js` -- full read, current overview rendering including Chart.js usage
- `js/views/analise-financeira.js` -- full read, financial analysis surface rendering
- `js/db.js` -- full read, all 16 IndexedDB store definitions
- `js/app.js` -- partial read, data loading orchestration and view initialization
- `index.html` -- partial read, current KPI card HTML structure and chart canvas elements
- `css/styles.css` -- searched for card, progress-bar, badge, modal patterns
- `vendor/chartjs/chart.umd.js` -- confirmed Chart.js v4.4.1

### Secondary (MEDIUM confidence)
- None required -- all findings verified against codebase

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already vendored and in active use
- Architecture: HIGH -- extending well-established patterns visible in 5+ existing modules
- Pitfalls: HIGH -- documented from actual code patterns and financial calculation edge cases
- KPI feasibility: HIGH -- every required data source verified against IndexedDB stores

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable -- vanilla JS project with no external dependency changes expected)
