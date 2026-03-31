import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAliasLookup, buildDisplayNameMeta, buildTransactionAliasKey, compactTransactionName } from '../../js/utils/display-names.js';

test('compactTransactionName removes common banking noise while preserving merchant identity', () => {
  const result = compactTransactionName('COMPRA CREDITO MERCADO LIVRE AUT 9988776655 CARTAO FINAL 1234');
  assert.equal(result, 'MERCADO LIVRE');
});

test('buildDisplayNameMeta title-cases uppercase names and truncates long labels', () => {
  const meta = buildDisplayNameMeta('PAGAMENTO PIX SUPERMERCADO ZAFFARI FILIAL TRES FIGUEIRAS PORTO ALEGRE', { maxLength: 24 });
  assert.equal(meta.friendly.includes('Supermercado Zaffari'), true);
  assert.equal(meta.short.endsWith('…'), true);
});

test('buildDisplayNameMeta can strip installment suffix when it is rendered separately', () => {
  const meta = buildDisplayNameMeta('SMART TV SAMSUNG 03/10', { stripInstallmentSuffix: true });
  assert.equal(meta.friendly, 'Smart Tv Samsung');
});

test('buildDisplayNameMeta prefers persisted alias when one exists for the merchant key', () => {
  const key = buildTransactionAliasKey('COMPRA CREDITO MERCADO LIVRE AUT 9988776655');
  const aliases = buildAliasLookup([{ key, alias: 'Mercado Livre' }]);
  const meta = buildDisplayNameMeta('COMPRA CREDITO MERCADO LIVRE AUT 9988776655', { aliases });
  assert.equal(meta.friendly, 'Mercado Livre');
});

test('buildDisplayNameMeta formats pix transactions with direction and counterparty', () => {
  const meta = buildDisplayNameMeta('Transferência enviada pelo Pix Claro - 40.432.544/0001-47 - CLARO PAY', {
    transactionContext: { channel: 'pix', direction: 'saida' },
  });
  assert.equal(meta.friendly, 'Pix Enviado Claro Pay');
});

test('buildDisplayNameMeta formats boleto transactions with receiver label', () => {
  const meta = buildDisplayNameMeta('Pagamento de boleto efetuado AABR', {
    transactionContext: { channel: 'boleto', direction: 'saida' },
  });
  assert.equal(meta.friendly, 'Boleto Aabr');
});
