# Phase 3 Validation

## Automated validation

- `node --test tests/phase-03/projection-model.test.js tests/phase-03/projection-conflicts.test.js tests/phase-03/parcelamento-summary.test.js`
- `node --test tests/phase-01/*.test.js tests/phase-02/*.test.js tests/phase-03/*.test.js`
- `node --input-type=module -e "await import('./js/utils/projection-model.js'); await import('./js/utils/parcelamento-summary.js'); await import('./js/views/projecao.js');"`
- `node --input-type=module -e "globalThis.window = {}; globalThis.document = { body: { innerHTML: '' }, getElementById(){ return null; }, querySelectorAll(){ return []; } }; await import('./js/app.js');"`
- `node --input-type=module -e "import fs from 'node:fs'; const html = fs.readFileSync('./index.html', 'utf8'); if (!html.includes('projecaoScrPanel')) throw new Error('Missing projecaoScrPanel container'); if (!html.includes('SCR incluído')) throw new Error('Missing SCR incluído surface in projection HTML');"`

## Manual validation

1. Open the app locally with imported Registrato/SCR data and at least one month of manual fixed expenses and/or parcelamentos present.
2. Go to `Projeção` and confirm a dedicated SCR commitments section appears before the scenarios and before the projection table.
3. Confirm the section explicitly distinguishes `included`, `conflict`, and `contextual-only`.
4. Confirm aggregated or weak SCR evidence is shown as context and is not injected into the projection math.
5. Confirm any likely overlap with a manual fixed expense or financing item is shown as an explicit conflict and is not auto-included.
6. Change the horizon (`6`, `12`, `24` meses), recalculate, and confirm the projection table exposes a separate `SCR incluído` bucket.
7. Confirm ended parcelamentos/financiamentos stop affecting future months instead of remaining flat across the full horizon.
8. Confirm the monthly result banner and charts reflect included SCR impact only.
8a. Confirm the scenario cards and `Ponto de Equilíbrio` do not contradict the month-by-month table after Phase 3 wiring; they must either use the same SCR-aware/payoff-aware math or be explicitly labeled as informational only.
9. Confirm Projeção shows only compact financing/installment impact plus shortcuts, while the detailed payoff tracker remains in `Despesas & Parcelas`.
10. Use the shortcuts to open `Despesas & Parcelas` and `Registrato` and confirm tab navigation still works.
11. Confirm no card-bucket-risk SCR item feels auto-added on top of the manually entered `Fatura do cartão/mês`.

## Nyquist coverage

Nyquist validation is enabled for this repo, so every executable code-producing task in this phase has an automated proof path before manual approval:

- `03-01-PLAN.md`
  - Task 1 automated proof: `node --test tests/phase-03/projection-model.test.js tests/phase-03/projection-conflicts.test.js tests/phase-03/parcelamento-summary.test.js`
  - Task 2 automated proof: same suite must pass after implementation
- `03-02-PLAN.md`
  - Task 1 automated proof: `node --input-type=module -e "globalThis.window = {}; globalThis.document = { body: { innerHTML: '' }, getElementById(){ return null; }, querySelectorAll(){ return []; } }; await import('./js/app.js');" && node --test tests/phase-01/*.test.js tests/phase-02/*.test.js tests/phase-03/*.test.js`
  - Task 2 automated proof: `node --input-type=module -e "await import('./js/utils/projection-model.js'); await import('./js/utils/parcelamento-summary.js'); await import('./js/views/projecao.js');" && node --test tests/phase-01/*.test.js tests/phase-02/*.test.js tests/phase-03/*.test.js`
- `03-03-PLAN.md`
  - Blocking human verification occurs only after the automated smoke commands listed in the plan’s `<verification>` section pass.

## Requirement mapping

- `PROJ-01`: covered by the pure SCR inclusion/conflict model, month-aware projection schedule, centralized app wiring, and browser verification that only safe included commitments enter the projection math.
- `PROJ-02`: covered by the dedicated SCR commitments section, explicit status labels, separate `SCR incluído` output bucket, compact tracker-impact summary, and browser verification that users can understand what is influencing the projection.

## Locked decision coverage

- `D-01` Hybrid auto-inclusion only with good evidence:
  - Planned in `03-01` helper contracts and `03-02` refresh wiring / projection math.
- `D-02` Aggregated or weak evidence stays contextual:
  - Planned in `03-01` classification tests and `03-02` SCR status rendering.
- `D-03` Manual overlap becomes explicit conflict:
  - Planned in `03-01` conflict tests/model and verified manually in `03-03`.
- `D-04` Avoid double counting over maximizing coverage:
  - Planned in `03-01` conservative inclusion rules, especially card-bucket-risk downgrade.
- `D-05` Dedicated SCR commitments section before the projection table:
  - Planned in `03-02` HTML/view work and verified in `03-03`.
- `D-06` At least three states in that section:
  - Planned in `03-02` rendering and verified in `03-03`.
- `D-07` Detailed tracker stays in `Despesas & Parcelas`:
  - Planned via `parcelamento-summary` helper and verified in `03-03`.
- `D-08` `Projeção` shows only summary/impact plus shortcut:
  - Planned in `03-02` compact tracker-impact panel and verified in `03-03`.

## Critical anti-regression note

Do **not** treat `buildRegistratoSuggestions()` output as the projection source for this phase. That filtered output is appropriate for suggestion cards, but it would hide conflicts, dismissed items, and contextual-only SCR rows that Phase 3 must surface explicitly to remain trustworthy.
