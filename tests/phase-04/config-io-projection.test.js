import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConfigPayload,
  mergeProjectionSimulatorConfig,
  normalizeConfigPayload,
} from '../../js/utils/config-io.js';

test('buildConfigPayload includes persisted simulator preferences in config export JSON', () => {
  const payload = buildConfigPayload({
    assinaturas: [{ nome: 'Netflix', cat: 'Streaming', valor: 39.9, icon: '🎬' }],
    despesasFixas: [{ cat: 'Moradia', desc: 'Aluguel', valor: 1800, obs: 'Mensal' }],
    projectionSimulatorConfig: {
      key: 'default',
      salario: 7000,
      rendaExtra: 500,
      itau: 2200,
      outros: 900,
      meses: 12,
      updatedAt: '2026-04-01T10:00:00.000Z',
    },
    exportadoEm: '2026-04-01T10:00:00.000Z',
  });

  assert.deepEqual(payload.projecao_simulador, {
    salario: 7000,
    rendaExtra: 500,
    itau: 2200,
    outros: 900,
    meses: 12,
  });
});

test('normalizeConfigPayload keeps legacy config JSON valid when projection preferences are absent', () => {
  const normalized = normalizeConfigPayload({
    versao: 1,
    exportadoEm: '2026-04-01T10:00:00.000Z',
    assinaturas: [],
    despesas_fixas: [],
  });

  assert.equal(normalized.hasProjectionSimulator, false);
  assert.equal(normalized.projecao_simulador, undefined);
});

test('normalizeConfigPayload normalizes imported simulator preferences into the singleton IndexedDB shape', () => {
  const normalized = normalizeConfigPayload({
    versao: 1,
    exportadoEm: '2026-04-01T10:00:00.000Z',
    assinaturas: [],
    despesas_fixas: [],
    projecao_simulador: {
      salario: 7000,
      rendaExtra: -10,
      itau: 2100,
      outros: 800,
      meses: 18,
    },
  });

  assert.equal(normalized.hasProjectionSimulator, true);
  assert.deepEqual(normalized.projecao_simulador, {
    key: 'default',
    salario: 7000,
    rendaExtra: 0,
    itau: 2100,
    outros: 800,
    meses: 6,
    updatedAt: normalized.projecao_simulador.updatedAt,
  });
  assert.match(normalized.projecao_simulador.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('mergeProjectionSimulatorConfig preserves the current simulator config during merge imports', () => {
  const currentConfig = {
    key: 'default',
    salario: 6500,
    rendaExtra: 400,
    itau: 1800,
    outros: 700,
    meses: 12,
    updatedAt: '2026-04-01T09:00:00.000Z',
  };
  const importedConfig = normalizeConfigPayload({
    versao: 1,
    exportadoEm: '2026-04-01T10:00:00.000Z',
    assinaturas: [],
    despesas_fixas: [],
    projecao_simulador: {
      salario: 9000,
      rendaExtra: 1000,
      itau: 2500,
      outros: 1200,
      meses: 24,
    },
  }).projecao_simulador;

  assert.deepEqual(mergeProjectionSimulatorConfig(currentConfig, importedConfig), currentConfig);
});

test('mergeProjectionSimulatorConfig uses the normalized imported simulator config when there is no current config', () => {
  const importedConfig = normalizeConfigPayload({
    versao: 1,
    exportadoEm: '2026-04-01T10:00:00.000Z',
    assinaturas: [],
    despesas_fixas: [],
    projecao_simulador: {
      salario: 7000,
      rendaExtra: -10,
      itau: 2100,
      outros: 800,
      meses: 18,
    },
  }).projecao_simulador;

  assert.deepEqual(mergeProjectionSimulatorConfig(null, importedConfig), importedConfig);
});
