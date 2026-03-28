# Architecture

## Big Picture

`gastos-dashboard` is a single-page browser app organized around one orchestrator, one IndexedDB gateway, many view modules, and several PDF parsers.

The main runtime flow is:

```text
index.html
  -> js/app.js init()
  -> openDB()
  -> seedIfEmpty(SEED_DATA)
  -> refreshDashboard()
  -> load all stores in parallel
  -> normalize data
  -> build every tab
```

## Entry Points

### HTML shell
- `index.html`
- Owns the tab layout, main panels, and inline handler names
- Defines temporary stub functions before `js/app.js` loads

### JavaScript orchestrator
- `js/app.js`
- Opens the database, loads data, computes Registrato context, and renders views
- Exposes the public `window` API used by the HTML

### Import flow entry
- `js/views/importar.js`
- Binds drag-and-drop and file input
- Detects parser profile, runs importer, updates status, then calls `window.refreshDashboard()`

## Layers and Responsibilities

### 1. Persistence layer
- File: `js/db.js`
- Sole gateway to IndexedDB
- Defines schema, CRUD helpers, clear helpers, counts, and seed behavior

### 2. Parsing layer
- Files: `js/parsers/*.js`
- `layout-profiles.js` detects file type and routes to the correct importer
- Importers parse bank- or source-specific formats and write normalized data to IndexedDB
- `pdf-utils.js` provides shared PDF extraction, hashing, date, money, and installment helpers

### 3. Utility layer
- Files: `js/utils/*.js`
- Shared pure logic and small helpers
- Includes `categorizer.js`, `dom.js`, `formatters.js`, `config-io.js`, `registrato-suggestions.js`, `dashboard-context.js`, and `transaction-tags.js`

### 4. View layer
- Files: `js/views/*.js`
- One module per tab or UI area
- Mostly receives already-loaded data and renders DOM from it
- Does not own the global data load cycle

### 5. Orchestration layer
- File: `js/app.js`
- Pulls all stores in one place, normalizes records, computes context, and initializes all views in one refresh pass

## Render and Refresh Model

The app is intentionally centralized around `refreshDashboard()` in `js/app.js`.

Important behavior:
- refreshes are serialized via `_refreshChain`
- mutations usually write to IndexedDB first
- after write/import, the app prefers full refresh over partial state mutation
- views are rebuilt from persisted state rather than treated as the source of truth

## Data Flow by Feature Area

### PDF import
`importar.js` -> `detectarLayoutProfile()` -> specific importer -> `db.js` writes -> `refreshDashboard()`

### Dashboard rendering
`app.js` loads all stores with `Promise.all()` -> normalizes records -> computes Registrato context -> calls builders in `js/views/`

### Registrato/SCR flow
Importer writes snapshots and monthly summary stores -> `registrato-suggestions.js` derives suggestions and insights -> `js/views/registrato.js` and other views consume the results

### Manual configuration flow
Forms in `assinaturas.js` and `despesas-fixas.js` write to IndexedDB -> app refreshes -> projections/cards/tables rebuild from DB state

## Architectural Boundaries That Matter

- `js/db.js` is the only persistence gateway
- `index.html` and `js/app.js` together define the contractual public UI API
- parser detection belongs in `js/parsers/layout-profiles.js`
- imported and user-provided text rendered through `innerHTML` should go through `escapeHtml()` from `js/utils/dom.js`
- the app currently favors additive modules over deep rewrites

## Practical Extension Points

- Add a new supported PDF layout by creating a dedicated parser and registering a new profile in `js/parsers/layout-profiles.js`
- Add new cross-view computed data in `js/app.js` before the view builders are called
- Add a new tab by creating a new `js/views/*.js` module, HTML container in `index.html`, and wiring it in `app.js`
- Add a new store only through `js/db.js`
