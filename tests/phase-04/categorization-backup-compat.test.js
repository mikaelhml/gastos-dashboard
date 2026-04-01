import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_BACKUP_VERSION,
  normalizeFullBackupStoresForRestore,
  validateFullBackupPayload,
} from '../../js/utils/full-backup-io.js';

test('normalizeFullBackupStoresForRestore defaults future preference and categorization stores to empty arrays', () => {
  const stores = normalizeFullBackupStoresForRestore(
    {
      assinaturas: [{ id: 1 }],
      lancamentos: [{ id: 2 }],
    },
    {
      requiredStoreNames: [
        'assinaturas',
        'lancamentos',
        'projecao_parametros',
        'categorizacao_regras',
        'categorizacao_memoria',
      ],
      optionalEmptyStoreNames: [
        'projecao_parametros',
        'categorizacao_regras',
        'categorizacao_memoria',
      ],
    },
  );

  assert.deepEqual(stores, {
    assinaturas: [{ id: 1 }],
    lancamentos: [{ id: 2 }],
    projecao_parametros: [],
    categorizacao_regras: [],
    categorizacao_memoria: [],
  });
});

test('normalizeFullBackupStoresForRestore still rejects missing legacy stores', () => {
  assert.throws(
    () => normalizeFullBackupStoresForRestore(
      {
        assinaturas: [],
        categorizacao_regras: [],
        categorizacao_memoria: [],
      },
      {
        requiredStoreNames: [
          'assinaturas',
          'lancamentos',
          'projecao_parametros',
          'categorizacao_regras',
          'categorizacao_memoria',
        ],
        optionalEmptyStoreNames: [
          'projecao_parametros',
          'categorizacao_regras',
          'categorizacao_memoria',
        ],
      },
    ),
    /lancamentos/,
  );
});

test('validateFullBackupPayload accepts legacy full backups missing new preference and categorization stores', () => {
  const payload = validateFullBackupPayload({
    versao: FULL_BACKUP_VERSION,
    tipo: 'gastos-dashboard-full-backup',
    exportadoEm: '2026-03-28T00:00:00.000Z',
    dbName: 'gastos_db_public',
    stores: {
      assinaturas: [],
      observacoes: [],
      despesas_fixas: [],
      lancamentos: [],
      extrato_transacoes: [],
      extrato_summary: [],
      pdfs_importados: [],
      orcamentos: [],
      assinatura_sugestoes_dispensa: [],
      registrato_sugestoes_dispensa: [],
      registrato_scr_snapshot: [],
      registrato_scr_resumo_mensal: [],
    },
  });

  assert.deepEqual(payload.stores.projecao_parametros, []);
  assert.deepEqual(payload.stores.categorizacao_regras, []);
  assert.deepEqual(payload.stores.categorizacao_memoria, []);
});
