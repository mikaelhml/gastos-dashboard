# Phase 4: Smart Categorization - Research

**Researched:** 2026-03-28  
**Domain:** Local-first transaction categorization, learned rules, and import-time classification in a static IndexedDB app  
**Confidence:** HIGH

## User Constraints

- Static local-first app only; no backend, framework, or build step
- IndexedDB remains the only persistence layer and all reads/writes must go through `js/db.js`
- `js/app.js` owns the refresh/render pass
- Current default categorization lives in `js/utils/categorizer.js` and is order-sensitive
- Importers currently call `categorizar(desc)` directly during parsing for both card and account rows
- Manual conversions today write `tipo_classificado` / `classificado_nome`, but do not teach future imports
- Brownfield contracts should be preserved: tabs, refresh model, public `window` API, and current parser structure
- User is unavailable; decisions should optimize for safety, minimal regression risk, and maintainability

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CATG-01 | User can create, edit, and remove custom categorization rules for imported transactions | Add a dedicated rules UI in the `Lançamentos` flow, backed by a new `categorizacao_regras` store with explicit CRUD and ordering |
| CATG-02 | User-defined categorization rules are applied to future imports before fallback default categorization rules | Introduce a shared categorization engine with fixed precedence and call it from all four importers before persistence |
| CATG-03 | Manual category correction is remembered and reused automatically on future matching transactions | Add a separate `categorizacao_memoria` store and write to it whenever a user manually changes category in edit/convert flows |

</phase_requirements>

## Summary

The safest Phase 4 design is **not** to rewrite the current parsers, and **not** to make categorization dynamic at render time. Keep the existing parser responsibilities intact: parse bank-specific PDFs into normalized rows, then run a **single shared categorization engine** just before rows are persisted. That preserves import integrity, keeps the current dedupe/replacement logic untouched, and avoids spreading precedence logic across four parser files.

Use **two new IndexedDB stores**, not one mixed store. Explicit user rules and remembered corrections have different behavior, different specificity, and different lifecycle. User rules are broad, ordered, and fully CRUD-managed. Remembered corrections are narrow, exact, and auto-created from manual category edits. Keeping them separate makes precedence simple, UI clearer, and accidental overreach less likely.

**Primary recommendation:** Add a pure `categorization-engine` module, back it with `categorizacao_regras` + `categorizacao_memoria`, apply it once per importer before DB writes, and manage rules from a dedicated dialog launched inside the `Lançamentos` tab.

## Direct Answers to the Requested Questions

### 1. Safest architecture
Use a **central categorization engine** invoked by importers **after parsing** and **before persistence**. Do not let each parser invent its own override logic. Do not recategorize history on refresh.

Recommended split:

- `js/utils/categorizer.js`  
  Keep as the default fallback keyword categorizer
- `js/utils/categorization-engine.js`  
  New pure module that resolves:
  - remembered correction
  - explicit user rule
  - default categorizer
  - fallback `Outros`
- `js/views/categorization-rules.js`  
  New UI module for rule management and learned-memory inspection
- `js/db.js`  
  Add the two new stores and backup/clear semantics
- `js/views/lancamentos.js`  
  When user manually changes a category, upsert a remembered correction
- Parsers  
  Keep current structure, but replace direct `categorizar(desc)` usage with the shared engine

### 2. Should custom rules live in a new store?
Yes. Use **two** new stores:

- `categorizacao_regras`
- `categorizacao_memoria`

Do **not** embed rules inside transactions, `orcamentos`, `assinaturas`, or `localStorage`.

### 3. Correct precedence order
Use this exact order:

1. **Remembered correction** (`categorizacao_memoria`)
2. **Explicit user rule** (`categorizacao_regras`, ordered by priority)
3. **Existing default categorizer** (`js/utils/categorizer.js`)
4. **Fallback `Outros`**

Rationale:
- remembered corrections are the most specific and lowest-risk
- user rules are broader and intentionally user-authored
- default rules remain useful baseline heuristics
- `Outros` stays honest when nothing matches

### 4. Where should rules management UI live?
Put the **entry point in the `Lançamentos` tab**, because that is where users see wrong categories and correct them.

Best fit:
- add a helper panel near the top of `Lançamentos` (after analytics/context panels, before filters)
- panel contains summary + “Gerenciar regras”
- actual dedicated UI opens in a `<dialog>` from that tab

Do **not** add a new top-level tab for Phase 4. The app already has many tabs, and categorization is part of the transaction-review flow, not a separate product area.

### 5. How should future imports consume the engine?
Each importer should:

1. parse rows exactly as today
2. load categorization runtime once per import
3. categorize each normalized row through the shared engine
4. persist rows with resulting `cat`
5. continue existing dedupe/replacement logic unchanged

That preserves parser structure and import integrity.

### 6. What tests should be added first?
First add **pure Node `node:test` utility tests**, not DOM-heavy tests:

1. precedence resolution test
2. source/direction scope matching test
3. remembered-correction learning/upsert test
4. importer-facing categorization application test
5. backup compatibility test for newly added stores

UI behavior can be browser-validated after the pure engine is covered.

## Standard Stack

### Core

| Library / Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| IndexedDB via `js/db.js` | Existing DB v5 -> recommend v6 | Persistent storage for rules and learned corrections | Project convention requires all persistence through `js/db.js` |
| `js/utils/categorizer.js` | Existing | Default fallback keyword categorization | Already used by all importers; should remain the fallback layer |
| `js/utils/categorization-engine.js` | New phase module | Central precedence resolver for all imports | Safest way to avoid duplicated logic across parsers |
| `js/app.js` refresh model | Existing | Centralized load/render orchestration | Matches project architecture and avoids view-owned state |

### Supporting

| Library / Module | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `js/views/categorization-rules.js` | New phase module | Dedicated rules-management UI | When rendering/editing rules and remembered corrections |
| Node built-in `node:test` | Built-in, version tied to local Node | Automated unit tests | For pure engine, store compatibility, and regression coverage |
| Existing importer modules | Existing | Parsing and persistence | Keep structure; only replace categorization callsite |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two stores (`categorizacao_regras` + `categorizacao_memoria`) | One mixed `categorizacao_regras` store with `kind` field | Simpler schema on paper, but blurs explicit rules vs learned corrections and makes UI/precedence harder |
| Dedicated dialog inside `Lançamentos` | New top-level tab | More visible, but adds tab sprawl and breaks the current correction workflow |
| Shared engine called by all importers | Parser-specific overrides in each file | Lower short-term diff, higher long-term regression risk |
| Future-only application | Retroactive recategorization of all history | More “automatic,” but much riskier and not required by the phase |

**Installation:**
```bash
# No new package installation recommended for this phase.
# Reuse existing browser runtime + built-in Node test runner.
```

**Version verification:**  
No new npm package is recommended. The main versioned change is the local DB schema: `DB_VERSION` should increment from `5` to `6`.

## Recommended Store Design

### Store 1: `categorizacao_regras`
Use for explicit, user-managed rules.

**Recommended keying:** `keyPath: 'id'`, `autoIncrement: true`

| Field | Type | Required | Notes |
|------|------|----------|------|
| `id` | number | auto | Stable CRUD key |
| `enabled` | boolean | yes | Soft-disable without delete |
| `priority` | number | yes | Lower number wins; supports move up/down |
| `pattern` | string | yes | Raw user-entered text |
| `patternNormalized` | string | yes | Cached normalized form for matching |
| `matchType` | string | yes | Use only `'contains'` in Phase 4 |
| `category` | string | yes | Final category to assign |
| `sourceScope` | string | yes | `'any' \| 'cartao' \| 'conta'` |
| `directionScope` | string | yes | `'any' \| 'entrada' \| 'saida'` |
| `createdAt` | string | yes | ISO timestamp |
| `updatedAt` | string | yes | ISO timestamp |

**Phase-4 recommendation:** do not support regex, glob syntax, negation, multiple operators, or nested conditions.  
Keep rule authoring to **“description contains X”**.

### Store 2: `categorizacao_memoria`
Use for auto-learned category corrections.

**Recommended keying:** `keyPath: 'key'`, `autoIncrement: false`

Use a deterministic key:
```text
{sourceScope}|{directionScope}|{normalizedDesc}
```

Example:
```text
conta|saida|UBER TRIP
```

| Field | Type | Required | Notes |
|------|------|----------|------|
| `key` | string | yes | Deterministic upsert key |
| `enabled` | boolean | yes | Allows disable without losing history |
| `normalizedDesc` | string | yes | Exact normalized description match |
| `descSample` | string | yes | Human-readable example |
| `category` | string | yes | Remembered category |
| `sourceScope` | string | yes | `'cartao' \| 'conta' \| 'any'` |
| `directionScope` | string | yes | `'entrada' \| 'saida' \| 'any'` |
| `learnedFrom` | string | yes | e.g. `'manual-edit'`, `'convert-dialog'` |
| `createdAt` | string | yes | ISO timestamp |
| `updatedAt` | string | yes | ISO timestamp |

**Important:** remembered corrections should store **category only**, not `tipo_classificado` or `classificado_nome`.

## Architecture Patterns

### Recommended Project Structure
```text
js/
├── app.js                          # Load new stores and render rules UI
├── db.js                           # Add stores, migration, backup/clear semantics
├── utils/
│   ├── categorizer.js              # Existing default fallback categorizer
│   └── categorization-engine.js    # New shared precedence resolver
└── views/
    ├── lancamentos.js              # Learn from manual category changes
    └── categorization-rules.js     # Dedicated rules UI/dialog
```

### Pattern 1: Central import-time categorization engine
**What:** Parsers continue parsing; categorization is centralized and applied once before persistence.  
**When to use:** All four current importers.

**Example:**
```javascript
// Source: recommended from current parser flow in js/parsers/*.js + js/utils/categorizer.js
import { loadCategorizationRuntime, categorizeImportedItem } from '../utils/categorization-engine.js';

export async function importarAlgumPdf(file, onProgress = () => {}) {
  // ... existing duplicate check + parse logic ...

  const runtime = await loadCategorizationRuntime();

  const incomingItems = parsedItems.map(item => {
    const result = categorizeImportedItem(item, runtime);
    return {
      ...item,
      cat: result.category,
      cat_origem: result.source,      // 'memoria' | 'regra' | 'padrao' | 'fallback'
      cat_regra_id: result.ruleId || null,
    };
  });

  // ... existing dedupe/replacement/persist logic ...
}
```

### Pattern 2: Explicit rules and learned memory stay separate
**What:** Broad rules are ordered; learned corrections are exact and auto-upserted.  
**When to use:** Always. This is the core safety mechanism.

**Example:**
```javascript
// Source: recommended new module pattern
export function categorizeImportedItem(item, runtime) {
  const normalizedDesc = normalizeCategoryText(item.desc);
  const sourceScope = item.source || 'any';
  const directionScope = item.tipo || 'any';

  const remembered = findRememberedCorrection(runtime.memories, {
    normalizedDesc,
    sourceScope,
    directionScope,
  });
  if (remembered) return { category: remembered.category, source: 'memoria' };

  const rule = findExplicitRule(runtime.rules, {
    normalizedDesc,
    sourceScope,
    directionScope,
  });
  if (rule) return { category: rule.category, source: 'regra', ruleId: rule.id };

  const defaultCategory = categorizar(item.desc);
  if (defaultCategory !== 'Outros') {
    return { category: defaultCategory, source: 'padrao' };
  }

  return { category: 'Outros', source: 'fallback' };
}
```

### Pattern 3: Learn only from real manual category changes
**What:** When a user changes `cat` manually, upsert a remembered correction.  
**When to use:** `lancamentos.js` edit flow and conversion flow category submission.

**Example:**
```javascript
// Source: recommended extension of current edit/convert flows in js/views/lancamentos.js
async function rememberCategoryCorrection(item, category, learnedFrom) {
  const sourceScope = item.source || 'any';
  const directionScope = item.tipo || 'any';
  const normalizedDesc = normalizeCategoryText(item.desc);

  if (!normalizedDesc || !category) return;

  await putItem('categorizacao_memoria', {
    key: `${sourceScope}|${directionScope}|${normalizedDesc}`,
    enabled: true,
    normalizedDesc,
    descSample: item.desc,
    category,
    sourceScope,
    directionScope,
    learnedFrom,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
```

### Anti-Patterns to Avoid
- **Do not mutate `REGRAS` from `categorizer.js` with user data.** Keep default rules and user data separate.
- **Do not recategorize all existing history on every refresh.** Phase 4 is for future imports and explicit manual corrections.
- **Do not auto-learn `tipo_classificado` / `classificado_nome`.** That would silently automate subscriptions/despesas, which this phase does not require.
- **Do not infer remembered corrections from existing transaction history.** There is no reliable provenance showing whether an existing `cat` was manually corrected.
- **Do not create a mini rule DSL.** Regex/wildcards/groups add complexity without requirement support.
- **Do not bypass `js/db.js`.** All persistence must remain centralized.

## UI Placement Recommendation

### Recommended placement
Use the `Lançamentos` tab as the home for smart categorization management.

**Why this is the right fit:**
- users see miscategorized rows there
- edit/convert actions already live there
- current tab model is crowded enough
- it keeps categorization close to transaction review, not hidden in `Importar` or split into a new major area

### Recommended interaction model
1. Add a helper panel in `tab-lancamentos`
2. Panel shows:
   - count of explicit rules
   - count of remembered corrections
   - short explanation of precedence
   - button: **Gerenciar regras**
3. Button opens a `<dialog>` containing:
   - create rule form
   - explicit rules list with edit/delete/move up/down
   - remembered corrections list with edit/delete/disable
   - optional “Promover para regra” action later, but not required for Phase 4

### Why not `Importar`
`Importar` is for file ingestion and backup utilities. Rules management belongs where users validate transaction meaning, not where they select PDFs.

### Why not a new tab
A new top-level tab is heavier than the phase needs and would add more `index.html` + `app.js` surface area than necessary.

## Import Consumption Strategy

### Preserve current parser structure
Current parser flow is already sound:

- parse raw PDF
- normalize transactions
- dedupe/replacement
- persist
- refresh

Do not rewrite that. Only replace the categorization callsite.

### Recommended importer change pattern
Current:
```javascript
tx.cat = categorizar(tx.desc);
```

Recommended:
```javascript
const runtime = await loadCategorizationRuntime();
tx.cat = categorizeImportedItem({ ...tx, source: 'conta' }, runtime).category;
```

For card importers, use `source: 'cartao'`.  
For account importers, use `source: 'conta'` and include `tipo` (`entrada` / `saida`) in matching context.

### Key implementation rule
Load categorization runtime **once per file**, not once per row.

### Keep these untouched
- `buildLancamentoFingerprint`
- `dedupeImportedLancamentos`
- `planScopedReplacement`
- `pdfs_importados` behavior
- current parser-specific extraction heuristics

## Don’t Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Categorization precedence | Four parser-specific if/else chains | Shared `categorization-engine.js` | One source of truth; easier tests |
| User rule persistence | Ad hoc JSON blob in existing stores | Dedicated `categorizacao_regras` store | Backup/restore and CRUD become predictable |
| Learned corrections | Re-scanning all historical transactions | Deterministic upsert into `categorizacao_memoria` | Prevents false learning |
| Ordering UI | Drag-and-drop sorter | Simple `priority` + move up/down buttons | Lower complexity in no-framework UI |
| Advanced rule syntax | Regex/DSL engine | Case/accent-insensitive `contains` only | Safer and matches current heuristic model |

**Key insight:** the app already succeeds by keeping parsers narrow, persistence centralized, and refresh global. Smart categorization should follow the same philosophy, not introduce a second parallel state model.

## Migration Needs

### 1. IndexedDB schema migration
- bump `DB_VERSION` from `5` to `6`
- add:
  - `categorizacao_regras`
  - `categorizacao_memoria`

### 2. Backup compatibility migration
This is a real risk.

`FULL_BACKUP_STORE_NAMES` is generated from `STORE_DEFS`, and current backup restore validation requires every current store to exist. Once the two new stores are added, **old backups will fail validation** unless Phase 4 updates backup compatibility logic.

**Recommendation:**
- either bump backup version and support upgrade from v1
- or allow missing new stores during restore and default them to `[]`

**Prescriptive choice:** support restore from older backups by defaulting new categorization stores to empty arrays.

### 3. Clear behavior
- `clearAllImported()` should **not** clear categorization rules or memory
- `clearAllData()` **should** clear both new stores

### 4. Existing data backfill
**Do not backfill** `categorizacao_memoria` from old transactions.

Reason:
- existing `cat` values do not prove a manual correction
- existing `tipo_classificado`/`classificado_nome` represent conversion workflows, not safe category memory

### 5. Transaction row metadata
Recommended additive fields on newly imported rows:
- `cat_origem`
- `cat_regra_id`

These are not required for the phase to work, but they materially improve debugging, UI explainability, and verification.

## Common Pitfalls

### Pitfall 1: Broad user rule overrides a more specific remembered correction
**What goes wrong:** A broad rule like `UBER -> Transporte` hides a manually corrected special case.  
**Why it happens:** No strict precedence model.  
**How to avoid:** Remembered corrections must run before explicit user rules.  
**Warning signs:** Same merchant keeps “reverting” after user correction.

### Pitfall 2: Learning too much from one manual conversion
**What goes wrong:** Future imports start auto-marking rows as `assinatura`/`despesa`.  
**Why it happens:** Reusing conversion metadata instead of category-only memory.  
**How to avoid:** Learn only `cat` in Phase 4. Keep `tipo_classificado` manual.  
**Warning signs:** New imports appear pre-converted into dashboard objects without user intent.

### Pitfall 3: Reimport or clear flow wipes user knowledge
**What goes wrong:** User rules disappear after “limpar dados importados”.  
**Why it happens:** New stores are treated as imported data instead of manual knowledge.  
**How to avoid:** Exclude categorization stores from `clearAllImported()`.  
**Warning signs:** Rules vanish after a cleanup but before full reset.

### Pitfall 4: Old backups become unrestorable
**What goes wrong:** Pre-Phase-4 JSON backup fails restore because new stores are missing.  
**Why it happens:** Current backup validator is strict on store presence.  
**How to avoid:** Add compatibility logic for missing new stores.  
**Warning signs:** Restore errors like `store "categorizacao_regras" ausente ou malformada`.

### Pitfall 5: Over-normalized matching causes wrong auto-categories
**What goes wrong:** Different merchants collapse into one remembered correction.  
**Why it happens:** Aggressive stripping of digits/noise too early.  
**How to avoid:** Start with exact normalized description match for memory; keep broad matching only for explicit rules.  
**Warning signs:** Unrelated transactions start sharing a learned category.

### Pitfall 6: Rules UI becomes a second source of truth
**What goes wrong:** View state diverges from IndexedDB state.  
**Why it happens:** Optimistic UI edits without full refresh discipline.  
**How to avoid:** Persist first via `db.js`, then `window.refreshDashboard()`.  
**Warning signs:** Rule list and actual import behavior disagree until reload.

## Code Examples

Verified patterns based on current repo conventions:

### Importer-side categorization hook
```javascript
// Source: repo pattern from js/parsers/* + recommended Phase 4 engine
const runtime = await loadCategorizationRuntime();

for (const tx of transacoes) {
  const categorization = categorizeImportedItem(
    { ...tx, source: 'conta' },
    runtime,
  );

  tx.cat = categorization.category;
  tx.cat_origem = categorization.source;
  tx.cat_regra_id = categorization.ruleId || null;
  tx.canal = inferirCanal({ ...tx, source: 'conta' });
}
```

### Rule matching order
```javascript
// Source: recommended Phase 4 engine
function matchCategory(item, runtime) {
  const memory = matchRememberedCorrection(item, runtime.memories);
  if (memory) return memory;

  const rule = matchExplicitRule(item, runtime.rules);
  if (rule) return rule;

  const fallback = categorizar(item.desc);
  return fallback || 'Outros';
}
```

### Learn from manual edit
```javascript
// Source: recommended extension of js/views/lancamentos.js
if (categoriaAnterior !== novaCategoria) {
  await rememberCategoryCorrection(lancamento, novaCategoria, 'manual-edit');
}

await putItem(getStore(lancamento), {
  ...prepareForDb(lancamento),
  cat: novaCategoria,
});

await window.refreshDashboard?.();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Importers call `categorizar(desc)` directly | Importers should call a shared categorization engine that wraps default categorizer | Phase 4 | Precedence becomes testable and consistent |
| No persistence of category learning | `categorizacao_memoria` stores exact learned corrections | Phase 4 | Manual corrections start paying off on future imports |
| No user-managed categorization rules | `categorizacao_regras` supports CRUD and priority | Phase 4 | User can override default heuristics safely |
| Strict backup schema tied to all stores | Backup restore should tolerate new categorization stores when restoring older backups | Phase 4 | Prevents Phase 4 from breaking earlier backups |

**Deprecated/outdated:**
- Direct parser-owned categorization as the only model: keep only as the default fallback layer
- Learning from nothing but current transaction history: too risky without provenance
- Treating categorization as view-only state: analytics/import flows depend on persisted categories

## Open Questions

1. **Should convert-dialog category changes also create remembered corrections?**
   - What we know: convert flow already collects category and persists conversion metadata
   - What's unclear: whether user expects that category to teach future imports
   - Recommendation: **Yes, but category only**. Do not propagate `tipo_classificado`

2. **Should memory normalization remove merchant suffix noise like IDs or auth codes?**
   - What we know: broader normalization would improve reuse
   - What's unclear: how often it would create false positives in this dataset
   - Recommendation: **No in Phase 4**. Start with exact normalized desc; let explicit rules cover broader cases

## Environment Availability

This phase adds **no new external service dependency**. It is a code/config/UI change inside the existing browser-only stack.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Browser with IndexedDB | Runtime validation | Assumed existing project runtime | Unverified in this research pass | None |
| Node with built-in `node:test` | Automated tests | Assumed, because repo already contains `node:test` suites | Unverified in this research pass | Manual browser validation only |
| Local HTTP server (`python -m http.server` or `serve.bat`) | Running ES modules locally | Documented in `README.md` | Unverified in this research pass | GitHub Pages/static host |

**Missing dependencies with no fallback:**
- None identified for planning

**Missing dependencies with fallback:**
- If Node test runner is unavailable locally, manual browser validation can still proceed, but automated regression coverage is weakened

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` + `node:assert/strict` |
| Config file | none |
| Quick run command | `node --test tests/phase-04/categorization-engine.test.js` |
| Full suite command | `node --test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CATG-01 | create/edit/delete rules with stable ordering and persistence helpers | unit | `node --test tests/phase-04/categorization-rules.test.js` | ❌ Wave 0 |
| CATG-02 | precedence is memory > rule > default > Outros | unit | `node --test tests/phase-04/categorization-engine.test.js` | ❌ Wave 0 |
| CATG-03 | manual category correction writes/upserts remembered memory and future match reuses it | unit | `node --test tests/phase-04/categorization-memory.test.js` | ❌ Wave 0 |
| CATG-02 | importer integration preserves parsed row structure while changing only category metadata | unit | `node --test tests/phase-04/categorization-import-apply.test.js` | ❌ Wave 0 |
| CATG-01/CATG-03 | backup/restore stays compatible after adding new stores | unit | `node --test tests/phase-04/categorization-backup-compat.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/phase-04/categorization-engine.test.js`
- **Per wave merge:** `node --test`
- **Phase gate:** Full suite green plus manual browser validation of create rule / edit category / reimport flow

### Wave 0 Gaps
- [ ] `tests/phase-04/categorization-engine.test.js` — precedence, source scope, direction scope
- [ ] `tests/phase-04/categorization-memory.test.js` — deterministic keying and upsert behavior
- [ ] `tests/phase-04/categorization-rules.test.js` — CRUD ordering helpers and enabled/disabled behavior
- [ ] `tests/phase-04/categorization-import-apply.test.js` — importer-facing row application helper
- [ ] `tests/phase-04/categorization-backup-compat.test.js` — restore compatibility with older backups

## Verification Strategy

### Automated first
1. engine precedence
2. source/direction scoping
3. memory upsert semantics
4. import-row application helper
5. backup compatibility for new stores

### Browser validation second
1. Create a custom rule in `Lançamentos`
2. Import a PDF containing a matching description
3. Confirm imported row category reflects custom rule
4. Manually edit one row to a different category
5. Reimport matching future row
6. Confirm remembered correction wins over rule/default
7. Run “Limpar dados importados”
8. Confirm rules/memory remain
9. Restore an older backup
10. Confirm restore succeeds and new stores default empty if absent

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria, UI expectation
- `.planning/REQUIREMENTS.md` — CATG-01 / CATG-02 / CATG-03 requirements
- `.planning/PROJECT.md` — local-first, browser-only, brownfield constraints
- `.planning/STATE.md` — current phase concerns and known categorization risk
- `.planning/codebase/ARCHITECTURE.md` — central refresh model, parser/persistence boundaries
- `.planning/codebase/CONVENTIONS.md` — `db.js` persistence rule, refresh rule, heuristic caution
- `js/db.js` — current stores, DB version, backup/clear behavior
- `js/utils/categorizer.js` — current default categorization logic and order sensitivity
- `js/views/lancamentos.js` — current manual edit/convert flows and classification behavior
- `js/views/assinaturas.js` — current suggestion pattern and DB-first refresh approach
- `js/parsers/itau-fatura.js` — current card importer categorization callsite
- `js/parsers/nubank-fatura.js` — current card importer categorization callsite
- `js/parsers/itau-conta.js` — current account importer categorization callsite
- `js/parsers/nubank-conta.js` — current account importer categorization callsite
- `js/utils/full-backup-io.js` — current strict backup validation behavior
- `js/app.js` — central data load and render orchestration
- `index.html` — current tabs and modal/dialog UI patterns
- `tests/phase-01/*.test.js`, `tests/phase-02/*.test.js`, `tests/phase-03/*.test.js` — existing Node test conventions

### Secondary (MEDIUM confidence)
- `README.md` — runtime/test environment assumptions and local server guidance

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — derived directly from repo architecture and constraints
- Architecture: **HIGH** — recommended design aligns tightly with current parser/db/app patterns
- Pitfalls: **HIGH** — multiple risks are directly visible in existing code (`categorizer.js`, backup validation, clear flows, manual conversion behavior)

**Research date:** 2026-03-28  
**Valid until:** 2026-04-27

If you want, I can also turn this into a **planner-ready condensed version** with taskable bullets/waves.