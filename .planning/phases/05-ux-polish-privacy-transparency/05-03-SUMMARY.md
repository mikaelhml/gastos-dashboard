---
phase: 05-ux-polish-privacy-transparency
plan: "03"
status: complete
completed_at: "2026-03-28"
---

# Phase 05-03 Summary — CSV Export + Mobile Responsivo

## O que foi construído

### Task 1 — `js/utils/transaction-export.js` (novo)
- Helper puro para serialização CSV: UTF-8 BOM + delimitador `;` + CRLF (compatível Excel)
- Colunas estáveis em raw: `data`, `mes_ou_fatura`, `origem`, `canal`, `descricao`, `categoria`, `tipo_movimento`, `valor`
- Escape RFC 4180 (aspas duplas duplicadas, células com `;`/`\n` envolvidas em `"`)
- Exclui automaticamente linhas `contextoDerivado` (SCR/Registrato)
- `downloadTransactionsCsv()` reutiliza padrão Blob + object URL já existente no projeto

### Task 1 — `tests/phase-05/transaction-export.test.js` (novo)
- 13 testes com `node:test` cobrindo: BOM, delimitador, CRLF, valor numérico bruto, ordenação, exclusão SCR, escape de aspas/ponto-e-vírgula/newline, acentos, lista vazia, fatura vs mes

### Task 2 — `index.html`
- `<nav id="mobileTabNav">` com `<select id="mobileTabSelect">` inserido antes da `.tabs` (visível apenas em mobile)
- `<div id="lancamentosExportActions">` com `lancamentosExportCsvBtn` e `lancamentosExportScope` entre filtros e tabela de Lançamentos

### Task 2 — `js/app.js`
- `switchTab()` agora sincroniza `mobileTabSelect.value` com a aba ativa
- Guard para não aplicar `.active` ao `<select>` quando a chamada vem do `onchange` mobile

### Task 2 — `js/views/lancamentos.js`
- Import de `buildTransactionsCsv` e `downloadTransactionsCsv`
- `_currentDisplayedRows` rastreia as linhas visíveis no momento
- `renderLancamentos()` atualiza `lancamentosExportScope` com contagem de transações reais filtradas
- `bindExportButton()` wira o botão com guard de binding duplo
- `data-label` adicionado em todas as `<td>` para layout stacked mobile

### Task 2 — `js/views/extrato.js`
- `data-label` adicionado nas `<td>` de transações reais e linhas SCR

### Task 2 — `js/views/visao-geral.js`
- `data-label` adicionado nas `<td>` do resumo comprometido

### Task 2 — `css/styles.css`
- `.mobile-tab-nav` base (oculto em desktop)
- `.export-actions` e `.export-scope-label`
- `@media (max-width: 768px)`: mostra `mobile-tab-nav`, oculta `.tabs` horizontal
- Substituição completa de `table { min-width: 720px; }` por layout stacked:
  - `#lancamentosTable`, `#extratoTable`, `#resumoTable`: `thead` oculto, `tr` em `display: block`, `td` em `display: flex` com `::before { content: attr(data-label) }`
- Linha truncada `.btn-inline-seco` (artefato de sessão anterior) removida do final do arquivo

## Verificações

- 60/60 testes passando (fases 01–05)
- HTML IDs obrigatórios presentes: `privacyAuditDialog`, `visaoEmptyState`, `extratoEmptyState`, `lancamentosEmptyState`, `mobileTabSelect`, `lancamentosExportCsvBtn`
- Regra `table { min-width: 720px; }` global removida

## Próximo passo

**Task 3 — Verificação humana** (gate bloqueante)

Checklist de verificação:
1. Estado vazio: Visão Geral, Extrato, Lançamentos mostram guided empty states; Importar mostra helper "comece por aqui"
2. Auditoria de privacidade em Importar: store counts, storage usage, last import por fonte, disclaimer CDN
3. Importar PDF → data de última importação atualiza por fonte
4. Lançamentos → aplicar filtro → Exportar CSV → abrir no Excel: só linhas filtradas reais, acentos OK, arquivo é CSV (não .xlsx)
5. Viewport ~390px: navegação via `mobileTabSelect` funciona sem scroll horizontal
6. Lançamentos, Extrato, Visão Geral legíveis em mobile sem overflow horizontal forçado

Digite `approved` para fechar a Fase 5 ou liste problemas numerados por step de verificação.
