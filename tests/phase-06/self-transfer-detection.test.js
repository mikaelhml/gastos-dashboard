import test from 'node:test';
import assert from 'node:assert/strict';

import { isOwnTransferLike, normalizeOwnTransfers } from '../../js/utils/self-transfer-detection.js';

test('isOwnTransferLike detects pix to investment account as own transfer', () => {
  assert.equal(
    isOwnTransferLike({
      tipo: 'saida',
      desc: 'PIX TRANSFERENCIA CONTA INVESTIMENTOS XP',
      cat: 'Transferência',
      canal: 'pix',
    }),
    true,
  );
});

test('isOwnTransferLike does not classify third-party pix as own transfer', () => {
  assert.equal(
    isOwnTransferLike({
      tipo: 'saida',
      desc: 'PIX ENVIADO CLIENTE MERCADO CENTRAL',
      cat: 'Transferência',
      canal: 'pix',
    }),
    false,
  );
});

test('normalizeOwnTransfers relabels detected own transfers', () => {
  const result = normalizeOwnTransfers([
    { tipo: 'entrada', desc: 'TRANSFERENCIA RECEBIDA CONTA INVESTIMENTOS', cat: 'Transferência', canal: 'transferencia' },
  ]);

  assert.equal(result[0].cat, 'Transferência própria');
  assert.equal(result[0].ownTransferDetected, true);
});
