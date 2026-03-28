# Testing and Verification

## Current State

There is no automated test suite, no single-test command, no lint command, and no CI-defined verification flow in this repository.

## What Exists Today

Validation is manual and browser-based:
- run the app locally with `python -m http.server 8080` or `serve.bat`
- open `http://localhost:8080`
- exercise the tabs with an empty IndexedDB state
- import real or sample PDFs and inspect results in the UI
- check browser console when a parser returns no data or malformed output

## Manual Verification Areas

### Startup and baseline
- app loads with empty local data
- tabs switch correctly
- no immediate console crashes on startup

### PDF import
- each supported profile is detected correctly
- duplicate PDF import is blocked through `pdfs_importados`
- import status cards are shown in `js/views/importar.js`
- imported data becomes visible after `refreshDashboard()`

### Manual CRUD
- add / edit / remove subscriptions and fixed expenses
- values persist after reload
- projections and summary cards reflect updates

### Registrato/SCR flow
- imported SCR data appears in the Registrato tab
- suggestions and context panels update in other tabs

### Config JSON flow
- `exportConfig()` downloads a JSON file
- `importConfig()` restores manual settings data
- imported settings trigger dashboard refresh

## High-Risk Areas Because There Are No Tests

- bank parser regressions in `js/parsers/*.js`
- categorization behavior in `js/utils/categorizer.js`
- Registrato heuristics in `js/utils/registrato-suggestions.js`
- schema changes in `js/db.js`
- rendering regressions caused by `innerHTML` templates in view modules

## Useful Manual Regression Checklist After Changes

1. Start app with clean local DB
2. Import at least one supported PDF type you touched
3. Reimport the same file to confirm duplicate handling still works
4. Verify the affected tab and one unrelated tab still render
5. Check console for parser or rendering errors
6. Reload the page and verify persisted state is still consistent

## Testing Guidance for Future Work

If automated tests are added later, the best starting targets are pure helpers and parser text-to-record logic rather than DOM-heavy modules.
