# Phase 5: UX Polish & Privacy Transparency - Research

**Researched:** 2026-03-28  
**Domain:** Local-first UX polish, privacy audit UX, CSV export, and mobile responsiveness in a static IndexedDB dashboard  
**Confidence:** MEDIUM

## User Constraints

- Keep the app local-first, static, and browser-only
- No backend, no new framework, and no build step
- Stack stays HTML + CSS + vanilla JS + IndexedDB
- Keep public `window` / HTML contracts stable
- All persistence remains through `js/db.js`
- `refreshDashboard()` in `js/app.js` remains the centralized refresh path
- Import flow stays rooted in `js/views/importar.js`
- Any imported or user-controlled text rendered through `innerHTML` must be escaped
- Prefer additive modules/panels/dialogs over rewrites

## Summary

Phase 5 should stay additive and target the real friction points already visible in this repo: the app has strong data features, but first-run guidance is fragmented, privacy claims are currently implicit rather than auditable, export is JSON-only, and the mobile experience is still constrained by a horizontally scrolling tab bar and table layouts that deliberately force `min-width: 720px` on small screens.

The best fit is **not** a new top-level privacy tab. The existing tab bar is already crowded (`index.html:29-39`, `css/styles.css:67-74`, `1368-1403`), so another tab would worsen the exact mobile problem this phase must solve. A better Phase 5 approach is: keep the main architecture intact, add a **privacy audit dialog/panel launched from the Importar flow**, add a **CSV export action inside Lançamentos**, add **empty-state gating in Visão Geral / Extrato / Lançamentos**, and do a **targeted mobile pass** on tabs + table-heavy screens.

**Primary recommendation:** Implement Phase 5 in three plans: **(1) privacy audit + honest privacy copy, (2) first-run empty states + onboarding guidance, (3) CSV export + mobile navigation/table responsiveness**.

## Exact Code Surfaces to Touch

| Surface | Why Phase 5 touches it | Notes |
|---------|-------------------------|-------|
| `index.html:29-39` | Current tab bar already overflows horizontally on mobile | Add a mobile-safe tab selector or alternate nav; avoid adding another top-level tab |
| `index.html:43-143` | Visão Geral still shows chart/table scaffolding even when imported data is absent | Add first-run empty states that point to Importar |
| `index.html:312-393` | Lançamentos needs export CTA and better empty-state guidance | Best place for transaction CSV export |
| `index.html:605-665` | Extrato currently renders charts/tables even with no imported account data | Add explicit empty state instead of empty charts |
| `index.html:807-897` | Importar already owns DB status, backup, and import trust UX | Best home for privacy audit entry point and audit summary |
| `css/styles.css:67-74` | Tab strip uses horizontal scrolling | Conflicts with success criterion #4 |
| `css/styles.css:147-164` | Tables are wrapped with horizontal overflow | Needs targeted mobile redesign, not just more overflow |
| `css/styles.css:371-380` | Filters already stack reasonably | Reuse pattern for export/privacy action bars |
| `css/styles.css:730-939` | Import/utility/helper panels are the right styling base for privacy audit UI | Add new audit card/dialog styles here |
| `css/styles.css:1368-1403` | Mobile rules exist, but currently force `table { min-width: 720px; }` | This is a direct blocker for no-horizontal-scroll mobile usability |
| `js/app.js:61-89, 192-269` | Central data load/render pass may need to pass audit context or initialize a new additive view module | Keep `refreshDashboard()` as the single refresh entry |
| `js/views/importar.js:20-37, 57-93, 141-199, 339-415` | Existing DB status and import result UI make this the natural privacy-audit host | Can bind buttons without adding new `window` handlers |
| `js/views/lancamentos.js:41-92, 156-265, 766-922` | Needed for export button, filtered-export behavior, and empty-state polish | Keep export binding local to the view |
| `js/views/visao-geral.js:18-45` | Current “Sem extrato importado” handling is partial, not full first-run UX | Needs broader no-data gating |
| `js/views/extrato.js:15-66, 68-154, 156-274` | Current no-data state is table-row level only | Should become a full-screen/tab-level empty state |
| `js/db.js:191-210` | Existing count/snapshot helpers are reusable for audit metrics | DB schema change is optional, not mandatory |
| `js/parsers/layout-profiles.js:10-72` | Canonical source labels live here | Reuse for privacy audit copy and source naming |
| `js/parsers/pdf-utils.js:1-43` + `index.html:8` | These are the privacy-sensitive network surfaces | Current app loads Chart.js and PDF.js from CDNs |
| `js/utils/config-io.js:20-29, 204-222` and `js/utils/full-backup-io.js:135-149, 189-207` | Existing download pattern for JSON exports | Reuse for CSV export instead of inventing a new download flow |
| `js/utils/dom.js:1-8` | Required for any new innerHTML-based audit/export/empty-state rendering | Must be used for file names, source labels, and imported text |

## Recommended 3-Plan Breakdown

### Plan 05-01: Privacy Audit UI and Honest Privacy Copy
Scope:
- Add a privacy audit entry point in `Importar`
- Show:
  - IndexedDB usage summary
  - store counts
  - last import timestamps per source
  - explicit privacy statement with caveats
- Reuse `pdfs_importados` + store counts; avoid schema churn unless needed

Recommended implementation shape:
- Add `js/utils/privacy-audit.js` for pure aggregation/normalization
- Either extend `buildImportar()` or add a small `js/views/privacy-audit.js` used by `importar.js`
- Prefer a `<dialog>` or expandable audit panel, not a new top-level tab

### Plan 05-02: First-Run Empty States and Guided Next Steps
Scope:
- Replace empty charts/tables with meaningful onboarding copy in:
  - `Visão Geral`
  - `Extrato`
  - `Lançamentos`
  - optionally `Importar` top section with “recommended first step”
- Provide one clear next action: import PDFs, add manual recurring items, or restore backup

Recommended implementation shape:
- Add small helper renderers instead of rewriting whole tabs
- Gate chart/table rendering when imported datasets are empty
- Keep copy specific to the tab’s purpose

### Plan 05-03: Transactions CSV Export and Mobile Responsiveness
Scope:
- Add CSV export from `Lançamentos`
- Make mobile-width usage viable without horizontal scrolling
- Fix tab navigation on small screens
- Redesign key tables/responsive layouts rather than relying on scroll containers

Recommended implementation shape:
- Add pure `js/utils/transaction-export.js`
- Add a local export button in `Lançamentos`
- Add mobile tab selector / stacked nav
- Remove or override the global small-screen `table { min-width: 720px; }` rule with targeted mobile layouts

## Standard Stack

### Core

| Library / Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `js/app.js` refresh model | Existing | Centralized load/render orchestration | Matches current architecture and avoids state drift |
| IndexedDB via `js/db.js` | Existing DB v6 | Audit counts, import history, and persisted transactions | Project rule: all persistence stays in `js/db.js` |
| Native `<dialog>` pattern | Existing in `index.html` + `js/views/lancamentos.js` | Privacy audit screen without new top-level nav | Already used successfully in the app |
| Blob + `URL.createObjectURL()` | Existing pattern in JSON export helpers | CSV download | Already used for backup/config downloads |

### Supporting

| Library / Module | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `js/utils/privacy-audit.js` | New phase module | Normalize import history, counts, and privacy statements | For audit screen data preparation |
| `js/utils/transaction-export.js` | New phase module | Build escaped CSV rows and download export | For `Lançamentos` export |
| `js/utils/dom.js` | Existing | HTML escaping | For every new `innerHTML` rendering path |
| Node built-in `node:test` | Existing repo test pattern | Pure utility regression tests | For CSV and privacy aggregation logic |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Privacy audit dialog/panel inside `Importar` | New top-level “Privacidade” tab | More discoverable, but worsens mobile nav sprawl |
| CSV export only | Real `.xlsx` generation | `.xlsx` is heavier and easier to get wrong; CSV is enough for Excel compatibility in this stack |
| Honest “no financial data leaves the browser” wording | Blanket “no outbound network calls” claim | The blanket claim is false today because Chart.js/PDF.js are loaded from CDNs |
| Runtime normalization of existing `pdfs_importados` records | IndexedDB migration immediately | Migration is only needed if you want fully explicit persisted source metadata |

**Installation:**
```bash
# No new package installation recommended for this phase.
# Reuse browser APIs, existing helpers, and built-in Node tests.
```

**Version verification:**  
No new npm package is recommended. If Phase 5 avoids schema changes, `DB_VERSION` can remain unchanged.

## Architecture Patterns

### Recommended Project Structure
```text
js/
├── app.js                       # Optional wiring only if new view module is introduced
├── db.js                        # Existing read helpers; optional audit helper
├── utils/
│   ├── dom.js                   # Existing escape helper
│   ├── privacy-audit.js         # New pure aggregation helper
│   └── transaction-export.js    # New pure CSV helper
└── views/
    ├── importar.js              # Privacy audit entry point / rendering
    ├── lancamentos.js           # Export button + filtered export
    ├── visao-geral.js           # Empty-state gating
    └── extrato.js               # Empty-state gating
```

### Pattern 1: Privacy audit as an additive Importar utility
**What:** Put the audit UI next to existing import/backups/status utilities.  
**When to use:** Privacy/transparency UX that depends on local storage and import history.

**Why it fits this repo:**
- `Importar` already exposes trust-building UI: status cards, backup, import logs
- It avoids adding another top-level tab
- It can bind locally in `buildImportar()` without new global handlers

### Pattern 2: Pure helper + thin view for CSV export
**What:** Keep CSV serialization in a pure utility, and let `lancamentos.js` only gather currently filtered rows + trigger download.  
**When to use:** Any export/download feature.

**Code example:**
```javascript
// Source pattern: js/utils/config-io.js and js/utils/full-backup-io.js
const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = fileName;
document.body.appendChild(link);
link.click();
```

### Pattern 3: Empty-state gating before heavy renderers
**What:** If a tab has no imported data, render a focused helper state instead of letting charts/tables render placeholders.  
**When to use:** `Visão Geral`, `Extrato`, and any analytics panel with no usable history.

**Code example:**
```javascript
// Source pattern: js/views/visao-geral.js:27-43 and js/views/lancamentos.js:779-790
if (!analytics || !analytics.months?.length) {
  summary.innerHTML = `
    <div class="empty-state">
      <strong>Sem histórico suficiente</strong>
      Importe meses de cartão e/ou conta para continuar.
    </div>
  `;
  return;
}
```

### Anti-Patterns to Avoid

- **Do not add a new top-level tab for privacy:** it increases mobile friction immediately
- **Do not add new inline `window.*` handlers unless necessary:** bind by `id` inside view init functions
- **Do not promise “zero network calls” globally:** the repo currently uses external CDNs
- **Do not export formatted currency strings:** export raw values/dates/categories, not `fmt()` output
- **Do not rely on horizontal scroll as the mobile strategy:** current success criterion explicitly pushes against it

## Privacy Promise: What the App Can Honestly Claim

Current repo facts:
- There is **no backend code** in the repo
- There are **no `fetch` / XHR / sendBeacon / WebSocket` calls in app logic** that transmit imported financial records
- Imported PDFs are opened locally via `pdfjsLib.getDocument({ data: buffer })` in `js/parsers/pdf-utils.js:41-43`
- Downloads use browser-generated `Blob` URLs, not uploads
- But the app **does load third-party code from CDNs**:
  - `index.html:8` -> Chart.js from cdnjs
  - `js/parsers/pdf-utils.js:1-2` -> PDF.js module and worker from cdnjs

**Recommended audit wording:**
- Safe claim: **“Seus PDFs e dados financeiros são processados e armazenados localmente neste navegador. O app não envia transações, extratos ou PDFs para um backend.”**
- Required caveat: **“Esta página ainda baixa bibliotecas estáticas (Chart.js e PDF.js) por CDN; isso não inclui seus dados financeiros.”**

**If the product wants a stronger claim later:** vendor Chart.js and PDF.js locally as static assets. That is a separate hardening step, not required to deliver honest Phase 5 transparency.

## Import Audit Data Model Notes

`pdfs_importados` is the right store for “last import per source”, but existing records are not perfectly normalized.

Current persisted shapes found in importers:
- `registrato-scr` writes `tipo: 'registrato-scr'`
- Itaú fatura writes `tipo: 'fatura-itau'`
- Nubank fatura writes `tipo: 'fatura'`
- Conta imports currently do **not** persist a `tipo`
- Existing account imports can still be classified heuristically:
  - `saldoAnchor` present -> likely Itaú conta
  - `saldoInicial` / `saldoFinal` present -> likely Nubank conta

**Recommendation:** Phase 5 can avoid a DB migration by normalizing these records at read time in `privacy-audit.js`. Only add a DB/schema change if you want future records to store explicit profile IDs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Excel export | Custom `.xlsx` writer | CSV via Blob download | `.xlsx` is overkill for this stack; CSV is simpler and testable |
| Storage byte accounting | IndexedDB file-size estimation logic | `navigator.storage?.estimate()` with fallback to counts | Browser storage internals are not portable or trustworthy from app code |
| Privacy proof | A sweeping “no network” badge | Explicit, scoped audit statement backed by repo facts | The repo currently does have CDN requests |
| Download flow | One-off button hacks per feature | Reuse existing JSON-export download pattern | Keeps export UX and code consistent |

**Key insight:** In this repo, the risky part is not generating bytes; it is making claims stronger than the implementation supports.

## Common Pitfalls

### Pitfall 1: Overclaiming privacy
**What goes wrong:** The UI says “no outbound network calls” even though the app fetches Chart.js/PDF.js from CDNs.  
**Why it happens:** “No backend” gets conflated with “no network at all.”  
**How to avoid:** Separate **code/library fetches** from **financial-data transmission** in audit copy.  
**Warning signs:** Any audit copy that does not mention CDN-loaded assets.

### Pitfall 2: Using `pdfs_importados.tipo` as if it were already normalized
**What goes wrong:** Last-import-by-source UI is incomplete or wrong for account imports.  
**Why it happens:** Existing importers persist slightly different metadata shapes.  
**How to avoid:** Normalize old records at read time; only migrate if Phase 5 chooses to.  
**Warning signs:** “Conta” imports missing from the privacy audit.

### Pitfall 3: Shipping CSV that opens poorly in Excel
**What goes wrong:** Accents, quotes, separators, or line breaks break the spreadsheet.  
**Why it happens:** CSV serialization is treated as trivial string join logic.  
**How to avoid:** Add UTF-8 BOM, escape quotes correctly, and unit test separators/newlines.  
**Warning signs:** Exported descriptions containing commas, semicolons, or quotes render as broken columns.

### Pitfall 4: Calling the mobile pass “done” while tabs/tables still scroll sideways
**What goes wrong:** Cards look fine, but the actual dashboard still requires horizontal scroll in tabs and tables.  
**Why it happens:** Existing CSS already allows overflow, so regressions feel “acceptable.”  
**How to avoid:** Explicitly test the tab strip and every primary table at mobile width.  
**Warning signs:** `.tabs` scroll horizontally or `table { min-width: 720px; }` still applies on phones.

### Pitfall 5: Forgetting escape rules in new UI
**What goes wrong:** File names, source labels, or imported descriptions are inserted unescaped into new audit/export UI.  
**Why it happens:** This codebase uses many template-literal `innerHTML` renderers.  
**How to avoid:** Treat `escapeHtml()` as mandatory for all imported/user text.  
**Warning signs:** New markup interpolates `file.name`, `desc`, `cat`, or `mes` directly.

## Code Examples

Verified patterns already used in this repo:

### Reusable download flow
```javascript
// Source: js/utils/full-backup-io.js:189-207
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
}
```

### Safe imported-text rendering
```javascript
// Source: js/views/importar.js:282-298 and js/utils/dom.js:1-8
logEl.insertAdjacentHTML('beforeend', `
  <div class="import-result-card">
    <span class="irc-nome">${escapeHtml(file.name)}</span>
  </div>
`);
```

### Centralized refresh after write
```javascript
// Source: js/views/importar.js:264-265
await refreshStatus();
await window.refreshDashboard?.();
```

## State of the Art

| Old Approach | Current Repo Reality | Impact on Phase 5 |
|--------------|----------------------|-------------------|
| Implicit privacy promise | Privacy is described in docs/project files, not audited in-app | Phase 5 should surface proof and caveats in the UI |
| JSON-only export | Backups/config export exist, transaction CSV does not | Reuse the same download mechanics for CSV |
| Horizontal scroll as fallback | Tabs and tables still rely on it on mobile | Phase 5 must replace this for key flows |
| Partial empty states | Some tabs show empty rows/cards, but not full onboarding guidance | Phase 5 should make no-data states intentional |

**Deprecated/outdated for this phase:**
- “Just wrap tables in `.table-wrap`”: insufficient for the mobile success criterion
- “Privacy = no backend”: too weak and too easy to overstate

## Open Questions

1. **Should Phase 5 vendor Chart.js/PDF.js locally, or only disclose CDN usage honestly?**
   - What we know: current repo loads both from cdnjs
   - What's unclear: whether the phase budget should include static asset vendoring
   - Recommendation: keep Phase 5 focused on honest disclosure unless a stronger product promise is required

2. **Does “Excel/CSV” mean CSV is sufficient, or is true `.xlsx` required later?**
   - What we know: CSV is the safest fit for the current stack and opens in Excel
   - What's unclear: whether stakeholders expect native `.xlsx`
   - Recommendation: ship CSV now, label it clearly as Excel-compatible, and avoid hand-rolled `.xlsx`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` |
| Config file | none |
| Quick run command | `node --test tests/phase-05/*.test.js` |
| Full suite command | `node --test tests/**/*.test.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P5-SC1 | Privacy audit summarizes local storage + import history honestly | unit + manual | `node --test tests/phase-05/privacy-audit.test.js` | ❌ Wave 0 |
| P5-SC2 | Empty states replace empty analytics/charts for first-run users | manual + helper unit if extracted | `node --test tests/phase-05/empty-states.test.js` | ❌ Wave 0 |
| P5-SC3 | Transactions export to CSV safely | unit + manual | `node --test tests/phase-05/transaction-export.test.js` | ❌ Wave 0 |
| P5-SC4 | Mobile-width dashboard is usable without horizontal scrolling | manual | — | manual-only |

### Sampling Rate
- **Per task commit:** `node --test tests/phase-05/*.test.js`
- **Per wave merge:** `node --test tests/**/*.test.js`
- **Phase gate:** Full suite green + manual browser/mobile/privacy verification

### Wave 0 Gaps
- [ ] `tests/phase-05/privacy-audit.test.js` — import-source normalization, caveat copy, storage fallback behavior
- [ ] `tests/phase-05/transaction-export.test.js` — quoting, delimiters, BOM, filtered export ordering
- [ ] `tests/phase-05/empty-states.test.js` — if empty-state decisions are extracted into pure helpers

### Manual Verification Checklist

1. Start with a clean IndexedDB state
2. Open the app on desktop and mobile-width
3. Confirm first-run tabs show guidance, not empty charts/tables
4. Import one PDF of each supported source touched by the audit
5. Open privacy audit and verify:
   - store counts are plausible
   - storage usage is shown or clearly marked unavailable
   - last import dates per source are correct
   - caveat mentions CDN-loaded libraries
6. Open DevTools Network, import a PDF, and confirm there is no app-level upload/fetch/XHR carrying financial payloads
7. Filter `Lançamentos`, export CSV, and confirm:
   - current filter scope matches export contents
   - accents and quotes survive
   - file opens in Excel / spreadsheet app without broken columns
8. At mobile width, verify:
   - no horizontal scroll for primary navigation
   - no overlapping action buttons or filters
   - primary tabs (`Visão Geral`, `Lançamentos`, `Extrato`, `Importar`) remain usable end to end

## Sources

### Primary (HIGH confidence)
- `index.html` — current tab structure, tab density, Lançamentos/Extrato/Importar surfaces
- `css/styles.css` — current mobile behavior, overflow rules, and table constraints
- `js/app.js` — centralized load/render contract
- `js/views/importar.js` — import status, backup UX, and natural privacy-audit insertion point
- `js/views/lancamentos.js` — current analytics empty states and best export hook
- `js/views/visao-geral.js` — current partial empty-state handling
- `js/views/extrato.js` — current table/chart rendering behavior
- `js/db.js` — available count/snapshot helpers and persistence boundary
- `js/parsers/layout-profiles.js` — authoritative source labels
- `js/parsers/pdf-utils.js` — proof that PDFs are processed from in-memory buffers
- `js/utils/config-io.js` and `js/utils/full-backup-io.js` — download implementation pattern
- `tests/phase-0{1,2,3,4}/*.test.js` — existing Node test strategy in this repo

### Secondary (MEDIUM confidence)
- Browser API recommendation: `navigator.storage?.estimate()` as the preferred way to show local storage usage when available

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - driven almost entirely by existing repo patterns
- Architecture: HIGH - exact render/persistence boundaries are clear in current code
- Pitfalls: HIGH - overflow/privacy/import-metadata issues are directly visible in the repo
- Browser storage UI details: MEDIUM - recommended API usage is standard, but browser support was not externally re-verified in this run

**Research date:** 2026-03-28  
**Valid until:** 2026-04-27
