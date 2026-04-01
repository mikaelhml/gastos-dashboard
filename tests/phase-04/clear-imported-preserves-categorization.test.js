import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLEAR_ALL_DATA_STORE_NAMES,
  CLEAR_IMPORTED_STORE_NAMES,
} from '../../js/db.js';

test('clear imported stores never include categorization knowledge stores', () => {
  assert.equal(CLEAR_IMPORTED_STORE_NAMES.includes('categorizacao_regras'), false);
  assert.equal(CLEAR_IMPORTED_STORE_NAMES.includes('categorizacao_memoria'), false);
  assert.equal(CLEAR_IMPORTED_STORE_NAMES.includes('projecao_parametros'), false);
});

test('full clear still includes categorization knowledge stores', () => {
  assert.equal(CLEAR_ALL_DATA_STORE_NAMES.includes('categorizacao_regras'), true);
  assert.equal(CLEAR_ALL_DATA_STORE_NAMES.includes('categorizacao_memoria'), true);
  assert.equal(CLEAR_ALL_DATA_STORE_NAMES.includes('projecao_parametros'), true);
});
