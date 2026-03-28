# Integrations

## Overview

This project has very few external integrations by design. Most behavior is local to the browser.

## CDN Dependencies

### Chart.js
- Source: CDN script in `index.html`
- Role: charts in dashboard views, mainly `js/views/visao-geral.js`
- Data sensitivity: receives no user data directly; chart data is computed locally

### PDF.js
- Source: CDN ES module and worker URLs in `js/parsers/pdf-utils.js`
- Role: local PDF text extraction and parsing support
- Data sensitivity: PDFs are processed in the browser; no app-side upload flow exists

## Browser Platform Integrations

### IndexedDB
- Entry point: `js/db.js`
- Role: all local persistence
- Used by: `js/app.js`, parsers, config import/export, and view mutations

### File import
- PDF import starts in `js/views/importar.js`
- JSON config import/export is implemented in `js/utils/config-io.js`
- Uses `FileReader`, `Blob`, and download links generated in-browser

### Web Crypto
- Used in `js/parsers/pdf-utils.js`
- Role: SHA-256 hashes for PDF-level deduplication via `pdfs_importados`

## Hosting Integration

### GitHub Pages
- Static hosting target documented in `README.md`
- `.nojekyll` prevents Jekyll processing
- `404.html` supports Pages-friendly fallback behavior

## Data Exchange Inside the App

These are internal contracts rather than external services, but they matter for planning:

- `js/parsers/layout-profiles.js` routes a dropped PDF to a dedicated importer
- `js/utils/registrato-suggestions.js` converts Registrato/SCR data into suggestions and insights
- `js/utils/config-io.js` exchanges JSON backups of manual configuration only (`assinaturas` and `despesas_fixas`)

## What Is Not Integrated

The project currently does not integrate with:
- bank APIs or Open Finance
- authentication providers
- cloud databases
- webhooks
- remote analytics services
- external AI services
- outbound sync services

That absence is intentional and aligns with the project's privacy model.
