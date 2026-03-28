# Research: Stack Guidance

## Recommendation for the Current Approved Scope

No mandatory stack change is required to deliver the currently selected v1:
- safe reimport / dedup improvements
- full JSON backup and restore
- category trends over time
- SCR/Registrato feeding real projection values
- editable categorization rules with correction memory

The existing stack is already capable of delivering that scope:
- Vanilla JS ES modules
- IndexedDB via `js/db.js`
- Chart.js for charts already in the app
- PDF.js for current PDF parsing flow

## What To Keep

- Keep the app static and browser-only
- Keep native ES modules
- Keep IndexedDB as the only persistence layer
- Keep Chart.js for the current style of trend and comparison charts
- Keep the existing `js/app.js` refresh-driven composition model

## What Is Reasonable For This Milestone

### Native JSON backup/restore
For the approved v1, use native browser APIs and existing DB helpers rather than adding a file-export library.

### Additive helper modules
If the trend work needs more structure, add small pure modules under `js/utils/` or a focused `js/analytics/` directory. This is optional architecture, not a required stack migration.

### One new store only when needed
For custom category rules and correction memory, a small new IndexedDB store is reasonable. No broader DB abstraction is required yet.

## What Should Not Be Introduced Prematurely

These may be worth revisiting later, but they are not required for the approved scope and would currently add churn:
- Dexie.js migration
- Observable Plot
- Fuse.js
- Tesseract.js OCR fallback
- SheetJS / spreadsheet export
- any framework or bundler

## Later Evaluation Candidates

Only revisit these if the project proves it needs them with real data:

- local PDF.js vendoring or same-origin worker fallback if CDN dependency becomes a real operational issue
- OCR fallback only if real user PDFs are image-based rather than text-based
- richer charting only if Chart.js becomes a real limitation for approved analytics views
- indexed query abstractions only if full-store scans become observably slow

## Guardrails

For this repo, stack stability is part of product stability. The safest path is to solve the selected v1 mostly inside the current architecture before introducing new libraries.
