import test from 'node:test';
import assert from 'node:assert/strict';

import { categorizar } from '../../js/utils/categorizer.js';
import {
  buildCategorizationRuntime,
  categorizeImportedItem,
} from '../../js/utils/categorization-engine.js';

test('categorizeImportedItem honors memory > rule > default > Outros precedence', () => {
  const runtime = buildCategorizationRuntime({
    rules: [
      {
        id: 'rule-uber',
        pattern: 'UBER',
        category: 'Mobilidade Premium',
        sourceScope: 'cartao',
        directionScope: 'saida',
        enabled: true,
        priority: 1,
      },
    ],
    memories: [
      {
        key: 'MERCADO CENTRAL|conta|saida',
        descriptionNorm: 'MERCADO CENTRAL',
        sourceScope: 'conta',
        directionScope: 'saida',
        category: 'Compras Essenciais',
        enabled: true,
      },
    ],
  });

  const fromMemory = categorizeImportedItem(
    { desc: 'Mercado Central', valor: 42 },
    runtime,
    { source: 'conta', direction: 'saida' },
  );
  const fromRule = categorizeImportedItem(
    { desc: 'Uber Trip Sao Paulo', valor: 18 },
    runtime,
    { source: 'cartao', direction: 'saida' },
  );
  const fromDefault = categorizeImportedItem(
    { desc: 'Pagamento Sal GS3 Tecnologia', valor: 5000 },
    runtime,
    { source: 'conta', direction: 'entrada' },
  );
  const fromFallback = categorizeImportedItem(
    { desc: 'Loja sem categoria conhecida', valor: 15 },
    runtime,
    { source: 'conta', direction: 'saida' },
  );

  assert.deepEqual(
    {
      cat: fromMemory.cat,
      cat_origem: fromMemory.cat_origem,
      cat_regra_id: fromMemory.cat_regra_id,
    },
    {
      cat: 'Compras Essenciais',
      cat_origem: 'memoria',
      cat_regra_id: null,
    },
  );

  assert.deepEqual(
    {
      cat: fromRule.cat,
      cat_origem: fromRule.cat_origem,
      cat_regra_id: fromRule.cat_regra_id,
    },
    {
      cat: 'Mobilidade Premium',
      cat_origem: 'regra',
      cat_regra_id: 'rule-uber',
    },
  );

  assert.deepEqual(
    {
      cat: fromDefault.cat,
      cat_origem: fromDefault.cat_origem,
      cat_regra_id: fromDefault.cat_regra_id,
    },
    {
      cat: 'Salário',
      cat_origem: 'padrao',
      cat_regra_id: null,
    },
  );

  assert.deepEqual(
    {
      cat: fromFallback.cat,
      cat_origem: fromFallback.cat_origem,
      cat_regra_id: fromFallback.cat_regra_id,
    },
    {
      cat: 'Outros',
      cat_origem: 'fallback',
      cat_regra_id: null,
    },
  );
});

test('disabled entries are ignored and source/direction scopes are respected', () => {
  const runtime = buildCategorizationRuntime({
    rules: [
      {
        id: 'rule-disabled',
        pattern: 'Padaria',
        category: 'Padaria',
        enabled: false,
        priority: 1,
      },
      {
        id: 'rule-bonus',
        pattern: 'Bonus Empresa',
        category: 'Bônus',
        sourceScope: 'conta',
        directionScope: 'entrada',
        enabled: true,
        priority: 2,
      },
    ],
    memories: [
      {
        key: 'PADARIA CENTRAL|conta|saida',
        descriptionNorm: 'PADARIA CENTRAL',
        sourceScope: 'conta',
        directionScope: 'saida',
        category: 'Memoria Desabilitada',
        enabled: false,
      },
    ],
  });

  const ignoredDisabledMemory = categorizeImportedItem(
    { desc: 'Padaria Central' },
    runtime,
    { source: 'conta', direction: 'saida' },
  );
  const allowedByScope = categorizeImportedItem(
    { desc: 'Bonus Empresa' },
    runtime,
    { source: 'conta', direction: 'entrada' },
  );
  const blockedByDirection = categorizeImportedItem(
    { desc: 'Bonus Empresa' },
    runtime,
    { source: 'conta', direction: 'saida' },
  );
  const blockedBySource = categorizeImportedItem(
    { desc: 'Bonus Empresa' },
    runtime,
    { source: 'cartao', direction: 'entrada' },
  );

  assert.equal(ignoredDisabledMemory.cat, 'Outros');
  assert.equal(ignoredDisabledMemory.cat_origem, 'fallback');
  assert.equal(allowedByScope.cat, 'Bônus');
  assert.equal(blockedByDirection.cat, 'Outros');
  assert.equal(blockedBySource.cat, 'Outros');
});

test('shared engine does not mutate default categorizer rules when custom rules are loaded', () => {
  const controlDescription = 'Bonus Empresa';
  assert.equal(categorizar(controlDescription), 'Outros');

  const runtime = buildCategorizationRuntime({
    rules: [
      {
        id: 'rule-bonus',
        pattern: controlDescription,
        category: 'Bônus',
        enabled: true,
        priority: 1,
      },
    ],
  });

  const categorized = categorizeImportedItem(
    { desc: controlDescription },
    runtime,
    { source: 'conta', direction: 'entrada' },
  );

  assert.equal(categorized.cat, 'Bônus');
  assert.equal(categorizar(controlDescription), 'Outros');
});
