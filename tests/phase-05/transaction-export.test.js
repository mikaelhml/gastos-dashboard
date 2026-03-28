/**
 * Tests para js/utils/transaction-export.js
 * Execução: node --test tests/phase-05/transaction-export.test.js
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import { buildTransactionsCsv } from '../../js/utils/transaction-export.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides = {}) {
  return {
    data:             '01/01/2026',
    fatura:           'Jan/2026',
    source:           'cartao',
    canal:            'pix',
    desc:             'Padaria Central',
    cat:              'Alimentação',
    tipo_classificado: 'despesa',
    valor:            45.90,
    ...overrides,
  };
}

function csvLines(csv) {
  // Remove BOM e divide por CRLF
  return csv.replace(/^\uFEFF/, '').split('\r\n');
}

// ── testes ───────────────────────────────────────────────────────────────────

test('prefixes UTF-8 BOM', () => {
  const csv = buildTransactionsCsv([]);
  assert.ok(csv.startsWith('\uFEFF'), 'Deve começar com BOM UTF-8');
});

test('header uses semicolon delimiter', () => {
  const csv = buildTransactionsCsv([]);
  const header = csvLines(csv)[0];
  assert.ok(header.includes(';'), 'Header deve usar ponto-e-vírgula');
  assert.equal(header, 'data;mes_ou_fatura;origem;canal;descricao;categoria;tipo_movimento;valor');
});

test('lines separated by CRLF', () => {
  const csv = buildTransactionsCsv([makeRow()]);
  assert.ok(csv.includes('\r\n'), 'Linhas devem ser separadas por CRLF');
  assert.ok(!csv.replace(/\r\n/g, '').includes('\n'), 'Não deve ter LF avulso');
});

test('exports raw numeric valor, not formatted currency', () => {
  const csv = buildTransactionsCsv([makeRow({ valor: 1234.56 })]);
  assert.ok(csv.includes('1234.56'), 'Deve exportar valor numérico bruto');
  assert.ok(!csv.includes('R$'), 'Não deve usar R$');
  assert.ok(!csv.includes('fmt'), 'Não deve chamar fmt()');
});

test('preserves row ordering from input', () => {
  const rows = [
    makeRow({ desc: 'PRIMEIRO', valor: 10 }),
    makeRow({ desc: 'SEGUNDO',  valor: 20 }),
    makeRow({ desc: 'TERCEIRO', valor: 30 }),
  ];
  const lines = csvLines(buildTransactionsCsv(rows)).slice(1); // pula header
  assert.ok(lines[0].includes('PRIMEIRO'), 'Linha 1 deve ser PRIMEIRO');
  assert.ok(lines[1].includes('SEGUNDO'),  'Linha 2 deve ser SEGUNDO');
  assert.ok(lines[2].includes('TERCEIRO'), 'Linha 3 deve ser TERCEIRO');
});

test('excludes contextoDerivado rows', () => {
  const rows = [
    makeRow({ desc: 'Transação Real' }),
    makeRow({ desc: 'Linha SCR', cat: 'Contexto SCR', contextoDerivado: true }),
  ];
  const csv = buildTransactionsCsv(rows);
  assert.ok(csv.includes('Transação Real'), 'Deve incluir transação real');
  assert.ok(!csv.includes('Linha SCR'), 'Deve excluir linhas contextoDerivado');
});

test('escapes double quotes inside cell values (RFC 4180)', () => {
  const row = makeRow({ desc: 'Empresa "ABC" Ltda' });
  const csv = buildTransactionsCsv([row]);
  assert.ok(csv.includes('"Empresa ""ABC"" Ltda"'), 'Aspas duplas devem ser duplicadas e célula envolvida em aspas');
});

test('escapes semicolons inside cell values', () => {
  const row = makeRow({ desc: 'Pix; recebido' });
  const csv = buildTransactionsCsv([row]);
  assert.ok(csv.includes('"Pix; recebido"'), 'Ponto-e-vírgula na descrição deve estar envolvido em aspas');
});

test('escapes newlines inside cell values', () => {
  const row = makeRow({ desc: 'linha1\nlinha2' });
  const csv = buildTransactionsCsv([row]);
  assert.ok(csv.includes('"linha1\nlinha2"'), 'Newline na célula deve ser envolvido em aspas');
});

test('handles accented characters without corruption', () => {
  const row = makeRow({ desc: 'Padaria São João', cat: 'Alimentação' });
  const csv = buildTransactionsCsv([row]);
  assert.ok(csv.includes('São João'), 'Acentos devem ser preservados');
  assert.ok(csv.includes('Alimentação'), 'Ç deve ser preservado');
});

test('empty rows list returns only header', () => {
  const csv = buildTransactionsCsv([]);
  const lines = csvLines(csv).filter(l => l.length > 0);
  assert.equal(lines.length, 1, 'Com lista vazia deve exportar apenas o header');
});

test('uses fatura field for mes_ou_fatura column', () => {
  const row = makeRow({ fatura: 'Fev/2026', mes: 'outro' });
  const csv = buildTransactionsCsv([row]);
  const dataLine = csvLines(csv)[1];
  assert.ok(dataLine.includes('Fev/2026'), 'Deve preferir fatura sobre mes');
});

test('falls back to mes when fatura is absent', () => {
  const row = makeRow({ fatura: undefined, mes: 'Mar/2026' });
  const csv = buildTransactionsCsv([row]);
  const dataLine = csvLines(csv)[1];
  assert.ok(dataLine.includes('Mar/2026'), 'Deve usar mes quando fatura está ausente');
});
