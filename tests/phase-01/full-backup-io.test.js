import test from 'node:test';
import assert from 'node:assert/strict';

import { FULL_BACKUP_STORE_NAMES } from '../../js/db.js';
import {
  FULL_BACKUP_VERSION,
  buildFullBackupPayload,
  summarizeFullBackupPayload,
  validateFullBackupPayload,
} from '../../js/utils/full-backup-io.js';

function createStoresFixture() {
  return Object.fromEntries(
    FULL_BACKUP_STORE_NAMES.map((storeName, index) => [
      storeName,
      [{ id: index + 1, store: storeName }],
    ]),
  );
}

test('valid payload includes metadata plus every current store', () => {
  const payload = buildFullBackupPayload({
    stores: createStoresFixture(),
    exportadoEm: '2026-03-28T00:00:00.000Z',
  });

  assert.equal(payload.versao, FULL_BACKUP_VERSION);
  assert.equal(payload.tipo, 'gastos-dashboard-full-backup');
  assert.deepEqual(Object.keys(payload.stores), FULL_BACKUP_STORE_NAMES);
});

test('config-only or malformed JSON is rejected before restore', () => {
  assert.throws(
    () => validateFullBackupPayload({
      versao: 1,
      assinaturas: [],
      despesas_fixas: [],
    }),
    /Tipo de backup invalido|stores ausentes/,
  );
});

test('missing required stores fail validation with descriptive error', () => {
  const stores = createStoresFixture();
  delete stores.lancamentos;

  assert.throws(
    () => buildFullBackupPayload({ stores }),
    /lancamentos/,
  );
});

test('valid payload round-trips record arrays without mutation', () => {
  const stores = createStoresFixture();
  stores.lancamentos = [
    { id: 1, desc: 'Mercado', valor: 10.5 },
    { id: 2, desc: 'Cinema', valor: 42 },
  ];

  const payload = buildFullBackupPayload({ stores });
  const validated = validateFullBackupPayload(payload);
  const summary = summarizeFullBackupPayload(validated);

  assert.deepEqual(validated.stores.lancamentos, stores.lancamentos);
  assert.equal(summary.stores, FULL_BACKUP_STORE_NAMES.length);
  assert.equal(summary.totalRegistros, FULL_BACKUP_STORE_NAMES.length + 1);
});
