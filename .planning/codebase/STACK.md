# Technology Stack

## Runtime Model

`gastos-dashboard` is a static browser application served from plain files. The runtime is the browser only: no backend, no Node runtime in production, no framework, no bundler, and no transpilation.

Local development requires an HTTP server because the app uses native ES modules.

## Languages and Assets

- JavaScript ES modules in `js/`
- HTML in `index.html`
- CSS in `css/styles.css`
- Batch script helper in `serve.bat`

## Core Libraries and Browser APIs

### Local code
- `js/app.js` - app orchestrator and public `window` API
- `js/db.js` - IndexedDB wrapper and schema definition
- `js/views/*.js` - tab rendering and UI handlers
- `js/parsers/*.js` - PDF routing and bank-specific importers
- `js/utils/*.js` - formatting, DOM helpers, suggestions, categorization

### External libraries
- Chart.js `4.4.1` via CDN in `index.html`
- PDF.js `4.2.67` via dynamic import in `js/parsers/pdf-utils.js`

### Browser APIs
- IndexedDB for persistence
- FileReader for PDF and JSON import
- Web Crypto API for SHA-256 PDF hashing
- Blob / URL APIs for JSON export downloads
- DOM / Canvas APIs for rendering and charts

## Persistence

The only persistence layer is IndexedDB in `js/db.js`.

Current database:
- Name: `gastos_db_public`
- Version: `5`

Current stores:
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

## Local Run Commands

Primary local run command:

```bash
python -m http.server 8080
```

Windows helper:

```bat
serve.bat
```

`serve.bat` falls back to `python3 -m http.server 8080` and then `npx serve -l 8080 .` if needed.

## Build, Test, and Lint

There is no build step, package install, automated test suite, single-test command, or lint command in this repository.

## Deployment Model

The app targets static hosting, especially GitHub Pages. Files are served as-is from the repository root. The project includes `.nojekyll` and `404.html` for Pages-friendly hosting.

## Stack Constraints That Matter for Planning

- Keep the app browser-only and local-first
- Do not introduce backend services for the core flow
- Do not replace IndexedDB with `localStorage`
- Do not assume npm-based tooling exists
- Keep `js/seed.js` empty in the public version
