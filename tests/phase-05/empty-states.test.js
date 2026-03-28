import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEmptyStateViewModels } from '../../js/utils/empty-states.js';

function collectIntents(model) {
  return [
    ...model.overview.actions,
    ...model.statement.actions,
    ...model.transactions.actions,
    ...model.import.actions,
  ].map(action => action.intent);
}

test('fully empty local data returns first-run guidance for all targeted tabs', () => {
  const model = buildEmptyStateViewModels();

  assert.equal(model.hasImportedData, false);
  assert.equal(model.hasManualData, false);
  assert.equal(model.shouldShowImportFirstStep, true);
  assert.equal(model.overview.shouldRender, true);
  assert.equal(model.statement.shouldRender, true);
  assert.equal(model.transactions.shouldRender, true);
  assert.equal(model.import.shouldRender, true);

  const intents = new Set(collectIntents(model));
  assert.deepEqual(
    [...intents].sort(),
    ['assinaturas', 'despesas', 'importar', 'restaurar-backup'].sort(),
  );
});

test('manual-only data acknowledges recurring setup while keeping imported analytics gated', () => {
  const model = buildEmptyStateViewModels({
    manualSubscriptionCount: 2,
    manualFixedExpenseCount: 1,
  });

  assert.equal(model.hasImportedData, false);
  assert.equal(model.hasManualData, true);
  assert.equal(model.shouldShowImportFirstStep, false);
  assert.equal(model.overview.shouldRender, true);
  assert.equal(model.statement.shouldRender, true);
  assert.equal(model.transactions.shouldRender, true);
  assert.equal(model.import.shouldRender, false);
  assert.match(model.overview.title, /compromissos recorrentes/i);
  assert.match(model.statement.body, /importa PDFs de conta/i);
  assert.deepEqual(
    model.transactions.actions.map(action => action.intent),
    ['importar', 'assinaturas', 'despesas'],
  );
});

test('imported data disables heavy first-run surfaces', () => {
  const model = buildEmptyStateViewModels({
    importedTransactionCount: 4,
  });

  assert.equal(model.hasImportedData, true);
  assert.equal(model.shouldShowImportFirstStep, false);
  assert.equal(model.overview.shouldRender, false);
  assert.equal(model.statement.shouldRender, false);
  assert.equal(model.transactions.shouldRender, false);
  assert.equal(model.import.shouldRender, false);
});

test('helper text stays grounded in current capabilities only', () => {
  const model = buildEmptyStateViewModels();
  const combinedText = JSON.stringify(model).toLowerCase();

  assert.doesNotMatch(combinedText, /privacidade|privacy tab/);
  assert.doesNotMatch(combinedText, /sync|sincroniza/);
  assert.doesNotMatch(combinedText, /wizard|assistente/);
  assert.doesNotMatch(combinedText, /\.xlsx|excel nativo|upload para backend/);
});
