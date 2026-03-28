# Research: Architecture Guidance

## Recommended Direction

Keep the current brownfield architecture and evolve it additively.

The selected v1 does not require a rewrite, a framework migration, or a new persistence layer. The safest implementation path is to keep `js/app.js` as the composition point and add small focused modules where the logic is getting too dense.

## Best Integration Seam

The existing seam is already good:

```text
loadDashboardData() -> normalize / compute context -> build views
```

Any new trend computation, backup status, or categorization rule application should be inserted into that existing refresh path instead of creating side channels.

## Recommended Additive Structure

### Phase 1 style work
Touches:
- `js/parsers/*.js`
- `js/db.js`
- `js/views/importar.js`
- `js/utils/config-io.js` or a sibling backup utility

Goal:
- fix reimport safety
- add fuller dataset backup and restore
- keep the import flow trustworthy

### Phase 2 style work
Touches:
- `js/app.js`
- `js/views/visao-geral.js`
- potentially new pure helpers under `js/utils/` or `js/analytics/`

Goal:
- compute category trends before rendering
- pass trend data into the affected views

If a new `js/analytics/` folder is introduced, keep it pure: no DOM and no direct IndexedDB calls.

### Phase 3 style work
Touches:
- `js/views/projecao.js`
- `js/utils/registrato-suggestions.js`
- `js/app.js`

Goal:
- use already-derived Registrato/SCR context in real projection output
- keep visual explanation of what is automatic vs manual

### Phase 4 style work
Touches:
- `js/db.js`
- `js/utils/categorizer.js`
- transaction editing flow in the relevant view modules

Goal:
- store user rules
- apply them before defaults
- learn from manual correction without breaking current behavior

## Store Guidance

For the selected v1, the only clearly justified new persistent surface is a small store for user-defined categorization rules or correction memory.

Do not introduce cache stores or major DB reshaping unless real performance problems are measured first.

## Guardrails

- Keep `db.js` as the persistence boundary
- Keep `refreshDashboard()` as the central rebuild path
- Prefer additive parameters/context over new globals
- Keep parser-specific recovery logic near the parser/import flow
- Avoid architecture work that is only justified by hypothetical scale
