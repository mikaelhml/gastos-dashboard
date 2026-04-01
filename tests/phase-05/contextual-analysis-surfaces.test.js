import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLancamentosContextSummaryViewModel } from '../../js/views/lancamentos.js';
import { buildExtratoContextSummaryViewModel } from '../../js/views/extrato.js';
import { buildRegistratoContextSummaryViewModel } from '../../js/views/registrato.js';

test('buildLancamentosContextSummaryViewModel keeps the lançamento summary short and shared', () => {
  const model = buildLancamentosContextSummaryViewModel({
    budget: {
      status: { label: 'Folga curta' },
      freeBudgetEstimate: -320,
    },
    spending: {
      strongestCategory: { cat: 'Moradia', total: 2400, share: 0.32 },
      previousMonth: 'Mar/2026',
      latestMonth: 'Abr/2026',
      movers: [
        { cat: 'Lazer', delta: 180 },
        { cat: 'Saúde', delta: -90, note: 'queda após pico pontual' },
        { cat: 'Transporte', delta: 40 },
      ],
      quality: { shouldWarn: true, note: "'Outros' ainda representa fatia relevante." },
    },
  });

  assert.equal(model.shouldRender, true);
  assert.equal(model.topCategory.label, 'Moradia');
  assert.equal(model.topCategory.note, '32% do gasto categorizado');
  assert.equal(model.movers.length, 2);
  assert.equal(model.movers[0].note, 'Mar/2026 → Abr/2026');
  assert.match(model.budget.value, /320,00/);
  assert.match(model.budget.value, /-/);
  assert.equal(model.quality.badgeClass, 'badge-yellow');
});

test('buildExtratoContextSummaryViewModel reflects shared cash pressure without recalculating', () => {
  const model = buildExtratoContextSummaryViewModel({
    budget: {
      status: { label: 'Pressão alta' },
      pressureRatio: 0.94,
      freeBudgetEstimate: -1250,
    },
    cashflow: {
      latest: { mes: 'Abr/2026', variacao: -400 },
      currentBalance: 2800,
      averageNet: 150,
    },
    debt: {
      totalExposure: 18000,
      includedProjection: 900,
    },
  });

  assert.equal(model.shouldRender, true);
  assert.equal(model.statusLabel, 'Pressão alta');
  assert.equal(model.pressureRatio, 94);
  assert.equal(model.latestMonthLabel, 'Abr/2026');
  assert.match(model.latestMonthNet, /400,00/);
  assert.match(model.latestMonthNet, /-/);
  assert.match(model.debtIncluded, /900,00/);
  assert.match(model.debtExposure, /18\.000,00/);
});

test('buildRegistratoContextSummaryViewModel exposes projection impact and budget tension', () => {
  const model = buildRegistratoContextSummaryViewModel({
    budget: {
      status: { label: 'Folga curta' },
      freeBudgetEstimate: 650,
      pressureRatio: 0.88,
    },
    debt: {
      totalExposure: 22000,
      overdue: 500,
      includedProjection: 1200,
      conflictProjection: 450,
    },
  });

  assert.equal(model.shouldRender, true);
  assert.equal(model.statusLabel, 'Folga curta');
  assert.match(model.freeBudget, /650,00/);
  assert.match(model.freeBudget, /\+/);
  assert.equal(model.pressureRatio, 88);
  assert.match(model.included, /1\.200,00/);
  assert.match(model.conflict, /450,00/);
  assert.equal(model.overdueExists, true);
});
