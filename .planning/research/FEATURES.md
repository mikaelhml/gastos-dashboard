# Research: Feature Focus

## Existing Baseline To Preserve

The current app already provides:
- PDF import with layout routing for Nubank, Itau, and Registrato/SCR
- local IndexedDB persistence
- dashboard tabs for overview, subscriptions, fixed expenses, installments, launches, account extract, projection, Registrato, and import
- manual settings/config export for `assinaturas` and `despesas_fixas`
- initial Registrato/SCR suggestions and context

These are the baseline and should not regress.

## Approved v1 Focus

### 1. Data integrity and recovery
- Safe reimport for existing periods without deleting unrelated imported data
- Better duplicate protection than file-hash-only behavior
- Full JSON backup of the whole dashboard dataset
- Full JSON restore back into local storage

### 2. Better analytical reading
- Spending trends by category across months
- Clear month-over-month comparison so the user can see where spending rose or fell

### 3. Projection that uses imported commitments
- Registrato/SCR-derived commitments should influence the actual projection output
- The UI should make clear what part of the projection comes from SCR-derived context

### 4. User-controlled categorization
- Editable custom categorization rules
- Future imports apply user rules before default heuristics
- Manual category corrections can be remembered for the future

## Good Later Candidates

These fit the product, but were not selected as current v1 priorities:
- import diagnostics and richer parser feedback UI
- budget vs actual UI on top of `orcamentos`
- free-text transaction search
- automatic installment tracking from imported card bills
- privacy/audit screen
- subscription detection from recurring transaction patterns

## Explicitly Later / Deeper Work

These are promising, but heavier or less urgent right now:
- seasonality or heatmap analytics
- what-if scenario engine by category
- multi-bank reconciliation views
- spreadsheet export
- OCR fallback for image PDFs

## Anti-Features For This Milestone

Do not route the product toward:
- backend or cloud sync
- Open Finance integrations
- external AI categorization APIs
- multi-user account systems
- generic CSV ingestion for arbitrary banks

## Planning Takeaway

The selected v1 is best understood as four practical pillars:
1. trust the imported data
2. back it up safely
3. read the spending trends
4. let the app adapt to the user's own categorization behavior
