# Phase 3 — Plan 03-02 Summary

## Outcome

Wave 2 wired the new projection model into the live dashboard:

- `js/app.js`
  - computes `scrProjectionModel` and `parcelamentoSummary` during the normal refresh flow
  - passes both into `initProjecao(...)`
  - keeps import-time smoke safe by guarding browser-only boot behind `window`/`document`/`indexedDB`
- `index.html`
  - adds `projecaoScrPanel`
  - exposes dedicated SCR summary, commitments, and tracker-impact containers
  - adds a separate `SCR incluído` column to the month-by-month projection table
- `js/views/projecao.js`
  - renders explicit `included` / `conflict` / `contextual-only` SCR rows
  - recalculates month-by-month using payoff-aware schedule logic
  - shows `SCR incluído` as a separate projection bucket
  - aligns scenario cards and `Ponto de Equilíbrio` with the same schedule-aware math
  - uses `escapeHtml()` on new dynamic `innerHTML` surfaces

## Verification run

Automated checks passed:

- `node --loader file:///C:/Users/Admin/.copilot/session-state/fcd27fe6-b38e-4920-9767-5d3ef58e9efb/files/esm-test-loader.mjs --test tests/phase-01/*.test.js tests/phase-02/*.test.js tests/phase-03/*.test.js`
- `node --loader file:///C:/Users/Admin/.copilot/session-state/fcd27fe6-b38e-4920-9767-5d3ef58e9efb/files/esm-test-loader.mjs --input-type=module -e "await import('./js/utils/projection-model.js'); await import('./js/utils/parcelamento-summary.js'); await import('./js/views/projecao.js');"`
- `node --loader file:///C:/Users/Admin/.copilot/session-state/fcd27fe6-b38e-4920-9767-5d3ef58e9efb/files/esm-test-loader.mjs --input-type=module -e "globalThis.window = {}; globalThis.document = { body: { innerHTML: '' }, getElementById(){ return null; }, querySelectorAll(){ return []; } }; await import('./js/app.js');"`
- `node --input-type=module -e "import fs from 'node:fs'; const html = fs.readFileSync('./index.html', 'utf8'); if (!html.includes('projecaoScrPanel')) throw new Error('Missing projecaoScrPanel container'); if (!html.includes('SCR incluído')) throw new Error('Missing SCR incluído surface in projection HTML');"`

## Notes

The detailed tracker remains in `Despesas & Parcelas`. `Projeção` now shows only the compact impact summary plus shortcuts, matching the locked phase decision.
