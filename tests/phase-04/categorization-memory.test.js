import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCategoryMemoryRecord,
  normalizeCategoryText,
} from '../../js/utils/categorization-engine.js';

test('buildCategoryMemoryRecord creates deterministic category-only memory payloads', () => {
  const record = buildCategoryMemoryRecord({
    desc: '  Débito Café São João  ',
    source: 'conta',
    direction: 'saida',
    category: '  Alimentação  ',
    learnedFrom: 'manual-edit',
  });

  assert.deepEqual(record, {
    key: 'DEBITO CAFE SAO JOAO|conta|saida',
    descriptionNorm: 'DEBITO CAFE SAO JOAO',
    sourceScope: 'conta',
    directionScope: 'saida',
    category: 'Alimentação',
    enabled: true,
    learnedFrom: 'manual-edit',
  });
  assert.equal(normalizeCategoryText('  Transporte  '), 'Transporte');
  assert.equal('tipo_classificado' in record, false);
  assert.equal('classificado_nome' in record, false);
});
