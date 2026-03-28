# Phase 5 Validation

## Automated validation

- `node --test tests/phase-05/privacy-audit.test.js tests/phase-05/empty-states.test.js tests/phase-05/transaction-export.test.js`
- `node --test tests/phase-01/*.test.js tests/phase-02/*.test.js tests/phase-03/*.test.js tests/phase-04/*.test.js tests/phase-05/*.test.js`
- `node --input-type=module -e "await import('./js/utils/privacy-audit.js'); await import('./js/utils/empty-states.js'); await import('./js/utils/transaction-export.js');"`
- `node --input-type=module -e "await import('./js/views/importar.js'); await import('./js/views/visao-geral.js'); await import('./js/views/extrato.js'); await import('./js/views/lancamentos.js');"`
- `node --input-type=module -e "globalThis.window = {}; globalThis.document = { body: { innerHTML: '' }, getElementById(){ return null; }, querySelectorAll(){ return []; } }; await import('./js/app.js');"`
- `node --input-type=module -e "import fs from 'node:fs'; const html = fs.readFileSync('./index.html', 'utf8'); for (const id of ['privacyAuditOpenBtn','privacyAuditDialog','visaoEmptyState','extratoEmptyState','lancamentosEmptyState','importarFirstStepState','mobileTabSelect','lancamentosExportCsvBtn']) { if (!html.includes(id)) throw new Error('Missing ' + id); } const css = fs.readFileSync('./css/styles.css', 'utf8'); if (/table\\s*\\{[^}]*min-width:\\s*720px/i.test(css)) throw new Error('Global mobile 720px table rule still present');"`

## Manual validation

1. Start with a clean IndexedDB state.
2. Open the app and confirm `Visão Geral`, `Extrato`, and `Lançamentos` show explicit onboarding empty states instead of empty charts/tables.
3. Confirm `Importar` shows a first-step helper with current, real actions only: import PDFs, restore backup, or continue with manual recurring setup.
4. In `Importar`, open the privacy audit and confirm it shows:
   - local store counts,
   - storage usage or an explicit unavailable fallback,
   - last import dates per source,
   - honest wording that financial data stays local and is not uploaded to a backend,
   - a caveat that Chart.js and PDF.js are still fetched as static CDN assets.
5. Import at least one supported PDF and confirm the privacy audit updates the latest import date for the correct source label.
6. Open DevTools Network during import and confirm there is no app-level upload/fetch/XHR/sendBeacon/WebSocket carrying imported financial payloads.
7. Go to `Lançamentos`, apply a search/filter combination, export CSV, and confirm:
   - only the filtered real rows are exported,
   - derived SCR/context rows are not exported as transactions,
   - accents, quotes, and line breaks survive,
   - the file opens cleanly in Excel or another spreadsheet app,
   - the UI clearly says CSV / Excel-compatible rather than claiming native `.xlsx`.
8. Switch to a mobile-width viewport (~390px wide) and confirm:
   - the primary navigation is usable without horizontal scrolling the page,
   - the mobile tab selector works for `Visão Geral`, `Lançamentos`, `Extrato`, and `Importar`,
   - filters and action buttons do not overlap,
   - the primary tables/rows remain readable without forced sideways scrolling.
9. Final sanity check: Phase 5 improves clarity and transparency without adding a new privacy tab, without fake Excel support, and without hiding mobile issues behind overflow.

## Nyquist coverage

Nyquist validation is enabled for this repo, so every code-producing task in Phase 5 has an automated proof path before browser approval:

- `05-01-PLAN.md`
  - Task 1 automated proof: `node --test tests/phase-05/privacy-audit.test.js`
  - Task 2 automated proof: `node --test tests/phase-05/privacy-audit.test.js && node --input-type=module -e "await import('./js/utils/privacy-audit.js'); await import('./js/views/importar.js');" && node --input-type=module -e "import fs from 'node:fs'; const html = fs.readFileSync('./index.html', 'utf8'); if (!html.includes('privacyAuditOpenBtn')) throw new Error('Missing privacyAuditOpenBtn'); if (!html.includes('privacyAuditDialog')) throw new Error('Missing privacyAuditDialog');"`
- `05-02-PLAN.md`
  - Task 1 automated proof: `node --test tests/phase-05/empty-states.test.js`
  - Task 2 automated proof: `node --test tests/phase-05/empty-states.test.js && node --input-type=module -e "await import('./js/utils/empty-states.js'); await import('./js/views/visao-geral.js'); await import('./js/views/extrato.js'); await import('./js/views/lancamentos.js'); await import('./js/views/importar.js');" && node --input-type=module -e "import fs from 'node:fs'; const html = fs.readFileSync('./index.html', 'utf8'); for (const id of ['visaoEmptyState','extratoEmptyState','lancamentosEmptyState','importarFirstStepState']) { if (!html.includes(id)) throw new Error('Missing ' + id); }"`
- `05-03-PLAN.md`
  - Task 1 automated proof: `node --test tests/phase-05/transaction-export.test.js`
  - Task 2 automated proof: `node --test tests/phase-05/transaction-export.test.js && node --input-type=module -e "await import('./js/utils/transaction-export.js'); await import('./js/views/lancamentos.js'); await import('./js/views/extrato.js'); await import('./js/views/visao-geral.js');" && node --input-type=module -e "import fs from 'node:fs'; const html = fs.readFileSync('./index.html', 'utf8'); for (const id of ['mobileTabSelect','lancamentosExportCsvBtn']) { if (!html.includes(id)) throw new Error('Missing ' + id); } const css = fs.readFileSync('./css/styles.css', 'utf8'); if (/table\\s*\\{[^}]*min-width:\\s*720px/i.test(css)) throw new Error('Global mobile 720px table rule still present');"`
  - Task 3 is a blocking human verification checkpoint that runs only after the automated smoke in the plan’s `<verification>` section passes.

## Success-criteria mapping

Phase 5 has no formal requirement IDs in `ROADMAP.md`, so this package tracks roadmap success criteria directly:

- `P5-SC1`: covered by `05-01` through the Importar privacy audit, mixed import-history normalization, storage usage summary, and honest CDN caveat copy.
- `P5-SC2`: covered by `05-02` through first-run empty states and next-step guidance in `Visão Geral`, `Extrato`, `Lançamentos`, and `Importar`.
- `P5-SC3`: covered by `05-03` through tested CSV serialization and filtered export wiring in `Lançamentos`.
- `P5-SC4`: covered by `05-03` through mobile navigation and primary table responsiveness that removes the current overflow blockers.

## Constraint coverage

- Existing stack only:
  - All plans stay within static HTML/CSS/vanilla JS/IndexedDB/CDN libraries.
- No new privacy tab:
  - Privacy audit lives inside `Importar`, matching the research recommendation.
- Honest privacy claim:
  - Validation explicitly requires the CDN caveat for Chart.js/PDF.js.
- Prefer CSV over fake Excel:
  - Validation expects CSV/Excel-compatible wording only; no `.xlsx` claim.
- Mobile fixes target real overflow issues:
  - Validation explicitly checks the tab-strip/mobile-nav problem and removal of the global `table { min-width: 720px; }` fallback.

## Critical anti-regression notes

- Do **not** add a new top-level privacy tab.
- Do **not** claim “zero network calls” unless CDN assets are also vendored locally.
- Do **not** introduce fake `.xlsx` support.
- Do **not** leave the mobile fix as horizontal scrolling of the tab strip or primary tables.
- Do **not** bypass `js/db.js` for persistence reads/writes.
- Do **not** break the existing `window.switchTab` / `refreshDashboard` public contract while adding mobile navigation.
