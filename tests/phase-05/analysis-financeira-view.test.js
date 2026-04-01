import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAnalysisSurfaceViewModel } from '../../js/views/analise-financeira.js';

test('buildAnalysisSurfaceViewModel slices shared analysis data into the dedicated tab contract', () => {
  const viewModel = buildAnalysisSurfaceViewModel({
    budget: {
      status: { tone: 'attention', label: 'Folga curta', note: 'Margem apertada.' },
      estimatedIncome: 10000,
      recurringWithCredit: 4200,
      variableSpendEstimate: 2800,
      freeBudgetEstimate: 3000,
    },
    debt: {
      totalExposure: 18000,
      overdue: 0,
      includedProjection: 900,
    },
    spending: {
      latestMonth: 'Abr/2026',
      previousMonth: 'Mar/2026',
      topCategories: [
        { cat: 'Moradia', total: 2500, share: 0.4 },
        { cat: 'Alimentação', total: 1800, share: 0.28 },
        { cat: 'Transporte', total: 900, share: 0.14 },
        { cat: 'Lazer', total: 700, share: 0.11 },
        { cat: 'Saúde', total: 500, share: 0.08 },
        { cat: 'Outros', total: 300, share: 0.05 },
      ],
      movers: [
        { cat: 'Moradia', delta: 300, status: 'up' },
        { cat: 'Lazer', delta: -150, status: 'down' },
        { cat: 'Saúde', delta: 120, status: 'new', note: 'novo gasto' },
        { cat: 'Transporte', delta: 80, status: 'up' },
      ],
      quality: { shouldWarn: false, note: '' },
    },
    cashflow: {
      months: [
        { mes: 'Jan/2026', variacao: 100 },
        { mes: 'Fev/2026', variacao: 150 },
        { mes: 'Mar/2026', variacao: -80 },
        { mes: 'Abr/2026', variacao: 220 },
        { mes: 'Mai/2026', variacao: 90 },
      ],
    },
    narrative: {
      headline: 'Leitura consolidada disponível.',
    },
    highlights: Array.from({ length: 5 }, (_, index) => ({ title: `Highlight ${index}` })),
    summaryCards: Array.from({ length: 7 }, (_, index) => ({ label: `Card ${index}`, value: index })),
  }, {
    automaticProjection: {
      inputs: { salario: 7000, rendaExtra: 500, itau: 1600, outros: 1200, meses: 12 },
      notes: Array.from({ length: 5 }, (_, index) => ({ id: `note-${index}`, label: `Nota ${index}`, value: 100 + index })),
      diagnostics: { monthsAnalyzed: 4 },
    },
    scrProjectionModel: {
      totals: {
        includedCount: 2,
        contextualCount: 1,
        conflictCount: 3,
        conflictMonthlyTotal: 450,
      },
    },
  });

  assert.equal(viewModel.status.label, 'Folga curta');
  assert.equal(viewModel.summaryCards.length, 6);
  assert.equal(viewModel.highlights.length, 4);
  assert.equal(viewModel.topCategories.length, 5);
  assert.equal(viewModel.movers.length, 3);
  assert.deepEqual(viewModel.recentMonths.map(item => item.mes), ['Fev/2026', 'Mar/2026', 'Abr/2026', 'Mai/2026']);
  assert.equal(viewModel.simulation.notes.length, 4);
  assert.equal(viewModel.simulation.inputs.meses, 12);
  assert.equal(viewModel.simulation.includedCount, 2);
  assert.equal(viewModel.simulation.conflictMonthlyTotal, 450);
  assert.equal(viewModel.hasUsefulData, true);
});

test('buildAnalysisSurfaceViewModel returns a safe empty contract when shared analysis is unavailable', () => {
  const viewModel = buildAnalysisSurfaceViewModel(null, {});

  assert.equal(viewModel.status.label, 'Sem base suficiente');
  assert.equal(viewModel.summaryCards.length, 0);
  assert.equal(viewModel.topCategories.length, 0);
  assert.equal(viewModel.recentMonths.length, 0);
  assert.equal(viewModel.simulation.notes.length, 0);
  assert.equal(viewModel.hasUsefulData, false);
});
