# Conventions

## Product and Stack Rules

- Keep the project local-first and browser-only
- Do not add backend dependencies for the core financial flow
- Do not replace IndexedDB with `localStorage`
- Keep `js/seed.js` empty in the public version
- Treat Chart.js and PDF.js versions as fixed unless validated in the browser

## Persistence Conventions

- All reads and writes go through `js/db.js`
- Schema changes belong in `js/db.js` `STORE_DEFS` and `onupgradeneeded`
- Imported data and manual data are stored separately and then recomposed during refresh
- `clearAllImported()` is intentionally narrower than `clearAllData()`

## Refresh Conventions

- Prefer `window.refreshDashboard()` after persistence changes
- Do not make views the source of truth for application data
- Respect `_refreshChain` in `js/app.js`; do not add parallel refresh paths casually

## Public HTML Contract

`index.html` calls public handlers inline. These names are contractual and must stay aligned with `js/app.js`:

- `switchTab`
- `filterLancamentos`
- `sortLancamentosBy`
- `clearLancamentosFilters`
- `filterExtrato`
- `clearExtratoFilters`
- `recalcularProjecao`
- `clearBase`
- `clearAllDashboardData`
- `refreshDashboard`
- `selectEmoji`
- `syncEmojiPicker`
- `toggleEmojiPicker`

## Rendering Conventions

- Views frequently render with `innerHTML`
- Any imported or user-controlled text inserted into markup should be escaped with `escapeHtml()` from `js/utils/dom.js`
- Filters in transaction views mostly operate on already-loaded in-memory data or rendered DOM, not new DB queries

## Parser Conventions

- Add new banks/layouts as new parser + new profile pairs
- Do not weaken existing parsers to handle many unrelated layouts if a dedicated parser is cleaner
- Detection order in `js/parsers/layout-profiles.js` is filename first, then content sample
- Shared PDF behavior belongs in `js/parsers/pdf-utils.js`

## Heuristic Conventions

- `js/utils/categorizer.js` is order-sensitive; more general rules can shadow specific ones
- Registrato and categorization heuristics should be changed carefully and with real sample validation
- Installment extraction currently relies on parser and shared text helpers rather than a dedicated normalized analytics layer

## Naming and Module Style

- file names use kebab-case
- functions use camelCase / Portuguese verb-first names
- named exports are preferred over default exports
- relative imports are used throughout; no path aliases exist

## Current Validation Reality

- no automated tests or linting are configured
- browser validation is the real safety net today
- parser diagnostics often go to the browser console during debugging
