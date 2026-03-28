# Copilot Instructions — Dashboard de Gastos Pessoais

## Build, test, and lint commands

Run the app from the repository root with an HTTP server because native ES Modules do not work via `file://`:

```bash
python -m http.server 8080
```

Windows helper:

```bat
serve.bat
```

`serve.bat` falls back to `python3 -m http.server 8080` and then `npx serve -l 8080 .` if needed. Open `http://localhost:8080`.

There is no build step, package install, automated test suite, single-test command, or lint command in this repository.

## High-level architecture

This is a static GitHub Pages app: `index.html` + `css/styles.css` + native ES modules under `js/`. There is no backend, framework, bundler, or transpilation layer.

`index.html` owns the shell, tab markup, and inline handler names. It defines temporary stub functions before the module loads, so public function names exported later by `js/app.js` are part of the HTML contract.

`js/app.js` is the orchestrator. Startup flow is `openDB()` → `seedIfEmpty(SEED_DATA)` → `refreshDashboard()`. It loads all stores in parallel, normalizes imported records, computes Registrato suggestions/insights, renders every tab, and exposes the public `window` API used by the HTML.

`js/db.js` is the only persistence gateway. The IndexedDB database is `gastos_db_public` at version `5`. All reads/writes should go through helpers in this file; do not access `indexedDB` directly from views or parsers. `onupgradeneeded` creates missing stores, so schema changes must be expressed here.

The render pipeline is centralized in `app.js`: data is fetched once, then passed into builders in `js/views/*.js`. Views are mostly renderers and interaction handlers for a single tab. They do not own data loading; after a mutation/import they rely on `window.refreshDashboard()` to rebuild the UI from persisted state.

PDF import is routed through `js/parsers/layout-profiles.js`. Detection order is `matchFileName` first, then `matchContent` using normalized extracted text from the first pages. Each profile points to a dedicated importer (`nubank-conta`, `nubank-fatura`, `itau-conta`, `itau-fatura`, `registrato-scr`), so new banks/layouts should be added as new profile+parser pairs instead of patching existing contracts.

`js/parsers/pdf-utils.js` is the shared PDF foundation: PDF.js loading, password reuse, SHA-256 hashing, text extraction, BRL/date helpers, and parcel extraction. Importers use it to deduplicate files through the `pdfs_importados` store before writing parsed data.

Registrato/SCR is a first-class flow, not just an import side feature. The parser writes to `registrato_scr_snapshot` and `registrato_scr_resumo_mensal`; `js/utils/registrato-suggestions.js` derives suggestions and insights; `js/views/registrato.js` renders the dedicated tab; and `dashboard-context.js` injects SCR context into other tabs.

## Key conventions

- Keep the stack fixed: vanilla JS ES modules, IndexedDB, Chart.js via CDN, PDF.js via CDN. Do not add frameworks, backend services, build tooling, or `localStorage`.
- `js/seed.js` must stay empty in the public version. The repo should not ship personal data or real seeds.
- `refreshDashboard()` in `js/app.js` serializes refreshes with `_refreshChain`. After changing persisted data, prefer `window.refreshDashboard()` over partial manual rerenders.
- The public `window` API is contractual because `index.html` calls it inline. Current names are `switchTab`, `filterLancamentos`, `sortLancamentosBy`, `clearLancamentosFilters`, `filterExtrato`, `clearExtratoFilters`, `recalcularProjecao`, `clearBase`, `clearAllDashboardData`, `refreshDashboard`, `selectEmoji`, `syncEmojiPicker`, and `toggleEmojiPicker`.
- Views render with `innerHTML`. Any user/imported text inserted into markup should be escaped with `escapeHtml()` from `js/utils/dom.js`.
- Filters in the `lancamentos` and `extrato` tabs operate on the already-rendered DOM, not by re-querying IndexedDB.
- `js/db.js` stores are the source of truth. Current schema includes manual data (`assinaturas`, `observacoes`, `despesas_fixas`, `orcamentos`), imported banking data (`lancamentos`, `extrato_transacoes`, `extrato_summary`, `pdfs_importados`), and suggestion/Registrato state (`assinatura_sugestoes_dispensa`, `registrato_sugestoes_dispensa`, `registrato_scr_snapshot`, `registrato_scr_resumo_mensal`).
- `clearAllImported()` is intentionally narrower than `clearAllDashboardData()`: it clears imported banking/Registrato data but preserves manual configuration like `assinaturas` and `despesas_fixas`.
- Category heuristics and Registrato suggestions are order-sensitive. When changing keyword/product/institution rules, preserve evaluation order and prefer adding isolated cases over broadening existing ones.
- The current parser hot spot is `js/parsers/itau-fatura.js`, especially Uniclass/Signature variants and OCR-broken layouts. Keep fixes isolated to the Itaú profile/parser flow instead of weakening global PDF parsing.
- CDN versions are intentionally fixed in source (`Chart.js 4.4.1`, `PDF.js 4.2.67`). Treat upgrades as behavior changes that need browser validation.
