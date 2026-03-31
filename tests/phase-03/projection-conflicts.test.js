import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScrProjectionModel } from '../../js/utils/projection-model.js';

test('buildScrProjectionModel surfaces manual overlap as conflict instead of auto-including it', () => {
  const model = buildScrProjectionModel({
    despesasFixas: [
      {
        id: 'df-1',
        desc: 'Financiamento habitacional Caixa',
        nome: 'Financiamento habitacional Caixa',
        valor: 1250,
        parcelas: { tipo: 'financiamento', pagas: 12, total: 360, inicio: '2025-04' },
      },
    ],
    lancamentos: [],
    extratoTransacoes: [
      { mes: 'Jan/2026', desc: 'DEBITO CAIXA HABITACAO', valor: 1250, tipo: 'saida', cat: 'Moradia' },
      { mes: 'Fev/2026', desc: 'DEBITO CAIXA HABITACAO', valor: 1250, tipo: 'saida', cat: 'Moradia' },
      { mes: 'Mar/2026', desc: 'DEBITO CAIXA HABITACAO', valor: 1250, tipo: 'saida', cat: 'Moradia' },
    ],
    registratoSnapshots: [
      {
        id: 'scr-caixa-03',
        mesRef: '03/2026',
        mesLabel: 'Mar/2026',
        instituicao: 'Caixa',
        detalheLinhas: ['CAIXA ECONOMICA FEDERAL', 'FINANCIAMENTO HABITACIONAL'],
        operacoes: [{ categoria: 'Financiamento habitacional', emDia: 1250 }],
      },
    ],
    registratoResumos: [],
    dismissals: [],
  });

  const conflict = model.commitments.find(item => item.status === 'conflict');

  assert.ok(conflict, 'expected one conflict');
  assert.equal(conflict.motivoStatus, 'manual-conflict');
  assert.equal(conflict.projectionImpactMonthly, 0);
  assert.equal(conflict.conflictWith?.id, 'df-1');
  assert.match(conflict.conflictWith?.desc || '', /Caixa/i);
  assert.equal(model.totals.includedCount, 0);
  assert.equal(model.totals.conflictCount, 1);
  assert.equal(model.totals.conflictMonthlyTotal, 1250);
});

test('buildScrProjectionModel downgrades card-backed matches to contextual-only to avoid double counting', () => {
  const model = buildScrProjectionModel({
    despesasFixas: [],
    lancamentos: [
      { fatura: 'Jan/2026', desc: 'ITAUCARD CREDITO PESSOAL', valor: 450, cat: 'Financeiro' },
      { fatura: 'Fev/2026', desc: 'ITAUCARD CREDITO PESSOAL', valor: 450, cat: 'Financeiro' },
      { fatura: 'Mar/2026', desc: 'ITAUCARD CREDITO PESSOAL', valor: 450, cat: 'Financeiro' },
    ],
    extratoTransacoes: [],
    registratoSnapshots: [
      {
        id: 'scr-itau-03',
        mesRef: '03/2026',
        mesLabel: 'Mar/2026',
        instituicao: 'Itaú',
        detalheLinhas: ['ITAU UNIBANCO', 'CREDITO PESSOAL'],
        operacoes: [{ categoria: 'Crédito pessoal', emDia: 450 }],
      },
    ],
    registratoResumos: [],
    dismissals: [],
  });

  const contextual = model.commitments.find(item => item.motivoStatus === 'card-bucket-risk');

  assert.ok(contextual, 'expected a contextual-only card risk row');
  assert.equal(contextual.status, 'contextual-only');
  assert.equal(contextual.sourceChannel, 'cartao');
  assert.equal(contextual.projectionImpactMonthly, 0);
  assert.equal(model.totals.includedMonthlyTotal, 0);
  assert.equal(model.totals.contextualCount, 1);
});

test('buildScrProjectionModel honors resolved Registrato suggestion keys and keeps the commitment out of math', () => {
  const model = buildScrProjectionModel({
    despesasFixas: [],
    lancamentos: [],
    extratoTransacoes: [
      { mes: 'Jan/2026', desc: 'DEBITO CAIXA HABITACAO', valor: 1250, tipo: 'saida', cat: 'Moradia' },
      { mes: 'Fev/2026', desc: 'DEBITO CAIXA HABITACAO', valor: 1250, tipo: 'saida', cat: 'Moradia' },
      { mes: 'Mar/2026', desc: 'DEBITO CAIXA HABITACAO', valor: 1250, tipo: 'saida', cat: 'Moradia' },
    ],
    registratoSnapshots: [
      {
        id: 'scr-caixa-03',
        mesRef: '03/2026',
        mesLabel: 'Mar/2026',
        instituicao: 'Caixa',
        detalheLinhas: ['CAIXA ECONOMICA FEDERAL', 'FINANCIAMENTO HABITACIONAL'],
        operacoes: [{ categoria: 'Financiamento habitacional', emDia: 1250 }],
      },
    ],
    registratoResumos: [],
    dismissals: [
      { key: 'registrato:caixa:financiamento-habitacional:conta:caixa:DEBITO CAIXA HABITACAO' },
    ],
  });

  const dismissed = model.commitments.find(item => item.motivoStatus === 'dismissed');

  assert.ok(dismissed, 'expected one dismissed contextual commitment');
  assert.equal(dismissed.status, 'contextual-only');
  assert.equal(dismissed.projectionImpactMonthly, 0);
  assert.equal(model.totals.includedCount, 0);
});
