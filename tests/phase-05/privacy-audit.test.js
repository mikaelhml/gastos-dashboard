import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrivacyAuditModel,
  normalizeImportedPdfSource,
} from '../../js/utils/privacy-audit.js';

test('normalizeImportedPdfSource maps explicit persisted source types to app labels', () => {
  assert.equal(
    normalizeImportedPdfSource({ tipo: 'registrato-scr' }).label,
    'Registrato SCR',
  );
  assert.equal(
    normalizeImportedPdfSource({ tipo: 'itau-fatura' }).label,
    'Fatura Itaú',
  );
  assert.equal(
    normalizeImportedPdfSource({ tipo: 'fatura' }).label,
    'Fatura Nubank',
  );
});

test('normalizeImportedPdfSource infers older account imports honestly from persisted shape', () => {
  assert.equal(
    normalizeImportedPdfSource({ saldoAnchor: 1250.35 }).label,
    'Extrato Itaú Conta',
  );
  assert.equal(
    normalizeImportedPdfSource({ saldoInicial: 850.10, saldoFinal: 910.45 }).label,
    'Extrato Nubank Conta',
  );
});

test('buildPrivacyAuditModel groups latest import timestamp per source', () => {
  const model = buildPrivacyAuditModel({
    counts: {
      assinaturas: 2,
      despesas: 1,
      lancamentos: 35,
      transacoes: 77,
      pdfs: 4,
      registratoMeses: 3,
    },
    pdfHistory: [
      { tipo: 'itau-fatura', importadoEm: '2026-03-18T09:00:00Z' },
      { tipo: 'itau-fatura', importadoEm: '2026-03-21T11:45:00Z' },
      { tipo: 'registrato-scr', importadoEm: '2026-03-20T07:30:00Z' },
      { saldoInicial: 100, saldoFinal: 120, importadoEm: '2026-03-19T08:15:00Z' },
    ],
    storageEstimate: {
      usage: 2048,
      quota: 4096,
    },
  });

  assert.deepEqual(
    model.importSources.map(source => source.label),
    ['Extrato Nubank Conta', 'Fatura Itaú', 'Registrato SCR'],
  );
  assert.equal(
    model.importSources.find(source => source.label === 'Fatura Itaú')?.lastImportIso,
    '2026-03-21T11:45:00Z',
  );
  assert.equal(
    model.importSources.find(source => source.label === 'Registrato SCR')?.lastImportIso,
    '2026-03-20T07:30:00Z',
  );
});

test('buildPrivacyAuditModel falls back cleanly when storage estimate data is unavailable', () => {
  const model = buildPrivacyAuditModel({
    counts: {
      assinaturas: 0,
      despesas: 0,
      lancamentos: 0,
      transacoes: 0,
      pdfs: 0,
      registratoMeses: 0,
    },
    pdfHistory: [],
    storageEstimate: null,
  });

  assert.equal(model.storage.available, false);
  assert.match(model.storage.summary, /indisponível neste navegador/i);
});

test('buildPrivacyAuditModel privacy copy is honest about backend uploads and CDN assets', () => {
  const model = buildPrivacyAuditModel({
    counts: {
      assinaturas: 1,
      despesas: 1,
      lancamentos: 1,
      transacoes: 1,
      pdfs: 1,
      registratoMeses: 1,
    },
    pdfHistory: [{ tipo: 'registrato-scr', importadoEm: '2026-03-20T07:30:00Z' }],
    storageEstimate: {
      usage: 512,
      quota: 4096,
    },
  });

  const copy = model.privacyCopy.join(' ');
  assert.match(copy, /não.*enviad[oa]s?.*backend/i);
  assert.match(copy, /Chart\.js/i);
  assert.match(copy, /PDF\.js/i);
  assert.doesNotMatch(copy, /sem chamadas de rede/i);
  assert.doesNotMatch(copy, /zero chamadas de rede/i);
});
