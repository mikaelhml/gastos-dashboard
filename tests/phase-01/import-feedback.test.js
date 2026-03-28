import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImportResultViewModel,
  buildWarningsViewModel,
} from '../../js/utils/import-feedback.js';

test('successful import renders a stable trust badge label', () => {
  const viewModel = buildImportResultViewModel({
    tipoLabel: 'Fatura Nubank',
    unitLabel: 'transação',
    resultado: {
      importado: 28,
      quality: {
        score: 94,
        label: '28 transações · confiança 94%',
      },
      warnings: [{ code: 'x', message: 'ok', level: 'info' }],
    },
  });

  assert.equal(viewModel.tone, 'success');
  assert.equal(viewModel.qualityLabel, '28 transações · confiança 94%');
});

test('duplicate and parse-error states map to distinct result statuses', () => {
  const duplicateVm = buildImportResultViewModel({
    tipoLabel: 'Extrato Nubank Conta',
    resultado: { duplicata: true },
  });
  const errorVm = buildImportResultViewModel({
    tipoLabel: 'Extrato Nubank Conta',
    resultado: { erro: 'Falhou' },
  });

  assert.equal(duplicateVm.statusText, 'Extrato Nubank Conta duplicado');
  assert.equal(duplicateVm.tone, 'warning');
  assert.equal(errorVm.statusText, 'Erro ao parsear Extrato Nubank Conta');
  assert.equal(errorVm.tone, 'error');
});

test('empty warnings render a neutral "Sem avisos" view model', () => {
  const viewModel = buildWarningsViewModel([]);

  assert.equal(viewModel.hasWarnings, false);
  assert.equal(viewModel.emptyLabel, 'Sem avisos');
  assert.equal(viewModel.summaryLabel, 'Sem avisos');
});

test('long warning lists are truncated with overflow count', () => {
  const viewModel = buildWarningsViewModel([
    { message: 'A', level: 'warning' },
    { message: 'B', level: 'warning' },
    { message: 'C', level: 'info' },
    { message: 'D', level: 'info' },
  ], 3);

  assert.equal(viewModel.hasWarnings, true);
  assert.equal(viewModel.items.length, 3);
  assert.equal(viewModel.overflowCount, 1);
});
