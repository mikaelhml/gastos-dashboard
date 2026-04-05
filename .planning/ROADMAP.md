# Roadmap: Dashboard de Gastos Pessoais

## Shipped Milestones

- **[v1.0 — 2026-03-28](milestones/v1.0-ROADMAP.md)** — Data safety, analytics multi-mês, projeção SCR, categorização inteligente, UX polish + mobile. 5 fases · 15 planos · 10/10 requirements. ✅

## Current Milestone: v2.0 — KPI Excellence & Visual Enrichment

**Goal:** Elevar o dashboard ao nível de apps de finanças pessoais de mercado (Mobills, Pierre, Organizze, YNAB) com KPIs ricos, visualizações avançadas e insights automatizados — usando como referência o dashboard estático HTML e planilha Excel gerados dos mesmos PDFs.

**Success criteria:**
- Dashboard exibe todos os KPIs presentes no dashboard estático HTML com dados dinâmicos
- KPIs de mercado (net worth, savings rate, debt-to-income, emergency fund coverage, cash runway) calculados automaticamente
- Visual dos cards refatorado com ícones, barras de progresso e variações mês-a-mês
- Simulador de compra parcelada integrado
- Alertas contextuais inline (danger/warning/info/success)
- Projeção anual tabelada

### Phase 1: KPI, Visual & Dashboard Enrichment

**Goal:** Refatorar KPIs existentes, adicionar KPIs faltantes (do dashboard estático + planilha + mercado), enriquecer visualizações e integrar simulador de compras.

**Delivers:**
- KPI cards enriquecidos: margem livre, saúde financeira, parcelas ativas com alívio futuro, dívida consolidada, comprometimento da renda
- Projeção do próximo mês destacada na visão geral
- KPIs de mercado: net worth, savings rate, debt-to-income ratio, emergency fund coverage, spending velocity, cash runway
- Evolução SCR (gráfico de linha)
- Gráfico donut de composição de despesas
- Evolução de faturas (line chart)
- Alertas inline contextuais (danger/warning/info/success)
- Tabela de projeção anual completa
- Simulador de compra parcelada (valor, parcelas, juros, impacto)
- Despesas fixas com prioridade (Essencial/Importante/Opcional)
- Modal de detalhamento ao clicar em KPIs
- Orçamento por categoria vs realizado

**Depends on:** v1.0 complete
**Requirements:** KPI-01, KPI-02, KPI-03, VIS-01, VIS-02, SIM-01
**Plans:** 4 plans

Plans:
- [ ] 01-01-PLAN.md — KPI model extension (health score, installment relief, consolidated debt) + market KPIs + alert engine
- [ ] 01-02-PLAN.md — Purchase simulator computation module (PMT formula + impact analysis)
- [ ] 01-03-PLAN.md — View integration (enriched cards, charts, alerts, projection table, simulator UI, modals)
- [ ] 01-04-PLAN.md — Visual and functional verification checkpoint
