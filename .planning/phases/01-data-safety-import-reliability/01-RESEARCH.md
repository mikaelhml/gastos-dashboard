# Phase 1 Research — Data Safety & Import Reliability

## Scope

Phase 1 covers `DATA-01`, `DATA-02`, and `DATA-03` from `.planning/REQUIREMENTS.md`, plus the roadmap success criterion that each imported file should expose clear trust feedback in the current Importar flow.

The goal is to make imported data trustworthy before Phase 2 adds analytics on top of it.

## Verified findings from the current codebase

### 1. Card-bill reimport is currently unsafe

Both bill parsers delete every `lancamentos` row for the billing month before reinserting parsed rows:

- `js/parsers/nubank-fatura.js`
- `js/parsers/itau-fatura.js`

Current behavior is month-scoped, not source-scoped:

```javascript
const todos = await getAll('lancamentos');
for (const item of todos) {
  if (item.fatura === mesFatura) {
    await deleteItem('lancamentos', item.id);
  }
}
```

This can remove unrelated same-month data and is the main Phase 1 integrity risk.

### 2. Full backup does not exist yet

`js/utils/config-io.js` exports and restores only manual configuration data:

- `assinaturas`
- `despesas_fixas`

It is not a complete dataset backup and cannot recover imported transactions, PDFs, Registrato state, notes, or budgets.

### 3. The database already has a clear full-backup surface

`js/db.js` defines 12 current stores:

- `assinaturas`
- `observacoes`
- `despesas_fixas`
- `lancamentos`
- `extrato_transacoes`
- `extrato_summary`
- `pdfs_importados`
- `orcamentos`
- `assinatura_sugestoes_dispensa`
- `registrato_sugestoes_dispensa`
- `registrato_scr_snapshot`
- `registrato_scr_resumo_mensal`

This makes a versioned "snapshot all stores / validate / replace all stores" flow feasible without changing the stack.

### 4. The Importar tab is the right Phase 1 UI surface

`js/views/importar.js` already owns:

- import progress cards
- import result messages
- base status cards
- config export/import buttons
- destructive clear actions

That makes it the natural place to add:

- full backup export/import
- import quality badges
- warnings panels

without creating a new tab.

### 5. The repo has no automated app test harness, but pure helper tests are feasible

There is no project build, lint, or browser automation setup. However, Phase 1 can still add focused regression coverage by keeping new logic in pure helper modules that run under:

```bash
node --test --experimental-default-type=module
```

This is the safest path for validating replacement planning, backup payload validation, and import-feedback formatting.

## Recommended implementation shape

### Wave 1

1. Safe reimport + duplicate handling for card-bill parsers.
2. Full-dataset backup/restore backend with validation.

These can proceed in parallel because one targets parser integrity and the other targets recovery infrastructure.

### Wave 2

3. Importar-tab wiring for trust feedback and full backup/restore actions.

This should depend on Wave 1 so the UI can consume the final parser diagnostics and backup helpers instead of inventing placeholder contracts.

## Key design decisions

- Keep the current stack: vanilla JS ES modules, IndexedDB, browser APIs.
- Do not add Dexie, backend services, build tooling, or schema-migration frameworks for Phase 1.
- Keep new metadata additive on `lancamentos`; do not break existing view contracts.
- Keep full backup separate from the existing config-only JSON flow so users can still manage manual configuration independently.
- Prefer deterministic helper functions that can be tested outside the browser.

## Risks to control during execution

- Legacy rows in `lancamentos` may lack provenance metadata; replacement logic should be conservative for ambiguous cases.
- Restore must validate the payload before any destructive store clearing begins.
- Import feedback must degrade gracefully for importers that do not yet have row-level diagnostics.
- Existing HTML `window` contracts and refresh flow must remain intact.

## Suggested phase decomposition

- `01-01-PLAN.md`: source-safe reimport and duplicate-aware card-bill imports
- `01-02-PLAN.md`: versioned full backup / restore backend
- `01-03-PLAN.md`: Importar UI for backup/restore and trust feedback
