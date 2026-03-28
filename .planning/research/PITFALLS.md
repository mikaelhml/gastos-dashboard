# Research: Pitfalls

## 1. Solving the wrong problem first

The current approved scope is about trust, analytics clarity, and user-controlled categorization. Large stack changes or speculative new libraries would create churn before those user-facing problems are solved.

**Avoid:** framework migrations, DB wrapper replacement, or chart-library replacement before the approved v1 is delivered.

## 2. Building analytics on top of unsafe import behavior

A verified reimport issue exists in `js/parsers/nubank-fatura.js`, where deletion is scoped only by `fatura` month.

If that is not fixed first, any analytics built later can be silently based on missing data.

**Plan implication:** data safety comes before trend analysis.

## 3. Overstating the backup gap

The project does have JSON config import/export for manual configuration in `js/utils/config-io.js`. The real gap is that there is no full-dataset backup for imported financial history and other stores.

**Avoid:** treating the repo as if it has zero export capability.

## 4. Turning category trends into a data-model rewrite

The approved analytics scope can likely be delivered from existing loaded data and pure aggregation helpers.

**Avoid:** assuming category trends require a new DB abstraction, cache store, or major migration before proving that with real performance pain.

## 5. Letting heuristic changes overwrite user intent

Any new categorization rule system must respect future user control.

**Avoid:** designs where recategorization rewrites user-corrected categories without a clear override model.

## 6. Mixing manual and automatic projection inputs without explanation

If Registrato/SCR commitments begin affecting projections, the UI must explain which values are manual and which are inferred.

**Avoid:** silently changing projection behavior in a way that makes users distrust the numbers.

## 7. Research drift from approved scope

The generated research initially drifted toward broader ideas like OCR fallback, richer plotting libraries, Dexie migration, and spreadsheet export.

Those may still be valid later, but they should not reshape the immediate milestone now that the user has already selected a narrower v1.

## 8. False confidence from browser-only manual testing

Because the repo has no automated tests, parser and categorization changes can look correct with one PDF and still regress elsewhere.

**Avoid:** shipping parser or rules changes without testing the exact affected flows in the browser with representative files.
