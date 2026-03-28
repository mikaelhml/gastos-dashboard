# Phase 3: Projection & Financing Tracking - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the `Projeção` tab reflect real monthly commitments that can be derived from Registrato/SCR data, while keeping the result understandable and auditable. This phase also strengthens the payoff-timeline experience for installments and financing, but without turning `Projeção` into the new home for every installment detail.

</domain>

<decisions>
## Implementation Decisions

### SCR inclusion policy
- **D-01:** Use a hybrid model. The projection should automatically include only monthly commitments that the app can map with good evidence from Registrato/SCR plus transaction history.
- **D-02:** Registrato/SCR exposure that is still too aggregated or weakly mapped must stay visible as context or warning outside the projection math, not silently injected into the calculation.

### Conflict handling
- **D-03:** If a SCR-derived commitment appears to match an existing manually maintained item, treat it as a conflict and do not auto-include it until the user reviews it.
- **D-04:** The phase should optimize for avoiding double counting over maximizing automatic coverage.

### Projection explainability
- **D-05:** The `Projeção` tab should gain a dedicated section before the projection table listing each SCR-derived commitment, its source, and its status.
- **D-06:** That dedicated section must distinguish at least three states: included automatically, conflict requiring review, and contextual-only/not included.

### Installment tracker surface
- **D-07:** Keep the full installment/financing tracker detail in `Despesas & Parcelas`.
- **D-08:** `Projeção` should show only summary/impact information plus shortcuts or clear paths to the full tracker, rather than duplicating the full tracking UI there.

### the agent's Discretion
- Exact wording, badge colors, and card layout for the new SCR breakdown section.
- Whether the projection summary uses cards, grouped rows, or compact helper panels, as long as the status model remains explicit.
- The exact heuristics threshold for "good evidence," provided it preserves the hybrid policy and conflict-first safeguard above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product scope
- `.planning/ROADMAP.md` — Phase 3 goal, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` — `PROJ-01` and `PROJ-02`, plus adjacent installment requirements that should not be over-expanded in this phase.
- `.planning/PROJECT.md` — local-first, browser-only, no-backend constraints that remain locked.
- `.planning/STATE.md` — current focus, blockers, and the note that Phase 3 must avoid duplicate commitments.

### Existing projection and tracking behavior
- `index.html` — current `Projeção` inputs (`pSalario`, `pRendaExtra`, `pItau`, `pOutros`) and the current projection result/table/chart surface.
- `js/views/projecao.js` — current manual projection math, charts, and SCR informational note that does not yet affect calculations.
- `js/views/parcelamentos.js` — existing financing/installment tracker that already owns the detailed payoff timeline surface.

### Registrato/SCR derivation pipeline
- `js/utils/registrato-suggestions.js` — current suggestion engine, confidence model, and `computeRegistratoInsights()` behavior.
- `js/views/registrato.js` — current detailed SCR presentation, useful terminology, and existing exposure breakdown patterns.
- `js/utils/dashboard-context.js` — current normalized SCR context rows and exposure-without-limit helper used in other tabs.

### Application wiring conventions
- `.planning/codebase/ARCHITECTURE.md` — centralized refresh/render flow and extension points.
- `.planning/codebase/CONVENTIONS.md` — `js/db.js` as persistence boundary, `window.refreshDashboard()` pattern, and inline HTML API contract.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/views/projecao.js`: already owns the projection inputs, monthly result table, alert panel, and three charts; Phase 3 should extend this module rather than creating a parallel projection surface.
- `js/views/parcelamentos.js`: already computes payoff progress, remaining installments, debt balance, and projected end dates for both manual financing items and card installments.
- `js/utils/registrato-suggestions.js`: already contains the strongest current signal-merging logic between SCR data and transaction history, including confidence scoring and installment hints.
- `js/views/registrato.js`: already renders institution/month breakdowns that can be reused conceptually for SCR status labels in the projection area.

### Established Patterns
- `js/app.js` loads all stores once, computes derived models in memory, and then passes ready data into the tab views. Phase 3 should follow that pattern instead of introducing a new persistence-heavy flow unless truly necessary.
- The app favors full refresh after persistence changes and keeps views as renderers over persisted state, not as the source of truth.
- Prior work in Phase 2 kept analytics derived from existing stores with no new framework and no backend; Phase 3 should stay aligned with that local-first derivation approach.

### Integration Points
- `js/app.js`: likely place to compute a richer projection context from `despesasFixas`, `lancamentos`, `extratoSummary`, `registratoResumos`, and `registratoSuggestions`.
- `js/views/projecao.js`: place to merge manual inputs with auto-included SCR commitments and to render the dedicated "derived commitments" section before the table.
- `js/views/parcelamentos.js`: place to preserve the full tracker and potentially expose summary hooks or cross-links consumed by the projection tab.

</code_context>

<specifics>
## Specific Ideas

- Favor auditability over silent automation.
- Conflicts between manual commitments and SCR-derived commitments should be shown explicitly instead of guessed away.
- `Projeção` should become more trustworthy and explainable, but the detailed tracker should remain anchored in `Despesas & Parcelas`.

</specifics>

<deferred>
## Deferred Ideas

- Moving the primary installment tracker out of `Despesas & Parcelas` and into `Projeção` was considered and explicitly deferred.
- Broadly injecting aggregated SCR exposure into the math without strong evidence was considered and rejected for this phase.

</deferred>

---

*Phase: 03-projection-financing-tracking*
*Context gathered: 2026-03-28*
