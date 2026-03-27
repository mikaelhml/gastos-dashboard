import { extrairLinhasPDF } from './pdf-utils.js';
import { importarNubankConta } from './nubank-conta.js';
import { importarNubankFatura } from './nubank-fatura.js';
import { importarItauFatura, pareceFaturaItauPorNome } from './itau-fatura.js';
import { importarItauConta } from './itau-conta.js';

const CONTA_FILE_RE = /^NU_\d+_\d{2}[A-Z]{3}\d{4}_\d{2}[A-Z]{3}\d{4}\.PDF$/i;

export const PDF_LAYOUT_PROFILES = [
  {
    id: 'nubank-conta',
    label: 'Extrato Nubank Conta',
    badgeClass: 'badge-blue',
    phaseLabel: 'Extrato conta',
    importer: importarNubankConta,
    matchFileName: fileName => CONTA_FILE_RE.test(String(fileName ?? '').toUpperCase()),
    matchContent: ({ textSample }) =>
      textSample.includes('TOTAL DE ENTRADAS') &&
      (textSample.includes('SALDO FINAL') || textSample.includes('SALDO INICIAL')),
  },
  {
    id: 'itau-conta',
    label: 'Extrato Itaú Conta',
    badgeClass: 'badge-green',
    phaseLabel: 'Extrato conta',
    importer: importarItauConta,
    matchFileName: fileName => /itau_extrato_/i.test(String(fileName ?? '')),
    matchContent: ({ textSample }) =>
      textSample.includes('SALDO DO DIA') &&
      (textSample.includes('ITAU') || textSample.includes('EXTRATO CONTA')),
  },
  {
    id: 'itau-fatura',
    label: 'Fatura Itaú',
    badgeClass: 'badge-yellow',
    phaseLabel: 'Fatura cartão',
    importer: importarItauFatura,
    matchFileName: fileName => pareceFaturaItauPorNome(fileName),
    matchContent: ({ textSample }) =>
      textSample.includes('ITAU') ||
      textSample.includes('ITAU CARTOES') ||
      textSample.includes('VISA') ||
      textSample.includes('MASTERCARD') ||
      textSample.includes('BLACK') ||
      textSample.includes('SIGNATURE') ||
      textSample.includes('INFINITE'),
  },
  {
    id: 'nubank-fatura',
    label: 'Fatura Nubank',
    badgeClass: 'badge-purple',
    phaseLabel: 'Fatura cartão',
    importer: importarNubankFatura,
    matchFileName: fileName => /^Nubank_\d{4}-\d{2}-\d{2}\.pdf$/i.test(String(fileName ?? '')),
    matchContent: ({ textSample }) =>
      textSample.includes('NUBANK') ||
      textSample.includes('FATURA DE') ||
      textSample.includes('PARCELAMENTO DE FATURA'),
  },
];

export function getLayoutProfileById(id) {
  return PDF_LAYOUT_PROFILES.find(profile => profile.id === id) || null;
}

export async function detectarLayoutProfile(file) {
  if (!file?.name?.toLowerCase().endsWith('.pdf')) return null;

  const byName = PDF_LAYOUT_PROFILES.find(profile => profile.matchFileName?.(file.name));
  if (byName) return byName;

  const context = await criarContextoDeteccao(file);
  return PDF_LAYOUT_PROFILES.find(profile => profile.matchContent?.(context)) || null;
}

async function criarContextoDeteccao(file) {
  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo PDF para detectar o layout.'));
    reader.readAsArrayBuffer(file);
  });

  const linhas = await extrairLinhasPDF(buffer, 5);
  const textSample = linhas
    .slice(0, 120)
    .join('\n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  return {
    fileName: file.name,
    linhas,
    textSample,
  };
}
