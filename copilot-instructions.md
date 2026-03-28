<!-- GSD:project-start source:PROJECT.md -->
## Project

**Dashboard de Gastos Pessoais**

Dashboard web local-first para organizar vida financeira a partir de PDFs de faturas, extratos bancarios e Registrato/SCR. O foco e transformar esses dados em um mini gerenciador financeiro pessoal que rode no navegador, sem backend e sem enviar dados sensiveis para fora da maquina do usuario.

**Core Value:** Dar visibilidade financeira util e privada a partir de dados bancarios reais, com tudo processado e armazenado localmente.

### Constraints

- **Tech stack**: HTML + CSS + Vanilla JS + IndexedDB + Chart.js/PDF.js via CDN — o projeto ja esta estruturado assim e deve continuar client-side
- **Privacy**: Todo processamento e armazenamento devem permanecer locais — essa e a proposta central do produto
- **Deployment**: Precisa continuar publicavel como app estatico, idealmente via GitHub Pages — sem infraestrutura de servidor
- **Brownfield**: Novas fases devem respeitar contratos ja existentes de tabs, window API publica, stores IndexedDB e fluxo de refresh — evitar regressao nas capacidades atuais
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (ES2020+) - Application logic, module system
- HTML5 - Page structure and semantic markup
- CSS3 - Styling with CSS custom properties and grid/flexbox
- Shell scripting (batch) - Local development server launcher in `serve.bat`
## Runtime
- Browser-based (Web APIs only)
- Native ES Modules (`type="module"`)
- Dynamic imports for runtime resource loading (PDF.js)
- No bundler (code runs unbundled)
## Frameworks
- None - Vanilla JavaScript with DOM APIs only
- Chart.js 4.4.1 - Bar charts for expense distribution (loaded from CDN)
- PDF.js 4.2.67 - PDF parsing and text extraction
## Key Dependencies
- IndexedDB (native browser API) - Local data persistence
- Web Crypto API (native) - SHA-256 hashing for PDF deduplication
- No npm packages installed
- No package.json detected
- No build step required
- All external resources loaded via CDN with fallback to local assets
## Configuration
- Zero configuration required - fully static
- No .env files used (privacy-first: all data stays local)
- No secrets management needed
- HTTP server required (not file:// protocol) due to ES Modules
- Provided: `serve.bat` - Detects Python or Node and auto-starts server on port 8080
- IndexedDB (data persistence)
- Web Crypto API (SHA-256 hashing)
- File API / FileReader (PDF import)
- Canvas API (Chart.js rendering)
- Window.prompt() (PDF password input)
## Platform Requirements
- Python 3.x OR Node.js with npx OR Live Server extension
- Modern browser with ES2020+ support and IndexedDB
- Code editor of choice (no build tools)
- Deployment target: GitHub Pages
- Static file serving required (index.html with 404.html redirect for SPA routing)
- HTTPS supported (GitHub Pages provides this)
- No backend infrastructure required
- Browser requirements: Same as development
## Asset Loading
- Local stylesheet: `css/styles.css`
- Entry point: `js/app.js` (loaded as `<script type="module">`)
- Sub-modules imported via ES6 imports:
- Chart.js (UMD bundle - not modular, loaded as global)
- PDF.js (ES Module, dynamically imported at runtime)
- Data URI inline SVG in HTML (no separate file request)
## Data Persistence
- IndexedDB with localStorage disabled by design
- All financial data stored locally in browser database
- No network transmission of user data
- Supports import/export as JSON for backup
- Completely offline-capable
- Syncing/storage purely client-side
- No cloud integration
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Kebab-case for all files: `nubank-conta.js`, `layout-profiles.js`, `registrato-scr.js`
- Module files in same directory use kebab-case: `pdf-utils.js`, `registrato-suggestions.js`
- View modules: `visao-geral.js`, `despesas-fixas.js`, `lancamentos.js`
- No uppercase except emoji prefixes in comments
- camelCase for all functions: `importarNubankFatura()`, `parseDataNubank()`, `extrairMesFatura()`
- Verb-first naming for importers: `importarNubankConta()`, `importarItauFatura()`, `importarRegistratoScr()`
- Prefix pattern for helper functions: `extrair*`, `parsear*`, `normalizar*`, `detectar*`, `inferir*`
- Private module-level functions prefixed with underscore: `_bindDropZone()`, `_renderConfigResult()`
- camelCase for all variables: `_lancamentos`, `_dropZoneBound`, `_importando`, `_sortState`
- Constants in UPPER_SNAKE_CASE: `DB_NAME`, `DB_VERSION`, `STORE_DEFS`, `PDFJS_URL`, `WORKER_URL`, `REGISTRATO_VALUE_FIELDS`
- Prefixed underscore for module-scoped state: `_db`, `_refreshChain`, `_dialogBound`, `_editDialogBound`
- Descriptive abbreviations: `desc` (description), `cat` (category), `var` (value), `ts` (timestamp), `tol` (tolerance)
- Object key names use camelCase: `{ nome, valor, cat, icon, recorrencia, parcelas }`
- Constants as objects with PascalCase-style lookup maps: `CAT_ACCENT`, `CAT_COLORS`, `CANAL_META`, `MESES_NUBANK`
- Config objects: `{ id, label, badgeClass, phaseLabel, importer, matchFileName, matchContent }`
## Code Style
- No explicit linter or formatter configured (no .eslintrc, .prettierrc, biome.json)
- Inferred style from codebase:
- None detected. Project uses vanilla JavaScript with ES Modules.
- Type hints via JSDoc comments (when present)
## Import Organization
- None used. All imports use relative paths: `../`, `./`
- No path mapping or aliases configured
- Top-level imports immediately at file start
- No dynamic imports except for PDF.js: `const pdfjsLib = await import(PDFJS_URL);`
- Exports at module level: `export function`, `export const`, `export async function`
- No barrel files observed
## Error Handling
- Try-catch blocks for async operations and user interactions
- Example from `lancamentos.js`:
- Console.error() with module prefix: `console.error('[nubank-fatura] Nenhum lançamento...')`
- User feedback via `setFeedback()` helper: `setFeedback('fieldId', 'mensagem', 'error' | 'success')`
- Throw Error with descriptive messages for validation failures
- Promise rejection in IndexedDB operations: `req.onerror = e => reject(e.target.error);`
- Null check pattern: `if (!file?.name?.toLowerCase().endsWith('.pdf')) return null;`
- Portuguese language for user-facing errors
- Module-prefixed console errors for debugging: `[modulo-name] Descrição do erro`
- User-facing messages: Concise Portuguese, sometimes with file references
## Logging
- Module prefix in square brackets: `console.error('[nubank-fatura] Nenhum lançamento...')`
- Info logging for successful imports: `console.log('[nubank-fatura] "filename": N lançamentos, fatura=...')`
- Partial sample logging on failures: `console.error('[modulo] Primeiras 30 linhas:\n', amostra);`
- No debug levels or structured logging observed
## Comments
- Function headers with multi-line comments explaining flow/responsibility
- Inline comments for non-obvious parsing logic or heuristics
- Section headers with `── Section Name ──` pattern for visual organization
- Commented blocks for disabled code not removed
- Used selectively on exported functions and parsers
- Pattern: `@param {Type} name - description`, `@returns {Type} description`
- Examples from codebase:
- Not used on internal/helper functions
## Function Design
- Small, focused functions (50-100 lines typical)
- Longer functions (~200+ lines) are complex parsers with clear section breaks
- Example: `nubank-fatura.js` parsers are longer due to PDF layout complexity
- 1-3 parameters typical for exported functions
- Object destructuring for related parameters: `{ textSample }`, `{ nome, valor, cat }`
- Callback parameters named explicitly: `onProgress`, `onPassword`
- Optional parameters via default values: `function initLancamentos(lancamentos, extratoTransacoes = [], ...)`
- Objects with consistent shape for importer functions:
- Arrays for list operations: `getAll()`, `getStoreCounts()`
- Boolean for predicates: `isResumoNaoTransacionalCartao()`, `normalizeRegistratoEntry()`
- Mixed returns only when error case differs: `{ importado: 0, mes: '' }` vs actual data
## Module Design
- Named exports only (no default exports)
- Export at declaration: `export function name() { ... }` or `export const name = ...`
- All exported functions are public API; prefix private functions with underscore
- Multiple related exports per module typical: `buildAssinaturas`, `buildDespesasFixas` in views
- Not used in this project
- Each view/util/parser is imported directly
## HTML Escaping & Sanitization
- Central utility in `js/utils/dom.js`: `escapeHtml()`
- Pattern:
- **MUST escape all user-facing data** from transaction descriptions, category names, custom fields
- Usage: `${escapeHtml(a.nome)}` in template literals
- No raw innerHTML assignments without escaping first
- Unicode normalization for text matching: `String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')`
- Pattern used in categorization, transaction-tags, and comparison logic
- Removes diacritics for case-insensitive keyword matching
## Data Persistence Conventions
- All persistence via `js/db.js` wrapper functions: `getAll()`, `addItem()`, `putItem()`, `deleteItem()`, `bulkAdd()`
- Store names are lowercase with underscores: `'lancamentos'`, `'extrato_transacoes'`, `'assinatura_sugestoes_dispensa'`
- Never direct `localStorage` access (explicitly forbidden in README)
- Imported data passes through normalize functions on load:
- Pattern: Load raw, normalize during `loadDashboardData()`, render with normalized data
- Validation before save: check non-empty, valid numbers, required fields
- Feedback on validation failure: `setFeedback(fieldId, 'message', 'error')`
- Success feedback after save: `setFeedback(fieldId, 'Salvo!', 'success')`
## Parser Extension Patterns
- Async function matching `importar*` pattern: `export async function importar*(file, onProgress)`
- Return object: `{ importado, duplicata, mes, erro?, debug? }`
- Must register in `js/parsers/layout-profiles.js` under `PDF_LAYOUT_PROFILES` array
- Use `extrairLinhasPDF()` from `pdf-utils.js` → yields strings grouped by PDF layout
- Utilities available:
## Public API Contracts
- `switchTab(event, name)` — Tab navigation
- `filterLancamentos(type, value)` — Filter card transactions
- `sortLancamentosBy(key)` — Sort transactions
- `clearLancamentosFilters()` — Reset filters
- `filterExtrato(type, value)` — Filter account transactions
- `clearExtratoFilters()` — Reset extrato filters
- `recalcularProjecao()` — Recalculate projections
- `clearBase()` — Clear imported data only
- `clearAllDashboardData()` — Full reset
- `refreshDashboard()` — Reload all views
- `selectEmoji(inputId, previewId, pickerId, btn, emoji)` — Emoji picker
- `syncEmojiPicker(pickerId, previewId, emoji)` — Sync picker state
- `toggleEmojiPicker(pickerId)` — Show/hide picker
- `buildVisaoGeral(assinaturas, despesasFixas, extratoSummary, ...)`
- `buildAssinaturas(assinaturas, observacoes, lancamentos, ...)`
- `buildDespesasFixas(despesasFixas, registratoSuggestions)`
- `buildParcelamentos(despesasFixas, lancamentos)`
- `initLancamentos(lancamentos, extratoTransacoes, ...)`
- `initExtrato(extratoTransacoes, extratoSummary, ...)`
- `initProjecao(despesasFixas, extratoSummary, ...)`
- `buildRegistrato(registratoResumos, registratoSnapshots, ...)`
- `buildImportar()` — async initialization
## Field Name Conventions
- `id` — unique identifier (auto-increment)
- `data` — date string "DD/MM/YYYY"
- `desc` — description
- `valor` — amount as number (can be negative)
- `cat` — category string
- `canal` — channel (pix, transferencia, cartao, boleto, debito, outro)
- `fatura` — bill month "Mês/Ano" (e.g., "Jan/2026")
- `mes` — extrato month (alternative to fatura for account transactions)
- `source` — 'cartao' or 'conta'
- `tipo_classificado` — classification type (assinatura, despesa, parcelamento, etc.)
- `classificado_nome` — name of classified item (if classified)
- `id` — unique identifier
- `nome` — subscription name
- `cat` — category
- `valor` — monthly amount
- `icon` — emoji icon
- `obs` — optional notes
- `id` — unique identifier
- `desc` or `nome` — description/name
- `valor` — monthly amount
- `cat` — category
- `icon` — emoji icon
- `recorrencia` — "fixa", "anual", etc.
- `parcelas` — optional: `{ tipo, label, pagas, total, inicio }`
- `mesRef` — month reference "MM/YYYY"
- `emDia`, `vencida`, `outrosCompromissos` — numeric amounts
- `creditoALiberar`, `coobrigacoes`, `limite` — numeric amounts
- `totalOperacoes` — count of operations
- `semRegistros` — boolean flag
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Single-page application (ES modules, no build step)
- All data stored locally in IndexedDB — no backend
- Tab-based navigation with modal dialogs for data entry
- Multi-format PDF parser with layout detection
- Cascade rendering: load data → normalize → build views → expose to window
## Layers
- Purpose: Render tab contents, handle user interaction, expose click handlers to `window`
- Location: `js/views/`
- Contains: 9 view modules, each building a tab's HTML and binding handlers
- Depends on: formatters, DOM utils, categorizer, IndexedDB data
- Used by: `app.js` orchestrator during `renderDashboard()`
- Purpose: Promise-based async interface to browser's IndexedDB
- Location: `js/db.js`
- Contains: CRUD operations, bulk inserts, store migrations, seed logic
- Depends on: Browser IndexedDB API
- Used by: All modules that persist data (importers, views, app.js)
- Purpose: Extract data from PDFs, detect format, route to specific parser
- Location: `js/parsers/`
- Contains: 7 parser modules (Nubank conta/fatura, Itaú conta/fatura, Registrato/SCR) + layout detection
- Depends on: PDF.js library, pdf-utils (shared extraction), categorizer
- Used by: `importar.js` view during drag-drop file handling
- Purpose: Shared formatting, DOM manipulation, categorization, config export/import
- Location: `js/utils/`
- Contains: Formatters, DOM helpers, categorization rules, transaction tags, config I/O
- Depends on: Nothing (pure functions or simple DOM APIs)
- Used by: Views, parsers, app.js
- Purpose: Initialize app, load all data, call all view builders, expose handlers to `window`
- Location: `js/app.js`
- Contains: Startup sequence, data normalization, view initialization, refresh chain
- Depends on: All other layers
- Used by: HTML inline event handlers (`onclick`, `oninput`)
## Data Flow
## Key Abstractions
- Purpose: Encapsulate a tab's rendering logic
- Examples: `buildVisaoGeral()`, `buildAssinaturas()`, `initLancamentos()`
- Pattern: Function receives data, manipulates DOM, returns nothing. Stores module state in closure.
- Purpose: Match PDF to correct parser and execute import
- Examples: Objects in `PDF_LAYOUT_PROFILES` array
- Pattern: Each profile has `id`, `label`, `matchFileName()`, `matchContent()`, `importer()` function
- Purpose: Transform raw data to consistent internal format
- Examples: `normalizeDespesaFixa()`, `normalizeLancamentoCartao()`, `normalizeRegistratoEntry()`
- Pattern: Input object → validated/enriched output with consistent field names
- Purpose: Classify transaction by keyword matching in description
- Location: `js/utils/categorizer.js`
- Pattern: Linear search through `REGRAS` array, case-insensitive accent-removed matching
## Entry Points
- Location: `index.html`
- Triggers: Page load in browser
- Responsibilities: Defines tab structure, declares window stubs, loads CSS and Chart.js
- Location: `js/app.js`
- Triggers: ES module load (via `<script type="module" src="js/app.js"></script>` implicit in HTML)
- Responsibilities: Open DB, seed if needed, load data, build all views, expose handlers to `window`
- Location: `importar.js` → `_bindDropZone()`
- Triggers: File dragged to drop zone or file picker opens
- Responsibilities: Detect layout, call importer, show progress, refresh dashboard
## Error Handling
- **Module initialization:** Try-catch in `app.js` `init()` wraps entire startup; displays error banner if DB fails
- **PDF import:** Try-catch in importer with fallback messages; logs details to browser console
- **Data normalization:** Filter out falsy/invalid items; don't crash on malformed data
- **View building:** Check for null DOM elements; skip rendering if target missing
- **Async operations:** Promise chains with `.catch(() => {})` to prevent unhandled rejections
## Cross-Cutting Concerns
- PDF password handling: Stores in session variable, reuses for multi-file batches
- Transaction amount parsing: Normalize "," decimal and "." thousand separator
- Date parsing: Three-part validation (DD/MM/YYYY or "03 FEV 2026" variants)
- **User-created data:** Assinaturas, despesas fixas, observações — manual CRUD, exported to JSON
- **Imported data:** Lançamentos, extrato_transacoes, registrato snapshots — from PDFs, clearable as batch
- **Derived data:** extrato_summary (calculated from transações), registrato_scr_resumo_mensal — computed on import
- **Dismissals:** assinatura_sugestoes_dispensa, registrato_sugestoes_dispensa — user-driven, prevent repeated suggestions
- Module-level variables store current filtered/sorted state (e.g., `_lancamentos`, `_sortState`)
- No global state object — each view maintains own closure state
- Refresh chain (`_refreshChain`) prevents concurrent renders
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
