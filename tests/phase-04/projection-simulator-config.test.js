import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROJECTION_SIMULATOR_CONFIG_KEY,
  buildProjectionSimulatorConfigRecord,
  normalizeProjectionSimulatorConfig,
  serializeProjectionSimulatorConfig,
} from '../../js/utils/projection-simulator-config.js';

test('normalizeProjectionSimulatorConfig keeps valid persisted values and falls back invalid fields to automatic defaults', () => {
  const config = normalizeProjectionSimulatorConfig(
    {
      salario: 7200.555,
      rendaExtra: -50,
      itau: '2300.4',
      outros: Number.NaN,
      meses: 18,
    },
    {
      salario: 6000,
      rendaExtra: 400,
      itau: 2100,
      outros: 900,
      meses: 12,
    },
  );

  assert.deepEqual(config, {
    key: PROJECTION_SIMULATOR_CONFIG_KEY,
    salario: 7200.56,
    rendaExtra: 400,
    itau: 2300.4,
    outros: 900,
    meses: 12,
  });
});

test('buildProjectionSimulatorConfigRecord creates a singleton payload with timestamp', () => {
  const record = buildProjectionSimulatorConfigRecord(
    { salario: 5000, rendaExtra: 250, itau: 1800, outros: 600, meses: 24 },
    {},
    '2026-04-01T12:00:00.000Z',
  );

  assert.deepEqual(record, {
    key: PROJECTION_SIMULATOR_CONFIG_KEY,
    salario: 5000,
    rendaExtra: 250,
    itau: 1800,
    outros: 600,
    meses: 24,
    updatedAt: '2026-04-01T12:00:00.000Z',
  });
});

test('serializeProjectionSimulatorConfig strips IndexedDB-only metadata for JSON export', () => {
  assert.deepEqual(
    serializeProjectionSimulatorConfig({
      key: PROJECTION_SIMULATOR_CONFIG_KEY,
      salario: 6100,
      rendaExtra: 300,
      itau: 1900,
      outros: 700,
      meses: 6,
      updatedAt: '2026-04-01T12:00:00.000Z',
    }),
    {
      salario: 6100,
      rendaExtra: 300,
      itau: 1900,
      outros: 700,
      meses: 6,
    },
  );
});
