# Phase 2 Validation

## Automated validation

- `node --test tests/phase-02/analytics-months.test.js tests/phase-02/analytics-aggregation.test.js tests/phase-02/analytics-delta.test.js`
- `node --test tests/phase-01/*.test.js tests/phase-02/*.test.js`
- `node --input-type=module -e "await import('./js/utils/analytics.js'); await import('./js/views/lancamentos.js');"`
- `node --input-type=module -e "globalThis.window = {}; globalThis.document = { body: { innerHTML: '' }, getElementById(){ return null; }, querySelectorAll(){ return []; } }; await import('./js/app.js');"`

## Manual validation

1. Open the app locally with imported card and account months present.
2. Go to `Lançamentos` and confirm the analytics panel appears above the filters/table.
3. Confirm the chart shows category spend across multiple months.
4. Confirm movers compare the latest month against the previous imported month.
5. Confirm `Outros` is not hidden and shows a visible quality note when dominant.
6. Confirm free-text search still narrows the table in real time.
7. Confirm `Extrato` remains account-specific and was not repurposed as the main analytics surface.

## Requirement mapping

- `ANLY-01`: covered by aggregation helpers, multi-month chart UI, and manual chart verification.
- `ANLY-02`: covered by movers/delta helpers, movers UI, and manual delta verification.
