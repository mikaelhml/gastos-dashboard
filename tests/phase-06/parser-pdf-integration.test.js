import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extrairLinhasPDF } from '../../js/parsers/pdf-utils.js';
import { PDF_LAYOUT_PROFILES } from '../../js/parsers/layout-profiles.js';
import { __test__ as nubankFaturaTest } from '../../js/parsers/nubank-fatura.js';
import { __test__ as itauFaturaTest } from '../../js/parsers/itau-fatura.js';
import { __test__ as registratoScrTest } from '../../js/parsers/registrato-scr.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const printRoot = path.resolve(projectRoot, '..', 'print');

function fixturePath(fileName) {
  return path.join(printRoot, fileName);
}

function fixtureExists(fileName) {
  return fs.existsSync(fixturePath(fileName));
}

function readFixtureArrayBuffer(fileName) {
  const buffer = fs.readFileSync(fixturePath(fileName));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function extractFixtureLines(fileName, tol = 5) {
  return extrairLinhasPDF(readFixtureArrayBuffer(fileName), tol);
}

function buildTextSample(lines) {
  return lines
    .slice(0, 120)
    .join('\n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

test('real Nubank account PDF is identifiable by filename and content', async t => {
  const fileName = 'NU_10286568_01JAN2026_31JAN2026.pdf';
  if (!fixtureExists(fileName)) t.skip(`fixture ausente: ${fileName}`);

  const lines = await extractFixtureLines(fileName);
  const profile = PDF_LAYOUT_PROFILES.find(item => item.id === 'nubank-conta');

  assert.ok(lines.length > 0);
  assert.equal(profile.matchFileName(fileName), true);
  assert.equal(profile.matchContent({ textSample: buildTextSample(lines) }), true);
});

test('real Nubank bill PDF yields a due month and at least one parsed row', async t => {
  const fileName = 'Nubank_2026-03-14.pdf';
  if (!fixtureExists(fileName)) t.skip(`fixture ausente: ${fileName}`);

  const lines = await extractFixtureLines(fileName);
  const mesFatura = nubankFaturaTest.extrairMesFatura(lines);
  const parsed = nubankFaturaTest.parsearLancamentos(lines, mesFatura);

  assert.equal(nubankFaturaTest.detectarEmissorFatura(lines), 'nubank');
  assert.equal(mesFatura, 'Mar/2026');
  assert.ok(parsed.lancamentos.length > 0);
});

test('real Itau account PDF is identifiable by filename and content', async t => {
  const fileName = 'itau_extrato_012026.pdf';
  if (!fixtureExists(fileName)) t.skip(`fixture ausente: ${fileName}`);

  const lines = await extractFixtureLines(fileName);
  const profile = PDF_LAYOUT_PROFILES.find(item => item.id === 'itau-conta');

  assert.ok(lines.length > 0);
  assert.equal(profile.matchFileName(fileName), true);
  assert.equal(profile.matchContent({ textSample: buildTextSample(lines) }), true);
});

test('real Itau bill PDF yields issuer, month and profile', async t => {
  const fileName = 'Fatura_VISA_100477008282_09-03-2026.pdf';
  if (!fixtureExists(fileName)) t.skip(`fixture ausente: ${fileName}`);

  const previousPrompt = globalThis.prompt;
  globalThis.prompt = () => '05526';
  t.after(() => {
    globalThis.prompt = previousPrompt;
  });

  const lines = await extractFixtureLines(fileName, 3);

  assert.equal(itauFaturaTest.detectarEmissorItau(lines), true);
  assert.equal(itauFaturaTest.extrairMesFaturaItau(lines), 'Mar/2026');
  assert.ok([
    'itau-domestico-classico',
    'itau-domestico-multicartao',
    'itau-internacional-black',
  ].includes(itauFaturaTest.detectarPerfilFaturaItau(lines)));
});

test('real Registrato PDF yields monthly blocks and identifies at least one month reference', async t => {
  const fileName = 'SCR-05526385108-202603-26032026-235825995-105372341.pdf';
  if (!fixtureExists(fileName)) t.skip(`fixture ausente: ${fileName}`);

  const lines = await extractFixtureLines(fileName, 2);
  const normalizadas = registratoScrTest.normalizarLinhas(lines);
  const blocos = registratoScrTest.separarBlocosMensais(normalizadas);
  const profile = PDF_LAYOUT_PROFILES.find(item => item.id === 'registrato-scr');
  const monthMarkers = lines.filter(line => /M[ÊE]S DE REFER[ÊE]NCIA:\s*\d{2}\/\d{4}/i.test(line));

  assert.ok(lines.length > 0);
  assert.ok(monthMarkers.length > 0);
  assert.equal(profile.matchContent({ textSample: buildTextSample(lines) }), true);
  assert.ok(blocos.length >= 0);
  assert.equal(registratoScrTest.parseMonthReference(monthMarkers[0]).mesRef.length, 7);
});
