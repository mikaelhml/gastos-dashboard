# Retrospective

## Milestone: v2.0 — KPI Excellence & Visual Enrichment

**Shipped:** 2026-04-08
**Phases:** 1 | **Plans:** 4

### What Was Built
- Health score composito (0-100) com 4 dimensoes financeiras
- 6 KPIs de mercado (net worth, savings rate, DTI, emergency fund, velocity, runway)
- Alert engine contextual com priorizacao e max 4 alertas
- Simulador PMT de compras parceladas com analise de impacto
- 10 funcoes de renderizacao (cards, charts, tabela, simulador UI, modal)
- 52 testes unitarios para todos os modulos novos

### What Worked
- TDD approach: testes primeiro, implementacao depois — bugs pegos cedo
- Pure function architecture: zero DOM dependency nos modulos core, testabilidade excelente
- Wave-based execution: computacao paralela na Wave 1, integracao na Wave 2, verificacao na Wave 3
- Escopo bem definido no ROADMAP com success criteria claros — entrega focada

### What Was Inefficient
- Health score precisou 3 iteracoes de tuning (empty→100, critical→40, neutral→80) antes de acertar os guards
- Worktree agents falharam por permissoes de tools (Write/Bash bloqueados) — 3 tentativas antes de abandonar worktrees
- Init tool resolveu phase errada (v1.0 ao inves de v2.0) por ambiguidade de numeracao — workaround manual
- CSS dos novos componentes usa tema claro incompativel com o dashboard escuro (descoberto no review)

### Patterns Established
- `toNumber()` + `roundMoney()` + `fmtCurrency()` como helpers compartilhados entre modulos
- Pattern destroy-before-recreate para Chart.js instances
- `escapeHtml()` em todo innerHTML (exceto alert.icon — gap encontrado no review)
- Module-level state variables para delegation entre funcoes de render

### Key Lessons
- Validar guards de edge case (income=0, exposure=0) no primeiro ciclo de testes evita retrabalho
- Worktrees isolados nao funcionam quando tools precisam de permissoes especiais
- Disambiguation de phase numbers entre milestones precisa ser resolvida no tooling
- CSS de componentes novos deve herdar variaveis do tema existente, nao hardcodar cores

### Cost Observations
- Sessions: 1 principal (longa)
- Modelo: Opus 4.6
- Notable: Fase inteira executada em sessao unica com 4 commits atomicos

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-28
**Phases:** 5 | **Plans:** 14

### What Was Built
- Pipeline de import PDF completo (Nubank, Itau, Registrato/SCR)
- Analytics multi-mes com trends e movers
- Projecao financeira com SCR/Registrato
- Categorizacao inteligente com regras + memoria
- UX polish: empty states, privacidade, CSV export, mobile

### What Worked
- Fase 1 (data safety) como fundacao antes de analytics
- Deduplicacao SHA-256 robusta desde o inicio
- Abordagem sequencial de fases com dependencias claras

### What Was Inefficient
- Phase 4 ficou bloqueada em verificacao humana por tempo prolongado
- Phase 5 planejada e verificada mas dependia de Phase 4 approval

### Key Lessons
- Human verification gates precisam de SLA ou timeout
- Planning ahead (Phase 5 antes de Phase 4 fechar) e valido mas cria WIP

---

## Cross-Milestone Trends

| Metric | v1.0 | v2.0 |
|--------|------|------|
| Phases | 5 | 1 |
| Plans | 14 | 4 |
| Tests | 60 | 52 |
| Approach | Sequential phases | Wave-based parallel |
| Key Pattern | Data-first, then analytics | TDD, pure functions |
