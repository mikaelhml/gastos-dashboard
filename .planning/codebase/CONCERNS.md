# Concerns

## 1. Re-import scope bug in `nubank-fatura.js`

This is the strongest verified data-integrity concern in the current code.

In `js/parsers/nubank-fatura.js`, reimport logic deletes all `lancamentos` whose `fatura` matches the imported month:
- `if (item.fatura === mesFatura) { await deleteItem('lancamentos', item.id); }`

Because the delete is scoped only by month string, reimporting one card bill can remove records from another source that shares the same billing month.

## 2. Broad content detection for Itaú-like card PDFs

`js/parsers/layout-profiles.js` matches `itau-fatura` on broad tokens like `VISA`, `MASTERCARD`, `BLACK`, `SIGNATURE`, and `INFINITE`.

That makes false positives possible if a new bank layout is introduced without tightening the matcher.

## 3. PDF import depends on remote PDF.js URLs

`js/parsers/pdf-utils.js` loads PDF.js and its worker from CDN URLs. This keeps the repo simple, but it also means PDF import depends on those remote assets being reachable.

That is a practical concern for a project whose value proposition emphasizes local processing.

## 4. Full backup is not implemented yet

The repo already has JSON config import/export in `js/utils/config-io.js`, but that covers manual configuration data rather than the full IndexedDB dataset.

A browser profile reset or accidental data clearing can still wipe imported financial history.

## 5. No automated parser or regression tests

The repo has no automated tests today. Parser stability, categorization accuracy, and schema changes rely on manual browser verification.

This makes refactors in `js/parsers/`, `js/utils/categorizer.js`, and `js/db.js` higher risk than they would be in a tested codebase.

## 6. Schema evolution is additive only right now

`js/db.js` `onupgradeneeded` creates missing stores, but does not define a richer migration story for reshaping existing stores or adding indexes to already-populated data.

That is fine for additive store creation, but future structural changes need deliberate migration handling.

## 7. In-memory filtering and aggregation can become heavy

The current app loads stores with `getAll()` and then filters, sorts, and aggregates in memory. That keeps the architecture simple, but large histories may eventually make transaction-heavy tabs or future analytics slower.

## 8. Session-scoped PDF password cache

`js/parsers/pdf-utils.js` keeps a cached PDF password in module scope for reuse across imports in the same session. This improves UX, but it also means password lifecycle is implicit and not user-visible.

## 9. Heuristic quality directly affects trust

Category rules, layout detection, and Registrato suggestions are all heuristic-heavy. Small changes in rule order or parser assumptions can produce believable but wrong financial output.

For this project, wrong data is more dangerous than missing data, so safety and explainability should outrank feature breadth.
