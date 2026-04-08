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

### Phase 1: KPI, Visual & Dashboard Enrichment ✅

**Goal:** Refatorar KPIs existentes, adicionar KPIs faltantes (do dashboard estático + planilha + mercado), enriquecer visualizações e integrar simulador de compras.

**Status:** Complete — 2026-04-05
**Results:** 52 unit tests passing, user-approved visual verification

Plans:
- [x] 01-01-PLAN.md — KPI model extension (health score, installment relief, consolidated debt) + market KPIs + alert engine
- [x] 01-02-PLAN.md — Purchase simulator computation module (PMT formula + impact analysis)
- [x] 01-03-PLAN.md — View integration (enriched cards, charts, alerts, projection table, simulator UI, modals)
- [x] 01-04-PLAN.md — Visual and functional verification checkpoint
