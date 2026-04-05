# Requirements: Dashboard de Gastos Pessoais

**Defined:** 2026-03-28
**Core Value:** Dar visibilidade financeira util e privada a partir de dados bancarios reais, com tudo processado e armazenado localmente.

## v1 Requirements

### Data Integrity

- [ ] **DATA-01**: User can reimport statements and card bills for an already-imported period without duplicating transactions or deleting data from other sources.
- [ ] **DATA-02**: User can export the full local dashboard dataset to a portable JSON backup file.
- [ ] **DATA-03**: User can restore a full dashboard backup from a JSON file into local storage with validation of imported data.

### Analytics

- [ ] **ANLY-01**: User can view spending trends by category across multiple months using imported financial data.
- [ ] **ANLY-02**: User can compare month-over-month category movement in a way that highlights where spending increased or decreased.

### Projection

- [ ] **PROJ-01**: User can have Registrato/SCR commitments automatically included in projection calculations when compatible imported data exists.
- [ ] **PROJ-02**: User can understand which projection values are being influenced by Registrato/SCR-derived commitments.

### Categorization

- [ ] **CATG-01**: User can create, edit, and remove custom categorization rules for imported transactions.
- [ ] **CATG-02**: User-defined categorization rules are applied to future imports before fallback default categorization rules.
- [ ] **CATG-03**: User can have a manual category correction remembered and reused automatically on future matching transactions.

## v2 Requirements

### Import Experience

- **IMPT-01**: User can inspect import diagnostics that explain which rows failed to parse and why.
- **IMPT-02**: User can retry failed imports or review file-specific parsing warnings without reimporting everything.

### Planning and Search

- **PLAN-01**: User can compare budget versus actual spending by category with a visible budget management UI.
- **SRCH-01**: User can search transactions by free text across imported history.

### Installments

- **INST-01**: User can have installment purchases detected automatically from imported card statements and linked across months.
- **INST-02**: User can track remaining installment balance and expected payoff date without manual entry.

### Insights

- **INST-03**: User can receive automated financial insight cards based on trends, anomalies, and recurring commitments.
- **SUBS-01**: User can receive subscription suggestions inferred from recurring transaction patterns.
- **PRIV-01**: User can view a privacy/audit screen explaining local storage usage and confirming local-only processing.

## v2 Requirements — KPI Excellence & Visual Enrichment

### KPI Enrichment

- [ ] **KPI-01**: User can view enriched KPI cards with margin libre, financial health score, active installments with future relief, consolidated debt, and income commitment ratio — all derived dynamically from imported data.
- [ ] **KPI-02**: User can view market-standard financial KPIs (net worth, savings rate, debt-to-income ratio, emergency fund coverage, spending velocity, cash runway) calculated automatically from existing data.
- [ ] **KPI-03**: User can view a next-month projection card highlighted in the overview, showing expected income, installments, fixed costs, and free balance.

### Visual Enrichment

- [ ] **VIS-01**: User can see enriched card visuals with icons, progress bars, month-over-month variations, and contextual inline alerts (danger/warning/info/success).
- [ ] **VIS-02**: User can view line charts (invoice evolution, SCR evolution), donut charts (expense composition), and a complete annual projection table.

### Simulator

- [ ] **SIM-01**: User can simulate installment purchases with value, number of installments, interest rate, and see the impact on free balance before committing.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend or cloud sync | Conflicts directly with the local-first privacy promise |
| Open Finance / bank API integration | Requires server-side auth/token handling and changes the product model |
| External AI categorization APIs | Would send financial data outside the device |
| Multi-user / family accounts | Not aligned with the current single-user local product direction |
| Generic CSV import for any bank | High support burden and weaker reliability than dedicated parsers |
| Investment market price tracking | Depends on external feeds and is not part of the current core value |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| ANLY-01 | Phase 2 | Pending |
| ANLY-02 | Phase 2 | Pending |
| PROJ-01 | Phase 3 | Pending |
| PROJ-02 | Phase 3 | Pending |
| CATG-01 | Phase 4 | Pending |
| CATG-02 | Phase 4 | Pending |
| CATG-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 after initial definition*
