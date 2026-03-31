import test from 'node:test';
import assert from 'node:assert/strict';

import { PDF_LAYOUT_PROFILES } from '../../js/parsers/layout-profiles.js';
import { __test__ as nubankFaturaTest } from '../../js/parsers/nubank-fatura.js';
import { __test__ as itauFaturaTest } from '../../js/parsers/itau-fatura.js';
import { __test__ as registratoScrTest } from '../../js/parsers/registrato-scr.js';

test('layout profiles detect the main supported filename conventions', () => {
  const byId = id => PDF_LAYOUT_PROFILES.find(profile => profile.id === id);

  assert.equal(byId('nubank-conta').matchFileName('NU_10286568_01JAN2026_31JAN2026.PDF'), true);
  assert.equal(byId('nubank-fatura').matchFileName('Nubank_2026-03-14.pdf'), true);
  assert.equal(byId('itau-conta').matchFileName('itau_extrato_012026.pdf'), true);
  assert.equal(byId('itau-fatura').matchFileName('Fatura_Itau_20260326-194953.pdf'), true);
  assert.equal(byId('registrato-scr').matchFileName('SCR-05526385108-202603.pdf'), true);
});

test('nubank fatura fixture extracts due month and parses normalized card rows', () => {
  const linhas = [
    'NUBANK',
    'Data de vencimento: 16 MAR 2026',
    '01 MAR •••• 6975 Spotify 27,90',
    '05 MAR Amazon Prime 15,90',
    '07 MAR Curso de Ingles 2/12 89,90',
  ];

  const mesFatura = nubankFaturaTest.extrairMesFatura(linhas);
  const result = nubankFaturaTest.parsearLancamentos(linhas, mesFatura);

  assert.equal(nubankFaturaTest.detectarEmissorFatura(linhas), 'nubank');
  assert.equal(mesFatura, 'Mar/2026');
  assert.equal(result.lancamentos.length, 3);
  assert.deepEqual(
    result.lancamentos.map(item => ({ desc: item.desc, parcela: item.parcela || null, data: item.data })),
    [
      { desc: 'Spotify', parcela: null, data: '01/03/2026' },
      { desc: 'Amazon Prime', parcela: null, data: '05/03/2026' },
      { desc: 'Curso de Ingles', parcela: '2/12', data: '07/03/2026' },
    ],
  );
});

test('itau fatura fixture classifies issuer, profile and parses a transactional row', () => {
  const linhas = [
    'ITAU CARTOES VISA SIGNATURE',
    'Vencimento: 20/03/2026',
    'LANCAMENTOS INTERNACIONAIS',
    'DOLAR DE CONVERSAO',
  ];

  assert.equal(itauFaturaTest.detectarEmissorItau(linhas), true);
  assert.equal(itauFaturaTest.extrairMesFaturaItau(linhas), 'Mar/2026');
  assert.equal(itauFaturaTest.detectarPerfilFaturaItau(linhas), 'itau-internacional-black');

  const parsed = itauFaturaTest.parseTransactionLine('05/03 MERCADO CENTRAL 3/10 120,55', 'Mar/2026');

  assert.ok(parsed);
  assert.equal(parsed.data, '05/03/2026');
  assert.equal(parsed.fatura, 'Mar/2026');
  assert.equal(parsed.desc, 'MERCADO CENTRAL');
  assert.equal(parsed.parcela, '3/10');
  assert.equal(parsed.valor, 120.55);
});

test('registrato fixtures split monthly blocks and parse institution records', () => {
  const rawLines = [
    'Relatório de Empréstimos e Financiamentos (SCR)',
    'MÊS DE REFERÊNCIA: 03/2026 R$ 1.200,00 R$ 0,00 R$ 0,00 R$ 0,00 R$ 0,00 R$ 5.000,00',
    'CAIXA ECONOMICA FEDERAL',
    'FINANCIAMENTOS IMOBILIARIOS',
    'R$ 1.200,00',
    'R$ 0,00',
    'R$ 0,00',
    'R$ 0,00',
    'R$ 0,00',
    'R$ 5.000,00',
    'MÊS DE REFERÊNCIA: 04/2026 R$ 1.150,00 R$ 0,00 R$ 0,00 R$ 0,00 R$ 0,00 R$ 4.900,00',
  ];

  const normalizadas = registratoScrTest.normalizarLinhas(rawLines);
  const blocos = registratoScrTest.separarBlocosMensais(normalizadas);
  const registros = registratoScrTest.parsearBlocoMensal({
    mesRef: '03/2026',
    mesLabel: 'Mar/2026',
    detalheLinhas: [
      'CAIXA ECONOMICA FEDERAL',
      'FINANCIAMENTOS IMOBILIARIOS',
      'R$ 1.200,00',
      'R$ 0,00',
      'R$ 0,00',
      'R$ 0,00',
      'R$ 0,00',
      'R$ 5.000,00',
    ],
  }, 0, 'fixture.pdf', 'hash-fixture');

  assert.equal(registratoScrTest.parseMonthReference('MÊS DE REFERÊNCIA: 03/2026').mesLabel, 'Mar/2026');
  assert.equal(blocos.length, 2);
  assert.equal(blocos[0].mesRef, '03/2026');
  assert.equal(blocos[1].mesRef, '04/2026');
  assert.equal(registros.length, 1);
  assert.equal(registros[0].instituicao, 'CAIXA ECONOMICA FEDERAL');
  assert.equal(registros[0].operacoes[0].categoria, 'Financiamentos imobiliários');
  assert.equal(registros[0].operacoes[0].emDia, 1200);
  assert.equal(registros[0].operacoes[0].limite, 5000);
});
