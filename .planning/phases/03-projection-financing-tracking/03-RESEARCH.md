# Phase 3: Projection & Financing Tracking - Research

**Researched:** 2026-03-28  
**Domain:** Browser-side projection modeling for SCR-derived commitments and installment/financing impact  
**Confidence:** MEDIUM

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use a hybrid model. The projection should automatically include only monthly commitments that the app can map with good evidence from Registrato/SCR plus transaction history.
- **D-02:** Registrato/SCR exposure that is still too aggregated or weakly mapped must stay visible as context or warning outside the projection math, not silently injected into the calculation.
- **D-03:** If a SCR-derived commitment appears to match an existing manually maintained item, treat it as a conflict and do not auto-include it until the user reviews it.
- **D-04:** The phase should optimize for avoiding double counting over maximizing automatic coverage.
- **D-05:** The `Projeção` tab should gain a dedicated section before the projection table listing each SCR-derived commitment, its source, and its status.
- **D-06:** That dedicated section must distinguish at least three states: included automatically, conflict requiring review, and contextual-only/not included.
- **D-07:** Keep the full installment/financing tracker detail in `Despesas & Parcelas`.
- **D-08:** `Projeção` should show only summary/impact information plus shortcuts or clear paths to the full tracker, rather than duplicating the full tracking UI there.

### Claude's Discretion
- Exact wording, badge colors, and card layout for the new SCR breakdown section.
- Whether the projection summary uses cards, grouped rows, or compact helper panels, as long as the status model remains explicit.
- The exact heuristics threshold for "good evidence," provided it preserves the hybrid policy and conflict-first safeguard above.

### Deferred Ideas (OUT OF SCOPE)
- Moving the primary installment tracker out of `Despesas & Parcelas` and into `Projeção` was considered and explicitly deferred.
- Broadly injecting aggregated SCR exposure into the math without strong evidence was considered and rejected for this phase.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-01 | User can have Registrato/SCR commitments automatically included in projection calculations when compatible imported data exists. | Build a new pure projection model from existing SCR stores + imported transactions, auto-include only high-evidence non-conflicting commitments, and expose a separate `scrIncluido` bucket in projection math. |
| PROJ-02 | User can understand which projection values are being influenced by Registrato/SCR-derived commitments. | Add a dedicated SCR commitments section in `Projeção`, explicit statuses (`included`, `conflict`, `contextual-only`), and keep SCR impact visible in the monthly table/charts/result summary. |

</phase_requirements>

## Project Constraints (from repo docs and code conventions)

_No `CLAUDE.md` was present at repo root. Constraints below come from `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, and `.planning/codebase/CONVENTIONS.md`._

- Keep the project local-first and browser-only.
- Do not add a backend, server workflow, or external financial processing.
- Do not replace IndexedDB with `localStorage`.
- Keep `js/db.js` as the only persistence gateway.
- Keep the current static stack: HTML, CSS, vanilla JS ES modules, IndexedDB, Chart.js via CDN.
- Respect `window.refreshDashboard()` and the serialized `_refreshChain` refresh model in `js/app.js`.
- Keep views as renderers over already-loaded in-memory state; do not make them the source of truth.
- Preserve the public inline HTML contract from `index.html`; avoid inventing new global handlers when existing ones are enough.
- Escape dynamic HTML with `escapeHtml()` from `js/utils/dom.js`.
- Favor additive modules and pure helpers over deep rewrites.
- Current validation is lightweight: pure helper tests with `node:test`, plus browser validation.

## Summary

Phase 3 should stay faithful to the repo’s existing architecture: compute everything in memory during `app.js` refresh, pass ready-made view models into `js/views/projecao.js`, and avoid any new store unless absolutely necessary. The right implementation is **not** “make `buildRegistratoSuggestions()` affect projection directly.” That helper is optimized for suggestion cards in `Despesas & Parcelas`; it filters out existing manual names and dismissed items, which is exactly what would hide the conflicts and contextual rows that Phase 3 must make explicit.

The safest design is a new pure projection-focused model that starts from the same raw stores already loaded by `app.js`: `registrato_scr_snapshot`, `registrato_scr_resumo_mensal`, `lancamentos`, `extrato_transacoes`, `despesas_fixas`, and `registrato_sugestoes_dispensa`. That model should classify each SCR-backed candidate into one of three states: `included`, `conflict`, or `contextual-only`. Only `included` rows enter projection math, and they should enter through a separate SCR bucket rather than being silently merged into `_fixoMensal.total`.

A second important correction is that projection math should become **month-aware** for scheduled commitments. Today `projecao.js` treats all `despesas_fixas` as flat forever, which ignores payoff timelines already represented in `despesas_fixas[].parcelas` and visualized in `parcelamentos.js`. Phase 3 should use that existing metadata to reduce projected outflows after known end months, while still keeping full tracker detail in `Despesas & Parcelas` and only surfacing compact impact summaries plus shortcuts in `Projeção`.

**Primary recommendation:** Add a new pure `js/utils/projection-model.js` that classifies SCR commitments and builds month-aware outflow schedules, wire it in `js/app.js`, and extend `js/views/projecao.js` with a dedicated SCR status section plus an explicit `SCR incluído` projection bucket.

## Standard Stack

### Core

| Library / Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS ES modules | Native browser runtime | All app logic and DOM rendering | This is the repo’s established runtime model. |
| IndexedDB via `js/db.js` | DB schema v5 in repo | Local persistence | Existing single persistence boundary; Phase 3 does not need a new store. |
| Chart.js | 4.4.1 (repo-pinned CDN) | Projection charts | Already loaded in `index.html` and used successfully in `projecao.js`. |

### Supporting

| Library / Module | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `js/utils/registrato-suggestions.js` | Repo-local | Existing SCR signal and recurring-group heuristics | Reuse/extract pure helpers from it; do not use its filtered output as the projection source. |
| `js/utils/dashboard-context.js` | Repo-local | Existing SCR context row patterns | Reuse its “derived context, not math” pattern for contextual-only SCR rows. |
| `js/utils/formatters.js` | Repo-local | Currency and month helpers | Use for display and month schedule generation. |
| `node:test` | Built-in Node | Pure helper tests | Best fit for new Phase 3 utility tests. |
| `js/views/parcelamentos.js` | Repo-local | Existing detailed tracker behavior | Keep as the full-detail surface; only extract summary math if needed. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New pure projection model from raw stores | Reuse `buildRegistratoSuggestions()` output directly | Simpler, but wrong for this phase because filtered suggestions hide conflicts, dismissed items, and contextual-only cases. |
| In-memory derived projection context | New IndexedDB store for projection commitments | Adds schema/version complexity for data that can be derived on refresh. |
| Keep card-source SCR candidates out of math by default | Auto-add all SCR-matched card commitments | Risks immediate double counting with the user-entered `pItau` bucket. |
| Compact summary + shortcut in `Projeção` | Duplicate full installment tracker in `Projeção` | Violates locked decision D-07/D-08 and bloats the tab. |

**Installation:**
```bash
# No new packages recommended.
# Keep the current static stack and repo-pinned Chart.js include.
```

**Version verification:**
- `Chart.js 4.4.1` is verified from `index.html`.
- Browser-native APIs (`IndexedDB`, ES modules) are runtime features, not npm packages.
- No dependency upgrade is required for Phase 3.

## Architecture Patterns

### Recommended Project Structure

```text
js/
├── app.js                          # load stores, derive projection model, pass ready context to views
├── utils/
│   ├── projection-model.js         # NEW: SCR classification + month-aware projection schedule
│   ├── parcelamento-summary.js     # NEW: compact tracker summary for Projeção (optional but recommended)
│   ├── registrato-suggestions.js   # existing suggestion workflow; may export shared low-level helpers
│   ├── dashboard-context.js        # existing context-row pattern
│   └── formatters.js               # existing month/currency helpers
└── views/
    ├── projecao.js                 # extend with SCR section, summary panel, explicit SCR math bucket
    └── parcelamentos.js            # keep full tracker detail here

tests/
└── phase-03/
    ├── projection-model.test.js
    ├── projection-conflicts.test.js
    └── parcelamento-summary.test.js
```

### Recommended Phase 3 data flow

```text
refreshDashboard()
  -> loadDashboardData()
  -> buildRegistratoSuggestions(...)              # existing
  -> computeRegistratoInsights(...)               # existing
  -> buildScrProjectionModel(...)                 # NEW
  -> buildParcelamentoSummary(...)                # NEW
  -> initProjecao(despesasFixas, extratoSummary, registratoInsights, {
       scrProjectionModel,
       parcelamentoSummary
     })
```

### Pattern 1: Derive projection context in `app.js`, not inside the view

**What:** Keep Phase 3 consistent with the repo’s centralized refresh model by computing the full projection-ready SCR model before `initProjecao()` runs.

**When to use:** Every refresh, alongside existing analytics/Registrato derivations.

**Recommendation:**
- Add a new pure helper, preferably `js/utils/projection-model.js`.
- Pass its result as a fourth options argument to `initProjecao`, similar to how `initLancamentos` and `initExtrato` already accept context objects.

**Example:**
```js
// Source pattern: js/app.js existing context assembly
import { buildScrProjectionModel } from './utils/projection-model.js';
import { buildParcelamentoSummary } from './utils/parcelamento-summary.js';

async function renderDashboard() {
  const {
    despesasFixas,
    lancamentos,
    extratoTransacoes,
    extratoSummary,
    registratoSnapshots,
    registratoResumos,
    registratoSugestoesDispensa,
  } = await loadDashboardData();

  const scrProjectionModel = buildScrProjectionModel({
    despesasFixas,
    lancamentos,
    extratoTransacoes,
    registratoSnapshots,
    registratoResumos,
    dismissals: registratoSugestoesDispensa,
  });

  const parcelamentoSummary = buildParcelamentoSummary({
    despesasFixas,
    lancamentos,
  });

  initProjecao(despesasFixas, extratoSummary, registratoInsights, {
    scrProjectionModel,
    parcelamentoSummary,
  });
}
```

### Pattern 2: Build the SCR projection model from raw stores, not from filtered suggestions

**What:** The projection model should start from raw SCR + transaction evidence, then apply classification rules. It must not begin from `buildRegistratoSuggestions()` output.

**Why:** `buildRegistratoSuggestions()` currently:
- excludes recurring groups whose names already exist in `despesas_fixas`/`assinaturas`
- filters out keys found in `registrato_sugestoes_dispensa`
- mixes SCR-backed candidates with transaction-only recurring candidates

That is correct for suggestion cards, but wrong for projection explainability.

### How to derive a projection-ready SCR commitments model

#### Input matrix

| Source | Fields to use | Why it matters |
|--------|---------------|----------------|
| `registrato_scr_snapshot` | `instituicao`, `mesRef`, `detalheLinhas`, `rawText`, `operacoes` | Best signal source for product/institution-level SCR commitments. |
| `registrato_scr_resumo_mensal` | `mesRef`, `mesLabel`, `emDia`, `vencida`, `outrosCompromissos`, `rawText` | Fallback signal/context when snapshot detail is weak or absent. |
| `lancamentos` | `desc`, `valor`, `fatura`, `parcela`, `source`, `tipo_classificado`, `classificado_nome` | Card-side recurring evidence and existing manual classification hints. |
| `extrato_transacoes` | `desc`, `valor`, `mes`, `tipo`, `cat` | Account-side recurring debit evidence; safest source for auto-inclusion. |
| `despesas_fixas` | `desc`, `nome`, `valor`, `recorrencia`, `parcelas` | Existing manual commitments; required for conflict detection. |
| `registrato_sugestoes_dispensa` | `key`, `motivo` | Persisted review memory; accepted/dismissed items should not silently re-enter math. |

#### Recommended output contract

`buildScrProjectionModel()` should return a shape like:

```js
{
  commitments: [
    {
      key: 'scr:caixa:financiamento-habitacional:...',
      nome: 'Financiamento habitacional — Caixa',
      tipo: 'financiamento',
      institutionId: 'caixa',
      institutionLabel: 'Caixa',
      signalLabel: 'Financiamento habitacional',
      valorMensal: 1240.50,
      status: 'included' | 'conflict' | 'contextual-only',
      motivoStatus: 'matched-account-recurring' | 'manual-conflict' | 'aggregated-only' | 'card-bucket-risk' | 'multiple-candidates' | 'weak-evidence' | 'dismissed',
      origem: 'Registrato + transações' | 'Registrato consolidado',
      confidence: 'alta' | 'media' | 'baixa',
      sourceChannel: 'conta' | 'cartao' | 'scr-only',
      mesesEvidencia: ['Jan/2026', 'Fev/2026', 'Mar/2026'],
      hintParcelas: { atual, total, inicio } | null,
      conflictWith: { id, desc, tipo } | null,
      projectionImpactMonthly: 1240.50 | 0,
      projectionSchedule: { 'Abr/2026': 1240.50, 'Mai/2026': 1240.50 }
    }
  ],
  totals: {
    includedMonthlyTotal: 1240.50,
    conflictMonthlyTotal: 870.00,
    contextualCount: 2
  }
}
```

#### Classification rules

| Status | Rule | Enters projection math? |
|--------|------|--------------------------|
| `included` | SCR signal exists, exactly one strong recurring match exists, match is account-side or otherwise clearly separate from `pItau`, confidence is high, user has not dismissed it, and no manual conflict exists | Yes |
| `conflict` | Strong SCR-backed candidate exists, but it appears to overlap an active manual item in `despesas_fixas` | No |
| `contextual-only` | Any weak/aggregated/ambiguous/card-bucket/dismissed case | No |

#### Good-evidence threshold for `included`

Use a stricter rule than the suggestion engine:

A candidate is safe to auto-include only when **all** are true:

1. It is SCR-backed (`signal` from snapshot/resumo exists).
2. It resolves to **exactly one** plausible recurring transaction group.
3. The matched group has at least 2 months of evidence.
4. One of these must also be true:
   - it has a stable parcel hint (`hintParcelas`) and no same-month ambiguity, or
   - it has 3+ SCR months and 3+ recurring months with stable values.
5. The matched source is `conta` **or** another clearly separate non-card payment channel.
6. It does not conflict with an active manual item.
7. It is not user-dismissed.

Everything else stays visible but out of math.

### Pattern 3: Detect conflicts explicitly against manual `despesas_fixas`

**What:** Conflict detection must be its own step, not a side effect of filtering names out of recurring groups.

**Why:** Locked decision D-03 requires explicit conflict rows. Current suggestion logic would often hide them.

### Conflict detection strategy against `despesas_fixas` / parcelas items

#### Candidate manual items to compare against
Use all active `despesas_fixas`:

- recurring fixed expenses (`recorrencia !== 'variavel'`)
- active parcelamentos (`parcelas.total > parcelas.pagas`)
- active financiamentos (`parcelas.total > parcelas.pagas`)

Ignore:
- completed parcel items
- obviously variable expenses
- zero/invalid values

#### Recommended matching rule

Treat a SCR candidate as a manual conflict when **value proximity** plus **at least one semantic overlap** is found.

**Value proximity**
- `abs(candidate.valorMensal - manual.valor) <= max(15, candidate.valorMensal * 0.10)`

**Semantic overlap: one or more of**
- normalized names overlap (`desc` / `nome` / merchant root)
- same institution alias can be resolved from both descriptions
- same financial type (`financiamento` / `parcelamento`)
- grouped source transactions already carry `tipo_classificado` or `classificado_nome` pointing to a manual conversion

If value proximity holds and any semantic overlap holds, mark `conflict`.

This should be intentionally conservative: false positives become “review required,” which is safer than silent double counting.

**Example conflict reasons to surface**
- `Já existe despesa fixa manual com valor semelhante`
- `Já existe financiamento ativo com esta instituição`
- `Transações-base já foram classificadas manualmente`

### Pattern 4: Keep projection math month-aware

**What:** Projection should stop treating all fixed outflows as flat forever.

**Why:** The repo already stores installment state in `despesas_fixas[].parcelas`, and `parcelamentos.js` already computes end dates. Phase 3 should reuse that reality in projection math.

#### Recommended month buckets

For each projected month, compute:

- `fixoBase` — recurring fixed expenses without parcel end
- `fixoProgramado` — manual parcelamentos/financiamentos still active in that month
- `scrIncluido` — auto-included SCR commitments active in that month
- `itau` — still user-entered card bill bucket
- `outros` — still user-entered variable bucket

Then:

```js
totalSaidas = fixoBase + fixoProgramado + scrIncluido + itau + outros;
```

#### Important repo-faithful rule

Do **not** auto-add SCR candidates whose evidence comes from card-side `lancamentos` into `scrIncluido` by default.  
Reason: those obligations are likely already reflected in the user-entered `pItau` amount, so adding them separately is a direct double-count risk.

Recommended handling:
- card-source match => `contextual-only`
- reason => `Provável sobreposição com a fatura do cartão`
- UI shortcut => `Abrir Despesas & Parcelas`

### Pattern 5: Make SCR influence visible as its own bucket

**What:** Do not silently merge auto-included SCR values into existing “Fixos (conta)” totals.

**Recommendation:**
- Add a dedicated `SCR incluído` column to the monthly table.
- Add SCR to the pizza chart composition.
- Include SCR in the monthly result banner text.
- Update scenario/equilibrium calculations to factor SCR included totals.

**Why:** PROJ-02 is about explainability, not just correctness.

### Pattern 6: Dedicated SCR commitments section in `Projeção`

**Placement:** Immediately after the hero panel and before scenarios/charts/table.

This is the best fit because:
- it explains the math before the user reads results
- it satisfies D-05 cleanly
- it avoids hiding status below unrelated visuals

#### UI guidance for the dedicated projection section

**Structure**
1. Summary bar/cards
   - `Incluídos automaticamente: R$ X/mês`
   - `Conflitos para revisão: N`
   - `Contextuais: N`
2. Commitment list
3. Small footer note with shortcut buttons

**Recommended row fields**
- commitment name
- monthly amount considered (`—` for contextual-only when not derivable)
- source (`Registrato + transações`, `Registrato consolidado`)
- status badge
- short reason
- shortcut action

**Recommended statuses**
- `Incluído automaticamente` — green
- `Conflito / revisar` — warm/red or amber emphasis
- `Somente contexto` — blue/gray

**Recommended shortcut actions**
- `Abrir Despesas & Parcelas` via existing `switchTab(null, 'despesas')`
- `Abrir Registrato` via existing `switchTab(null, 'registrato')`

**Recommended empty state**
- “Há dados de SCR, mas nenhum compromisso com evidência suficiente para entrar automaticamente na projeção.”

**Recommended special contextual row**
When the app has SCR exposure but cannot derive contract-level monthly commitments, render a synthetic contextual row like:
- `SCR consolidado sem mapeamento mensal confiável`
- source: `Resumo mensal do SCR`
- status: `Somente contexto`
- amount: `—`

That is better than hiding the uncertainty.

### Pattern 7: Keep tracker detail in `Despesas & Parcelas`, but surface summary/impact in `Projeção`

**What:** `Projeção` should get a compact “impacto dos parcelamentos e financiamentos” helper panel, not the full `financGrid`, `parcGrid`, or detailed parcel table.

**Recommended compact summary fields**
- financiamentos ativos: total mensal
- parcelamentos do cartão: total mensal informativo
- próximo término relevante
- quantidade de compromissos que acabam dentro do horizonte projetado
- CTA button to open `Despesas & Parcelas`

**Recommended helper**
Create `js/utils/parcelamento-summary.js` returning something like:

```js
{
  financiamentos: {
    ativos: 2,
    totalMensal: 1800,
    saldoDevedor: 42000,
    proximoTermino: 'set. 2027'
  },
  cartaoParcelado: {
    ativos: 4,
    totalMensal: 690,
    saldoRestante: 2415,
    proximoTermino: 'jul. 2026'
  }
}
```

Use this in `Projeção` for compact impact cards, and keep `parcelamentos.js` as the detailed view.

### Anti-patterns to Avoid

- **Using `buildRegistratoSuggestions()` as the projection source:** It hides exactly the rows Phase 3 must explain.
- **Auto-including card-source SCR matches:** Likely double counts against `pItau`.
- **Merging SCR into “Fixos” with no separate label:** User loses explainability.
- **Keeping `_fixoMensal.total` flat across all future months:** Ignores payoff dates already present in the data.
- **Choosing “best match” when multiple same-bank candidates exist:** For projection math, ambiguity should downgrade to contextual-only.
- **Treating aggregated SCR exposure as monthly payment:** Exposure is not the same as parcela mensal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Projection persistence | New IndexedDB store for SCR projection rows | Pure in-memory `buildScrProjectionModel()` output | Derived data already fits the app refresh model and avoids schema churn. |
| Review workflow | New approval system/store | Existing `registrato_sugestoes_dispensa` + manual `despesas_fixas` review flow | The repo already has accept/dismiss memory. |
| Charting | Custom canvas logic | Existing Chart.js 4.4.1 | Already loaded and working in `projecao.js`. |
| Financial matching | Opaque fuzzy matcher / AI heuristic | Deterministic normalized rules with conflict-first fallback | Local-first, auditable, and safer against silent double counts. |
| Installment impact math in DOM loops | Ad hoc month logic inside `renderProjecaoTable()` | Pure schedule builder in `projection-model.js` | Testable and easier to reason about. |

**Key insight:** In this phase, **missing one automatic inclusion is acceptable; double counting is not**.

## Recommended Plan Breakdown

### Recommended default split: 3 plan files

| Plan | Goal | Main Files | Why this split works |
|------|------|------------|----------------------|
| `03-01-PLAN.md` | Build pure SCR projection model and conflict detection | `js/utils/projection-model.js`, possible small extraction from `js/utils/registrato-suggestions.js`, `tests/phase-03/projection-model.test.js`, `tests/phase-03/projection-conflicts.test.js` | Isolates the highest-risk logic in testable helpers first. |
| `03-02-PLAN.md` | Wire projection math and dedicated SCR explainability section | `js/app.js`, `js/views/projecao.js`, `index.html` | Delivers PROJ-01/02 behavior once the model is trustworthy. |
| `03-03-PLAN.md` | Add compact tracker-impact summary and browser verification | `js/utils/parcelamento-summary.js`, `js/views/projecao.js`, optionally `js/views/parcelamentos.js`, `tests/phase-03/parcelamento-summary.test.js` | Keeps tracker detail anchored in `Despesas & Parcelas` while making payoff impact visible in `Projeção`. |

### Scope guidance per plan

#### `03-01-PLAN.md`
- Extract or share low-level SCR signal helpers
- Build raw recurring-group derivation without filtering out existing names
- Add classification statuses
- Add manual conflict detection
- Add dismissed/accepted handling
- Unit-test all state transitions

#### `03-02-PLAN.md`
- Change `initProjecao()` to accept an options object
- Add SCR section container in `index.html`
- Add explicit `scrIncluido` month bucket in projection rows
- Update result banner, table, and charts
- Ensure contextual/conflict rows never affect math

#### `03-03-PLAN.md`
- Extract compact parcelamento/financiamento summary helper
- Show tracker impact cards + next payoff + shortcut in `Projeção`
- Validate browser flows:
  - included SCR affects rows
  - conflict rows visible but excluded
  - contextual rows visible but excluded
  - detailed tracker remains only in `Despesas & Parcelas`

## Common Pitfalls

### Pitfall 1: Filtered-suggestion blindness

**What goes wrong:** A real overlap with a manual commitment disappears instead of showing as a conflict.

**Why it happens:** `buildRegistratoSuggestions()` filters out existing names and dismissed keys before output.

**How to avoid:** Build the projection model from raw stores, then classify conflicts explicitly.

**Warning signs:** The projection section shows fewer SCR-backed items than the Registrato/suggestion surfaces imply.

### Pitfall 2: Double counting against `pItau`

**What goes wrong:** Projection gets worse by almost the same amount as a card parcel already captured in expected card bill input.

**Why it happens:** A card-side SCR match is added as separate monthly outflow.

**How to avoid:** Treat card-source SCR matches as `contextual-only` unless a future phase redesigns the card bill bucket.

**Warning signs:** Included SCR amount closely matches active card parcel totals from `parcelamentos.js`.

### Pitfall 3: “Forever debt” projection

**What goes wrong:** A financing/parcelamento keeps affecting every future month even though the tracker shows an end date.

**Why it happens:** `projecao.js` currently uses flat `_fixoMensal.total`.

**How to avoid:** Build month-aware schedules from `despesas_fixas[].parcelas` and SCR `hintParcelas`.

**Warning signs:** Projection rows never improve after known payoff months.

### Pitfall 4: Same-bank aggregation error

**What goes wrong:** Two obligations at the same institution collapse into one candidate and get mis-projected.

**Why it happens:** Existing SCR signal keys are institution/product oriented, not contract-level.

**How to avoid:** If multiple plausible recurring groups exist for one signal, downgrade to `contextual-only` (`multiple-candidates`) instead of auto-including.

**Warning signs:** One included amount looks too large or too generic for the observed transactions.

### Pitfall 5: Using exposure as payment

**What goes wrong:** Projection overstates monthly outflow by using `emDia + vencida + outrosCompromissos` as if that were a parcela mensal.

**Why it happens:** Aggregated SCR totals are visible and tempting to reuse.

**How to avoid:** Show aggregated exposure as context only.

**Warning signs:** Monthly projection jumps by values that look like loan balance, not installment value.

## Code Examples

Verified repo-faithful patterns:

### App-level derivation and view wiring

```js
// Source pattern: js/app.js existing derived-context flow
const scrProjectionModel = buildScrProjectionModel({
  despesasFixas,
  lancamentos,
  extratoTransacoes,
  registratoSnapshots,
  registratoResumos,
  dismissals: registratoSugestoesDispensa,
});

const parcelamentoSummary = buildParcelamentoSummary({
  despesasFixas,
  lancamentos,
});

initProjecao(despesasFixas, extratoSummary, registratoInsights, {
  scrProjectionModel,
  parcelamentoSummary,
});
```

### Conflict-first SCR classification

```js
// Source pattern: js/utils/registrato-suggestions.js + phase recommendation
function classifyScrCommitment(signal, groups, despesasFixas, dismissals) {
  const candidates = findPlausibleGroups(signal, groups);

  if (dismissals.has(signal.key)) {
    return contextualOnly(signal, 'dismissed');
  }

  if (candidates.length === 0) {
    return contextualOnly(signal, 'no-transaction-match');
  }

  if (candidates.length > 1) {
    return contextualOnly(signal, 'multiple-candidates');
  }

  const match = candidates[0];

  if (match.source === 'cartao') {
    return contextualOnly(signal, 'card-bucket-risk');
  }

  if (!isHighEvidence(signal, match)) {
    return contextualOnly(signal, 'weak-evidence');
  }

  const conflict = findManualConflict(match, despesasFixas);
  if (conflict) {
    return {
      ...buildCommitment(signal, match),
      status: 'conflict',
      conflictWith: conflict,
      projectionImpactMonthly: 0,
    };
  }

  return {
    ...buildCommitment(signal, match),
    status: 'included',
    projectionImpactMonthly: match.valorMedio,
  };
}
```

### Month-aware projection row composition

```js
// Source pattern: js/views/projecao.js current calcProjecao, but made schedule-aware
function buildProjectionRows({ salario, rendaExtra, itau, outros, meses, baseSchedule, scrSchedule }) {
  let saldo = _saldoAtual;

  return meses.map(mes => {
    const fixoBase = baseSchedule.fixoBaseByMonth[mes] || 0;
    const fixoProgramado = baseSchedule.fixoProgramadoByMonth[mes] || 0;
    const scrIncluido = scrSchedule[mes] || 0;
    const entradas = salario + rendaExtra;
    const totalSaidas = fixoBase + fixoProgramado + scrIncluido + itau + outros;
    const resultado = entradas - totalSaidas;
    saldo += resultado;

    return {
      mes,
      entradas,
      salario,
      rendaExtra,
      fixoBase,
      fixoProgramado,
      scrIncluido,
      itau,
      outros,
      totalSaidas,
      resultado,
      saldo,
    };
  });
}
```

## State of the Art

| Old Approach | Current Recommended Approach | When Changed | Impact |
|--------------|------------------------------|--------------|--------|
| `registratoInsights.financiamentoMensalSugerido` only appears as informational text in `pResultadoMensal` | Explicit SCR commitment model with status classification and separate projection bucket | Phase 3 | Meets PROJ-01/02 with auditability. |
| `_fixoMensal.total` is flat across all future months | Month-aware schedules for active parcelamentos/financiamentos and included SCR commitments | Phase 3 | Projection starts reflecting payoff timelines. |
| `Despesas & Parcelas` holds all detail and `Projeção` knows almost nothing about payoff impact | `Despesas & Parcelas` keeps detail; `Projeção` gets compact summary cards and shortcuts only | Phase 3 | Preserves tab roles without duplicating tracker UI. |

**Deprecated/outdated for this phase:**
- “SCR note only” in projection: insufficient for PROJ-01/02.
- “Best candidate wins” matching when multiple plausible groups exist: too risky for auto-inclusion.
- Flat fixed-expense projection for installment-heavy data: misleading once tracker metadata exists.

## Open Questions

1. **Should dismissed SCR candidates still appear in the dedicated projection section?**
   - What we know: The repo persists accepted/dismissed review state in `registrato_sugestoes_dispensa`.
   - What's unclear: Whether users expect dismissed items to disappear entirely or remain visible as audit context.
   - Recommendation: Keep them visible as `contextual-only` with a “dispensado” reason. This is more auditable and avoids “why did it vanish?” confusion.

2. **Can current SCR parsing distinguish multiple obligations at the same institution/product cleanly enough for auto-inclusion?**
   - What we know: Existing signal extraction is institution/product based, not contract-id based.
   - What's unclear: Whether real imported PDFs consistently provide enough structure to separate same-bank obligations.
   - Recommendation: If more than one plausible recurring group exists, do not auto-include any of them. Surface the ambiguity instead.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` |
| Config file | none |
| Quick run command | `node --test tests/phase-03` |
| Full suite command | `node --test tests` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-01 | High-evidence SCR commitments from compatible imported data become `included` and affect projection math; weak/aggregated/card-source items do not | unit | `node --test tests/phase-03/projection-model.test.js` | ❌ Wave 0 |
| PROJ-02 | Projection model exposes `included` / `conflict` / `contextual-only` states with reasons and zero-vs-nonzero math impact | unit | `node --test tests/phase-03/projection-conflicts.test.js` | ❌ Wave 0 |
| PROJ-02 | Compact tracker impact summary reflects active parcelamentos/financiamentos without duplicating detail UI | unit | `node --test tests/phase-03/parcelamento-summary.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test tests/phase-03`
- **Per wave merge:** `node --test tests`
- **Phase gate:** Full suite green before verification, plus browser validation of the `Projeção` and `Despesas & Parcelas` tabs

### Wave 0 Gaps

- [ ] `tests/phase-03/projection-model.test.js` — inclusion/contextual rules and monthly schedule behavior
- [ ] `tests/phase-03/projection-conflicts.test.js` — manual conflict detection and dismissal handling
- [ ] `tests/phase-03/parcelamento-summary.test.js` — compact payoff summary logic
- [ ] Browser smoke checklist — no automated UI harness exists for `index.html`/DOM behavior

## Sources

### Primary (HIGH confidence)
- `.planning/phases/03-projection-financing-tracking/03-CONTEXT.md` — locked decisions and phase boundary
- `.planning/ROADMAP.md` — Phase 3 goal and success criteria
- `.planning/REQUIREMENTS.md` — `PROJ-01`, `PROJ-02`
- `.planning/PROJECT.md` — local-first/static-app constraints
- `.planning/STATE.md` — Phase 3 blockers and duplicate-count concern
- `.planning/codebase/ARCHITECTURE.md` — refresh/render extension points
- `.planning/codebase/CONVENTIONS.md` — persistence, refresh, and HTML contract rules
- `js/app.js` — store-loading and derived-context orchestration
- `js/views/projecao.js` — current projection math and current SCR informational-only behavior
- `js/views/parcelamentos.js` — existing payoff/progress/end-date tracker logic
- `js/views/despesas-fixas.js` — current suggestion flow and manual expense schema
- `js/views/registrato.js` — current SCR summary/render patterns
- `js/utils/registrato-suggestions.js` — current signal extraction, confidence heuristics, and dismissal flow
- `js/utils/dashboard-context.js` — current contextual/non-math SCR row pattern
- `js/db.js` — store definitions and persistence boundaries
- `index.html` — current `Projeção`/`Despesas & Parcelas` surface and Chart.js version
- `tests/phase-01/*.test.js`, `tests/phase-02/*.test.js` — existing `node:test` validation pattern

### Secondary (MEDIUM confidence)
- `README.md` — current runtime/deployment assumptions and repo status notes

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — directly verified from repo files and current HTML/CDN wiring.
- Architecture: **HIGH** — current refresh model and tab responsibilities are explicit in `app.js`, `index.html`, and codebase docs.
- Pitfalls: **MEDIUM** — strongly supported by current code shape, but final heuristic tuning still needs browser validation with real SCR imports.

**Research date:** 2026-03-28  
**Valid until:** 2026-04-27 or until Phase 3 significantly reshapes `projecao.js` / Registrato heuristics