# Phase 4 Validation

## Automated validation

- `node --test tests/phase-04/categorization-engine.test.js tests/phase-04/categorization-rules.test.js tests/phase-04/categorization-memory.test.js tests/phase-04/categorization-import-apply.test.js tests/phase-04/categorization-backup-compat.test.js`
- `node --test tests/phase-01/*.test.js tests/phase-02/*.test.js tests/phase-03/*.test.js tests/phase-04/*.test.js`
- `node --input-type=module -e "await import('./js/utils/categorization-engine.js'); await import('./js/utils/full-backup-io.js');"`
- `node --input-type=module -e "await import('./js/db.js'); await import('./js/parsers/itau-fatura.js'); await import('./js/parsers/nubank-fatura.js'); await import('./js/parsers/itau-conta.js'); await import('./js/parsers/nubank-conta.js'); await import('./js/views/lancamentos.js');"`
- `node --input-type=module -e "globalThis.window = {}; globalThis.document = { body: { innerHTML: '' }, getElementById(){ return null; }, querySelectorAll(){ return []; } }; await import('./js/app.js');"`
- `node --input-type=module -e "import fs from 'node:fs'; const html = fs.readFileSync('./index.html', 'utf8'); if (!html.includes('lancamentosCategorizationPanel')) throw new Error('Missing lancamentosCategorizationPanel'); if (!html.includes('lancamentosCategorizationDialog')) throw new Error('Missing lancamentosCategorizationDialog');"`

## Manual validation

1. Open the app locally with real PDFs available for at least one matching import scenario.
2. Go to `Lançamentos` and confirm the smart-categorization helper panel appears between the existing context panel and the filters.
3. Confirm the helper panel explains precedence in this exact order: remembered correction → explicit rule → default categorizer → `Outros`.
4. Click `Gerenciar regras` and confirm the rules UI opens as a dialog inside `Lançamentos`, not as a new top-level tab.
5. Create an explicit rule and confirm it appears in the rules list with the chosen category/scope.
6. Refresh or switch tabs and confirm existing history is **not** bulk-recategorizado just because the new rule exists.
7. Run `Limpar dados importados` and confirm imported rows disappear but rule/memory counts remain visible afterward.
8. Import a real matching PDF and confirm the matching row lands with the explicit rule category.
9. Manually change the imported row category via edit or convert flow and save.
10. Confirm that manual category change did not auto-promote `tipo_classificado` / `classificado_nome` into learned categorization behavior beyond the explicit conversion already chosen.
11. Run `Limpar dados importados` again and re-import a real matching PDF.
12. Confirm the remembered manual category now wins over the explicit rule and the default categorizer.
13. Edit, reorder, disable, and delete an explicit rule; confirm each action updates the dialog list and future import behavior accordingly.
14. Export a full backup after at least one rule and one remembered correction exist.
15. Run `Apagar a base completa` and confirm both categorization stores are gone.
16. Restore the full backup from step 14 and confirm rules/memory return.
17. If a pre-Phase-4 backup is available, restore it and confirm the app loads with empty categorization stores instead of failing restore. If none is available, rely on automated compatibility coverage.
18. Final sanity check: parser extraction, dedupe, replacement, and imported-file tracking still feel intact; only categorization behavior and the new in-tab management UI changed.

## Nyquist coverage

Nyquist validation is enabled for this repo, so every code-producing task in Phase 4 has an automated proof path before browser approval:

- `04-01-PLAN.md`
  - Task 1 automated proof: `node --test tests/phase-04/categorization-engine.test.js tests/phase-04/categorization-rules.test.js tests/phase-04/categorization-memory.test.js tests/phase-04/categorization-import-apply.test.js tests/phase-04/categorization-backup-compat.test.js`
  - Task 2 automated proof: same suite must pass after implementing the pure engine and backup normalization helper
- `04-02-PLAN.md`
  - Task 1 automated proof: `node --input-type=module -e "await import('./js/db.js'); await import('./js/utils/categorization-engine.js'); await import('./js/utils/full-backup-io.js'); await import('./js/parsers/itau-fatura.js'); await import('./js/parsers/nubank-fatura.js'); await import('./js/parsers/itau-conta.js'); await import('./js/parsers/nubank-conta.js');" && node --test tests/phase-01/*.test.js tests/phase-02/*.test.js tests/phase-03/*.test.js tests/phase-04/*.test.js`
  - Task 2 automated proof: `node --input-type=module -e "await import('./js/views/lancamentos.js');" && node --input-type=module -e "import fs from 'node:fs'; const html = fs.readFileSync('./index.html', 'utf8'); if (!html.includes('lancamentosCategorizationPanel')) throw new Error('Missing lancamentosCategorizationPanel'); if (!html.includes('lancamentosCategorizationDialog')) throw new Error('Missing lancamentosCategorizationDialog');" && node --test tests/phase-01/*.test.js tests/phase-02/*.test.js tests/phase-03/*.test.js tests/phase-04/*.test.js`
- `04-03-PLAN.md`
  - Blocking human verification occurs only after the automated smoke commands listed in the plan’s `<verification>` section pass.

## Requirement mapping

- `CATG-01`: covered by rule-ordering tests, DB-backed `categorizacao_regras`, in-tab `Lançamentos` rules dialog, and manual verification of create/edit/reorder/disable/delete behavior.
- `CATG-02`: covered by precedence tests, importer integration through the shared engine, metadata on imported rows, and manual verification that explicit rules apply to future imports before fallback default categorization.
- `CATG-03`: covered by deterministic memory-record tests, category-only remembered-correction writes from edit/convert flows, future-import precedence tests, and manual verification that remembered manual category changes win on reimport.

## Locked decision coverage

- `D-01` Add a new pure shared module `js/utils/categorization-engine.js`
  - Planned in `04-01` Task 2 and smoke-validated in `04-03`.
- `D-02` Add two stores in `js/db.js`: `categorizacao_regras` and `categorizacao_memoria`
  - Planned in `04-02` Task 1 and validated through clear/restore checks.
- `D-03` Precedence must be remembered correction > explicit user rule > default categorizer > `Outros`
  - Planned in `04-01` tests + engine, wired in `04-02`, verified in `04-03`.
- `D-04` Rules management UI lives inside the `Lançamentos` tab via helper panel + dialog
  - Planned in `04-02` Task 2 and manually verified in `04-03`.
- `D-05` Manual learning remembers category only; never auto-learn `tipo_classificado` / `classificado_nome`
  - Planned in `04-01` tests + helpers, implemented in `04-02` write paths, verified in `04-03`.
- `D-06` Importers load categorization runtime once per file and apply the shared engine before persistence
  - Planned in `04-02` Task 1 and smoke-validated in `04-03`.
- `D-07` `clearAllImported()` preserves rules/memory; `clearAllData()` clears them
  - Planned in `04-02` Task 1 and manually verified in `04-03`.
- `D-08` Backup restore remains compatible with older backups missing the new stores by defaulting them to `[]`
  - Planned in `04-01` backup-compat tests and helper, wired in `04-02`, validated automatically and manually in `04-03`.
- `D-09` Avoid mutating `REGRAS` with user data
  - Planned in `04-01` immutability tests and pure engine implementation.
- `D-10` Existing parser extraction/dedupe logic must stay intact; only categorization callsites change
  - Planned in `04-01` importer-apply tests, implemented in `04-02` importer wiring, sanity-checked in `04-03`.
- `D-11` Learning applies to future imports and explicit manual corrections; do not recategorize all history on refresh
  - Planned in `04-02` write-path/UI behavior and manually verified in `04-03`.

## Backup + clear behavior coverage

These are first-class deliverables for Phase 4, not side notes:

- Older backups missing only `categorizacao_regras` / `categorizacao_memoria` must normalize to `[]`
- Missing legacy stores like `lancamentos` must still fail restore validation
- `Limpar dados importados` must preserve categorization knowledge
- `Apagar a base completa` must remove categorization knowledge
- Full backup export/restore must round-trip categorization stores when they exist

## Critical anti-regression notes

- Do **not** mutate `REGRAS` from `js/utils/categorizer.js` with user data.
- Do **not** recategorize all existing history on refresh; Phase 4 is future-import learning plus explicit manual corrections.
- Do **not** auto-learn `tipo_classificado` / `classificado_nome`.
- Do **not** weaken current parser extraction, fingerprinting, dedupe, replacement, or `pdfs_importados` behavior.
- Do **not** move rules management into a new top-level tab.
- Do **not** treat backup compatibility as optional polish; it is a release gate for this phase.
