import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('index.html loads Chart.js from local vendor path instead of CDN', () => {
  const html = readProjectFile('index.html');

  assert.match(html, /<script src="vendor\/chartjs\/chart\.umd\.js"><\/script>/i);
  assert.doesNotMatch(html, /cdnjs\.cloudflare\.com/i);
});

test('pdf-utils imports pdf.js assets from local vendor paths', () => {
  const source = readProjectFile(path.join('js', 'parsers', 'pdf-utils.js'));

  assert.match(source, /const PDFJS_URL\s*=\s*'\.\.\/\.\.\/vendor\/pdfjs\/pdf\.min\.mjs'/);
  assert.match(source, /const WORKER_URL\s*=\s*'\.\.\/\.\.\/vendor\/pdfjs\/pdf\.worker\.min\.mjs'/);
  assert.doesNotMatch(source, /cdnjs\.cloudflare\.com/i);
});

test('vendored assets required for offline cold start exist in the repository', () => {
  const chartPath = path.join(projectRoot, 'vendor', 'chartjs', 'chart.umd.js');
  const pdfPath = path.join(projectRoot, 'vendor', 'pdfjs', 'pdf.min.mjs');
  const workerPath = path.join(projectRoot, 'vendor', 'pdfjs', 'pdf.worker.min.mjs');

  assert.equal(fs.existsSync(chartPath), true);
  assert.equal(fs.existsSync(pdfPath), true);
  assert.equal(fs.existsSync(workerPath), true);
});
