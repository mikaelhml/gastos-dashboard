# Structure

## Repository Layout

```text
gastos-dashboard/
  index.html
  404.html
  serve.bat
  README.md
  css/
    styles.css
  js/
    app.js
    db.js
    seed.js
    parsers/
    utils/
    views/
```

## Top-Level Files

- `index.html` - application shell, tab buttons, tab panels, inline handler contracts
- `404.html` - GitHub Pages fallback page
- `serve.bat` - local server helper for Windows
- `README.md` - product and local run documentation

## `css/`

- `css/styles.css` - global styling for the whole app

## `js/`

### Core files
- `js/app.js` - startup flow, global refresh, view composition, `window` API
- `js/db.js` - IndexedDB schema and persistence helpers
- `js/seed.js` - intentionally empty in the public repo

### `js/parsers/`
Bank/source-specific import logic and shared PDF helpers.

Key files:
- `js/parsers/pdf-utils.js`
- `js/parsers/layout-profiles.js`
- `js/parsers/nubank-conta.js`
- `js/parsers/nubank-fatura.js`
- `js/parsers/itau-conta.js`
- `js/parsers/itau-fatura.js`
- `js/parsers/registrato-scr.js`

### `js/utils/`
Shared helpers and domain logic.

Key files:
- `js/utils/formatters.js`
- `js/utils/dom.js`
- `js/utils/categorizer.js`
- `js/utils/config-io.js`
- `js/utils/registrato-suggestions.js`
- `js/utils/dashboard-context.js`
- `js/utils/transaction-tags.js`

### `js/views/`
UI rendering and interaction handlers per tab.

Current notable files:
- `js/views/visao-geral.js`
- `js/views/assinaturas.js`
- `js/views/despesas-fixas.js`
- `js/views/parcelamentos.js`
- `js/views/lancamentos.js`
- `js/views/extrato.js`
- `js/views/projecao.js`
- `js/views/registrato.js`
- `js/views/importar.js`

## Naming Patterns

- files use kebab-case: `visao-geral.js`, `layout-profiles.js`
- exported functions usually use camelCase or verb-first Portuguese names
- store names use lowercase with underscores: `extrato_transacoes`, `despesas_fixas`

## Where to Change Things

- schema or stores -> `js/db.js`
- startup / refresh / cross-view computed context -> `js/app.js`
- PDF routing -> `js/parsers/layout-profiles.js`
- bank-specific parsing -> matching file in `js/parsers/`
- HTML sanitization -> `js/utils/dom.js`
- categorization heuristics -> `js/utils/categorizer.js`
- import UX -> `js/views/importar.js`
- projection behavior -> `js/views/projecao.js`

## Structural Rules Worth Preserving

- do not introduce a framework layer on top of the current module layout
- do not bypass `db.js` from view modules
- do not put parser-specific branching into unrelated views
- prefer adding isolated modules over expanding `index.html` or `app.js` unnecessarily
