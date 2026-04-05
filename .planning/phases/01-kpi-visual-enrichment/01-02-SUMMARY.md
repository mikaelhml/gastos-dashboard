---
phase: 01-kpi-visual-enrichment
plan: 02
status: complete
---

# Plan 01-02 Summary: Purchase Simulator

## What was built
- Created `purchase-simulator.js` with 2 exported pure functions:
  - `simulateInstallmentPurchase` — PMT formula for compound interest, simple division for zero interest, returns null on invalid input
  - `computePurchaseImpact` — assesses viability against free budget and income ratios

## Files modified
- `js/utils/purchase-simulator.js` — new module
- `tests/phase-01/purchase-simulator.test.js` — 10 tests

## Test results
10/10 tests passing
