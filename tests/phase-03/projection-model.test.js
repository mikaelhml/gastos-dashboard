import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProjectionSchedule,
  buildScrProjectionModel,
} from '../../js/utils/projection-model.js';

test('buildScrProjectionModel includes only strong account-backed matches and keeps aggregated SCR as contextual-only', () => {
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
        id: 'scr-caixa-02',
        mesRef: '02/2026',
        mesLabel: 'Fev/2026',
        instituicao: 'Caixa',
        detalheLinhas: ['CAIXA ECONOMICA FEDERAL', 'FINANCIAMENTO HABITACIONAL'],
        operacoes: [{ categoria: 'Financiamento habitacional', emDia: 1250 }],
      },
      {
        id: 'scr-caixa-03',
        mesRef: '03/2026',
        mesLabel: 'Mar/2026',
        instituicao: 'Caixa',
        detalheLinhas: ['CAIXA ECONOMICA FEDERAL', 'FINANCIAMENTO HABITACIONAL'],
        operacoes: [{ categoria: 'Financiamento habitacional', emDia: 1250 }],
      },
    ],
    registratoResumos: [
      { mesRef: '03/2026', mesLabel: 'Mar/2026', emDia: 1500, vencida: 0, outrosCompromissos: 250 },
    ],
    dismissals: [],
  });

  const included = model.commitments.find(item => item.status === 'included');
  const contextual = model.commitments.find(item => item.motivoStatus === 'aggregated-only');

  assert.ok(included, 'expected one included commitment');
  assert.equal(included.sourceChannel, 'conta');
  assert.equal(included.tipo, 'financiamento');
  assert.equal(included.institutionLabel, 'Caixa');
  assert.equal(included.valorMensal, 1250);
  assert.equal(included.projectionImpactMonthly, 1250);
  assert.deepEqual(included.mesesEvidencia, ['Jan/2026', 'Fev/2026', 'Mar/2026']);

  assert.ok(contextual, 'expected one contextual resumo-only row');
  assert.equal(contextual.status, 'contextual-only');
  assert.equal(contextual.origem, 'Registrato consolidado');
  assert.equal(contextual.projectionImpactMonthly, 0);

  assert.deepEqual(model.totals, {
    includedMonthlyTotal: 1250,
    conflictMonthlyTotal: 0,
    contextualCount: 1,
    includedCount: 1,
    conflictCount: 0,
  });
});

test('buildProjectionSchedule keeps only included SCR in math and stops scheduled items after payoff month', () => {
  const rows = buildProjectionSchedule({
    despesasFixas: [
      { desc: 'Internet', valor: 100 },
      {
        desc: 'Financiamento moto',
        valor: 500,
        parcelas: { tipo: 'financiamento', pagas: 2, total: 4, inicio: '2026-01' },
      },
    ],
    includedCommitments: [
      {
        nome: 'Financiamento habitacional — Caixa',
        valorMensal: 200,
        status: 'included',
        hintParcelas: { atual: 1, total: 3, inicio: '2026-03' },
      },
      {
        nome: 'Contexto agregado',
        valorMensal: 900,
        status: 'contextual-only',
      },
      {
        nome: 'Conflito manual',
        valorMensal: 700,
        status: 'conflict',
      },
    ],
    startMonthLabel: 'Mar/2026',
    nMeses: 3,
  });

  assert.deepEqual(rows.map(item => item.mes), ['Abr/2026', 'Mai/2026', 'Jun/2026']);
  assert.deepEqual(
    rows.map(item => ({
      mes: item.mes,
      fixoBase: item.fixoBase,
      fixoProgramado: item.fixoProgramado,
      scrIncluido: item.scrIncluido,
      totalCompromissosFixos: item.totalCompromissosFixos,
    })),
    [
      { mes: 'Abr/2026', fixoBase: 600, fixoProgramado: 600, scrIncluido: 200, totalCompromissosFixos: 800 },
      { mes: 'Mai/2026', fixoBase: 600, fixoProgramado: 100, scrIncluido: 200, totalCompromissosFixos: 300 },
      { mes: 'Jun/2026', fixoBase: 600, fixoProgramado: 100, scrIncluido: 0, totalCompromissosFixos: 100 },
    ],
  );
});
