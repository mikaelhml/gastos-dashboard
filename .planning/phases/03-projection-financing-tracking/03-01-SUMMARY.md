# Phase 3 — Plan 03-01 Summary

## Outcome

Wave 1 shipped the pure helper layer for Projection & Financing Tracking:

- `js/utils/projection-model.js`
  - adds `buildScrProjectionModel()`
  - adds `buildProjectionSchedule()`
  - classifies SCR-backed commitments into `included`, `conflict`, and `contextual-only`
  - keeps card-risk and aggregated-only evidence outside projection math
  - makes month-by-month projection scheduling aware of payoff dates
- `js/utils/parcelamento-summary.js`
  - adds `buildParcelamentoSummary()`
  - returns compact financing + card-installment impact for the Projeção tab

## Test coverage

Added:

- `tests/phase-03/projection-model.test.js`
- `tests/phase-03/projection-conflicts.test.js`
- `tests/phase-03/parcelamento-summary.test.js`

These tests lock:

- safe auto-inclusion only for strong account-backed evidence
- explicit conflict handling for manual overlap
- contextual-only handling for aggregated/card-risk cases
- payoff-aware scheduling for parcelamentos/financiamentos
- compact tracker summary semantics

## Verification run

Automated checks passed with the repo’s current Node ESM loader workaround:

- `node --loader file:///C:/Users/Admin/.copilot/session-state/fcd27fe6-b38e-4920-9767-5d3ef58e9efb/files/esm-test-loader.mjs --test tests/phase-03/*.test.js`

## Notes

This wave intentionally does **not** reuse `buildRegistratoSuggestions()` output as the projection source. The helper layer derives from raw loaded stores so conflicts and contextual-only SCR rows remain visible for the UI in later waves.
