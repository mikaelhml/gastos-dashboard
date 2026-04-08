# Dashboard de Gastos Pessoais

## What This Is

Dashboard web local-first para organizar vida financeira a partir de PDFs de faturas, extratos bancarios e Registrato/SCR. Transforma dados bancarios em um mini gerenciador financeiro pessoal com KPIs de mercado, alertas contextuais e simulador de compras — tudo no navegador, sem backend.

## Core Value

Dar visibilidade financeira util e privada a partir de dados bancarios reais, com tudo processado e armazenado localmente.

## Current State — v2.0 (Shipped 2026-04-08)

**Status:** Milestone v2.0 completo. Dashboard com KPIs enriquecidos, alertas contextuais e simulador de compras.

**O que funciona hoje:**
- Importacao de PDFs: Nubank conta, Nubank fatura (com parcelamentos), Itau fatura (5 estrategias de fallback), Registrato/SCR
- Deduplicacao SHA-256 — reimportar o mesmo PDF nao duplica dados
- Backup JSON completo (full e por store) + restauracao com validacao
- Analytics multi-mes: trend chart por categoria + movers mes-a-mes
- Projecao com SCR/Registrato (status Incluido/Conflito/Contextual) + tracker de parcelamentos
- Categorizacao inteligente: regras por keyword + memoria de correcoes manuais
- UX: empty states guiados, auditoria de privacidade, exportacao CSV (Excel-compatible), mobile responsivo
- **v2.0:** Health score composito (0-100), 6 KPIs de mercado, alert engine contextual, simulador PMT de compras parceladas, 3 charts novos, tabela projecao anual, modal de detalhe KPI
- 112 testes unitarios passando (60 v1.0 + 52 v2.0)

**IndexedDB:** schema v6, 13 stores

## Next Milestone Goals

*A definir com `/gsd-new-milestone`.*

Candidatos (do backlog v2 + review v2.0):
- Diagnosticos de import: linhas que falharam + motivo (IMPT-01)
- Busca full-text em historico completo (SRCH-01)
- Budget vs. actual por categoria (PLAN-01)
- Cards de insight automatico (INST-03)
- CSS dark theme consistency nos componentes v2.0 (review finding)
- Diferenciar emergencyFundCoverage vs cashRunway (review finding)
- Projecao anual dinamica com parcelas decrescentes (review finding)

## Requirements

### Validated (v1.0)

- ✓ Reimport sem perda de dados (DATA-01)
- ✓ Backup JSON completo (DATA-02)
- ✓ Restore de backup com validacao (DATA-03)
- ✓ Analytics multi-mes por categoria (ANLY-01)
- ✓ Movers mes-a-mes (ANLY-02)
- ✓ SCR/Registrato na projecao (PROJ-01)
- ✓ Diferenciacao visual de origem SCR (PROJ-02)
- ✓ Regras de categorizacao CRUD (CATG-01)
- ✓ Precedencia de regras do usuario (CATG-02)
- ✓ Memoria de correcoes manuais (CATG-03)

### Validated (v2.0)

- ✓ KPI cards enriquecidos: health score, installment relief, consolidated debt (KPI-01)
- ✓ KPIs de mercado: net worth, savings rate, DTI, emergency fund, velocity, runway (KPI-02)
- ✓ Projecao next-month no overview (KPI-03)
- ✓ Cards com icones, barras, alertas contextuais (VIS-01)
- ✓ Charts (line, donut) + tabela anual (VIS-02)
- ✓ Simulador de compra parcelada com impacto (SIM-01)

### Active (v3 — a refinar)

- [ ] Diagnosticos de import com linhas que falharam e motivo (IMPT-01)
- [ ] Retry de imports falhos sem reimportar tudo (IMPT-02)
- [ ] Comparativo budget vs. actual por categoria (PLAN-01)
- [ ] Busca full-text em historico completo (SRCH-01)
- [ ] Deteccao automatica de parcelamentos linkados entre meses (INST-01)
- [ ] Cards de insight automatico baseados em tendencias e anomalias (INST-03)
- [ ] Sugestoes de assinatura inferidas de padroes recorrentes (SUBS-01)

### Out of Scope

- Hospedar backend ou depender de servidor remoto para processamento financeiro
- Enviar PDFs, extratos ou dados financeiros para servicos externos
- Transformar o produto em plataforma multiusuario com autenticacao e contas online

## Constraints

- **Tech stack**: HTML + CSS + Vanilla JS + IndexedDB + Chart.js/PDF.js via CDN — client-side only
- **Privacy**: Todo processamento e armazenamento devem permanecer locais
- **Deployment**: App estatico via GitHub Pages — sem infraestrutura de servidor
- **Brownfield**: Novas fases devem respeitar contratos existentes (tabs, window API, stores IndexedDB, fluxo de refresh)

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Arquitetura local-first sem backend | Privacidade e autonomia sao parte central do valor | ✅ Mantido v1.0-v2.0 |
| Evoluir como mini gerenciador financeiro analitico | O objetivo nao e apenas importar PDFs, mas gerar leitura financeira util | ✅ Entregue v1.0-v2.0 |
| CSV honesto em vez de fake .xlsx | Nao pretender ser Excel; BOM + `;` + CRLF da compatibilidade real | ✅ Fase 5 v1.0 |
| Motor de categorizacao compartilhado entre parsers | Consistencia sem duplicacao; regras do usuario com precedencia universal | ✅ Fase 4 v1.0 |
| Pure functions para KPIs, sem DOM access | Testabilidade e separacao model/view | ✅ v2.0 Phase 1 |
| Health score com guards de income>0 e exposure>0 | Evitar pontuacao artificialmete alta com dados vazios | ✅ v2.0 Phase 1 |
| Alert engine com max 4 alertas priorizados | Evitar poluicao visual e alert fatigue | ✅ v2.0 Phase 1 |

## Evolution

Este documento evolui a cada transicao de milestone.
*Ultima atualizacao: 2026-04-08 — v2.0 shipped*
