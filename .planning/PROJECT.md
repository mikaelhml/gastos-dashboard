# Dashboard de Gastos Pessoais

## What This Is

Dashboard web local-first para organizar vida financeira a partir de PDFs de faturas, extratos bancarios e Registrato/SCR. O foco e transformar esses dados em um mini gerenciador financeiro pessoal que rode no navegador, sem backend e sem enviar dados sensiveis para fora da maquina do usuario.

## Core Value

Dar visibilidade financeira util e privada a partir de dados bancarios reais, com tudo processado e armazenado localmente.

## Current State — v1.0 (Shipped 2026-03-28)

**Status:** Milestone v1.0 completo. O produto está publicável como app estático no GitHub Pages.

**O que funciona hoje:**
- Importação de PDFs: Nubank conta, Nubank fatura (com parcelamentos), Itaú fatura (5 estratégias de fallback), Registrato/SCR
- Deduplicação SHA-256 — reimportar o mesmo PDF não duplica dados
- Backup JSON completo (full e por store) + restauração com validação
- Analytics multi-mês: trend chart por categoria + movers mês-a-mês
- Projeção com SCR/Registrato (status Incluído/Conflito/Contextual) + tracker de parcelamentos
- Categorização inteligente: regras por keyword + memória de correções manuais
- UX: empty states guiados, auditoria de privacidade, exportação CSV (Excel-compatible), mobile responsivo (stacked tables)
- 60 testes unitários passando (fases 01–05)

**IndexedDB:** schema v6, 13 stores

## Next Milestone Goals

*A definir com `/gsd:new-milestone`.*

Candidatos óbvios (do backlog v2):
- Diagnósticos de import: linhas que falharam + motivo (IMPT-01)
- Parser Itaú Uniclass/Signature (variante ainda com 0 lançamentos em alguns layouts)
- Busca full-text em histórico completo (SRCH-01)
- Budget vs. actual por categoria (PLAN-01)
- Cards de insight automático (INST-03)

## Requirements

### Validated (v1.0)

- ✓ Reimport sem perda de dados (DATA-01)
- ✓ Backup JSON completo (DATA-02)
- ✓ Restore de backup com validação (DATA-03)
- ✓ Analytics multi-mês por categoria (ANLY-01)
- ✓ Movers mês-a-mês (ANLY-02)
- ✓ SCR/Registrato na projeção (PROJ-01)
- ✓ Diferenciação visual de origem SCR (PROJ-02)
- ✓ Regras de categorização CRUD (CATG-01)
- ✓ Precedência de regras do usuário (CATG-02)
- ✓ Memória de correções manuais (CATG-03)

### Active (v2 — a refinar)

- [ ] Diagnósticos de import com linhas que falharam e motivo (IMPT-01)
- [ ] Retry de imports falhos sem reimportar tudo (IMPT-02)
- [ ] Comparativo budget vs. actual por categoria (PLAN-01)
- [ ] Busca full-text em histórico completo (SRCH-01)
- [ ] Detecção automática de parcelamentos linkados entre meses (INST-01)
- [ ] Cards de insight automático baseados em tendências e anomalias (INST-03)
- [ ] Sugestões de assinatura inferidas de padrões recorrentes (SUBS-01)

### Out of Scope

- Hospedar backend ou depender de servidor remoto para processamento financeiro
- Enviar PDFs, extratos ou dados financeiros para serviços externos
- Transformar o produto em plataforma multiusuário com autenticação e contas online

## Constraints

- **Tech stack**: HTML + CSS + Vanilla JS + IndexedDB + Chart.js/PDF.js via CDN — client-side only
- **Privacy**: Todo processamento e armazenamento devem permanecer locais
- **Deployment**: App estático via GitHub Pages — sem infraestrutura de servidor
- **Brownfield**: Novas fases devem respeitar contratos existentes (tabs, window API, stores IndexedDB, fluxo de refresh)

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Arquitetura local-first sem backend | Privacidade e autonomia são parte central do valor | ✅ Mantido no v1.0 |
| Evoluir como mini gerenciador financeiro analítico | O objetivo não é apenas importar PDFs, mas gerar leitura financeira útil | ✅ Entregue no v1.0 |
| CSV honesto em vez de fake .xlsx | Não pretender ser Excel; BOM + `;` + CRLF dá compatibilidade real | ✅ Fase 5 |
| Motor de categorização compartilhado entre parsers | Consistência sem duplicação; regras do usuário com precedência universal | ✅ Fase 4 |

## Evolution

Este documento evolui a cada transição de milestone.
*Última atualização: 2026-03-28 — v1.0 shipped*
