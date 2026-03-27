const PDFJS_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs';
const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs';
let cachedPdfPassword = '';

export const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const MESES_NUBANK = {
  JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5,
  JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11,
};

export const MES_PT_MAP = {
  JAN: 'Jan', FEV: 'Fev', MAR: 'Mar', ABR: 'Abr', MAI: 'Mai', JUN: 'Jun',
  JUL: 'Jul', AGO: 'Ago', SET: 'Set', OUT: 'Out', NOV: 'Nov', DEZ: 'Dez',
};

export const MESES_LONGOS = {
  JANEIRO: 'Jan',
  FEVEREIRO: 'Fev',
  MARCO: 'Mar',
  MARÇO: 'Mar',
  ABRIL: 'Abr',
  MAIO: 'Mai',
  JUNHO: 'Jun',
  JULHO: 'Jul',
  AGOSTO: 'Ago',
  SETEMBRO: 'Set',
  OUTUBRO: 'Out',
  NOVEMBRO: 'Nov',
  DEZEMBRO: 'Dez',
};

export async function computeHash(buffer) {
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function abrirPDF(buffer) {
  const pdfjsLib = await import(PDFJS_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  let passwordCancelled = false;

  loadingTask.onPassword = (updatePassword, reason) => {
    const responses = pdfjsLib.PasswordResponses || {};
    const isRetry = reason === responses.INCORRECT_PASSWORD;
    const promptFn = globalThis.prompt;

    if (cachedPdfPassword && !isRetry) {
      updatePassword(cachedPdfPassword);
      return;
    }

    if (typeof promptFn !== 'function') {
      passwordCancelled = true;
      loadingTask.destroy();
      return;
    }

    const password = promptFn(
      isRetry
        ? 'Senha incorreta. Digite novamente a senha do PDF.'
        : 'Este PDF está protegido por senha. Digite a senha para continuar a importação. Ela será reutilizada automaticamente nos próximos PDFs desta sessão.',
      cachedPdfPassword,
    );

    if (password === null) {
      passwordCancelled = true;
      loadingTask.destroy();
      return;
    }

    cachedPdfPassword = password;
    updatePassword(password);
  };

  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    const message = String(error?.message || '');

    if (passwordCancelled || /no password given/i.test(message)) {
      throw new Error('Importação cancelada: a senha do PDF não foi informada.');
    }

    if (/incorrect password|invalid password/i.test(message)) {
      cachedPdfPassword = '';
      throw new Error('Não foi possível abrir o PDF: senha incorreta.');
    }

    throw error;
  }

  return pdf;
}

async function extrairItensPaginasDoPdf(pdf) {
  const paginas = [];

  for (let pg = 1; pg <= pdf.numPages; pg++) {
    const page = await pdf.getPage(pg);
    const content = await page.getTextContent();
    const items = content.items
      .filter(item => item.str && item.str.trim())
      .map(item => ({
        x: item.transform[4],
        y: item.transform[5],
        str: item.str,
        page: pg,
      }));

    paginas.push({ page: pg, items });
  }

  return paginas;
}

function agruparItensPorY(itens, tol = 8) {
  const grupos = [];

  for (const item of itens) {
    const grupo = grupos.find(g => Math.abs(g.y - item.y) < tol);

    if (grupo) {
      grupo.itens.push(item);
    } else {
      grupos.push({ y: item.y, itens: [item] });
    }
  }

  grupos.sort((a, b) => b.y - a.y);
  return grupos.map(grupo => {
    grupo.itens.sort((a, b) => a.x - b.x);
    return grupo.itens.map(item => ({ ...item, y: grupo.y }));
  });
}

function extrairGruposDasPaginas(paginas, tol = 8) {
  return paginas.flatMap(pagina => agruparItensPorY(pagina.items, tol));
}

async function extrairGruposDoPdf(pdf, tol = 8) {
  const paginas = await extrairItensPaginasDoPdf(pdf);
  return extrairGruposDasPaginas(paginas, tol);
}

export async function extrairGruposPDF(buffer, tol = 8) {
  const pdf = await abrirPDF(buffer);
  return extrairGruposDoPdf(pdf, tol);
}

export async function extrairLinhasPDF(buffer, tol = 8) {
  const grupos = await extrairGruposPDF(buffer, tol);
  return grupos.map(grupo => grupo.map(i => i.str).join(' ').trim());
}

export async function extrairEstruturaPDF(buffer, tolGrupos = 8, tolLinhas = tolGrupos) {
  const pdf = await abrirPDF(buffer);
  const paginas = await extrairItensPaginasDoPdf(pdf);
  const grupos = extrairGruposDasPaginas(paginas, tolGrupos);
  const linhas = grupos.map(grupo => grupo.map(i => i.str).join(' ').trim());
  return { paginas, grupos, linhas, tolLinhas };
}

export function parseBRL(str) {
  if (!str) return NaN;
  return parseFloat(str.trim().replace(/\./g, '').replace(',', '.'));
}

export function extrairParcelaFinal(texto) {
  const raw = String(texto ?? '').trim();
  if (!raw) return null;

  const match = raw.match(/(\d{1,2}\/\d{1,2})\s*$/);
  if (!match) return null;

  const [atual, total] = match[1].split('/').map(Number);
  if (
    !Number.isInteger(atual) ||
    !Number.isInteger(total) ||
    total < 2 ||
    total > 36 ||
    atual < 1 ||
    atual > total
  ) {
    return null;
  }

  return {
    parcela: `${atual}/${total}`,
    atual,
    total,
    desc: raw.slice(0, match.index).trim(),
  };
}

export function parseDataNubank(str, fallbackYear = null) {
  const m = str.match(/^(\d{2})\s+([A-Z]{3})(?:\s+(\d{4}))?/i);
  if (!m) return null;

  const [, dd, rawMes, rawAno] = m;
  const mesUpper = normalizarMes(rawMes);
  const idx = MESES_NUBANK[mesUpper];
  const ano = rawAno || fallbackYear;

  if (idx === undefined || !ano) return null;

  return {
    data: `${dd}/${String(idx + 1).padStart(2, '0')}/${ano}`,
    mes: `${MESES_ABREV[idx]}/${ano}`,
  };
}

export function normalizarMes(rawMes) {
  return String(rawMes ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
