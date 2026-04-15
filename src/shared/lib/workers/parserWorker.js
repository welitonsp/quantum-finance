/**
 * parserWorker.js — Web Worker Unificado para Parsers de Extratos
 * ──────────────────────────────────────────────────────────────────────────────
 * Roda em thread separada. A Main Thread permanece a 60fps enquanto este worker
 * processa extratos de qualquer tamanho.
 *
 * PROTOCOLO DE MENSAGENS:
 *
 * REQUEST (Main → Worker):
 *   { id: string, type: 'csv'|'ofx'|'pdf', buffer: ArrayBuffer,
 *     fileName: string, mapping?: {dateIdx,descIdx,valueIdx}, password?: string }
 *
 * RESPONSE (Worker → Main):
 *   { id: string, success: true,  transactions: Transaction[] }
 *   { id: string, success: false, error: string, code?: string,
 *     headers?: string[], autoMap?: object, separator?: string }
 *
 * NOTA: o ArrayBuffer deve ser transferido (não clonado) para eficiência:
 *   worker.postMessage({ ...payload, buffer }, [buffer])
 */

import * as pdfjsLib    from 'pdfjs-dist';
import pdfjsWorkerUrl   from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configura o sub-worker do pdfjs (nested worker — suportado em Chromium/Firefox)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ══════════════════════════════════════════════════════════════════════════════
// ─── CSV PARSER (ArrayBuffer) ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function detectSeparator(firstLine) {
  const pipes      = (firstLine.match(/\|/g)  || []).length;
  const semicolons = (firstLine.match(/;/g)   || []).length;
  const commas     = (firstLine.match(/,/g)   || []).length;
  if (pipes > semicolons && pipes > commas) return '|';
  return semicolons > commas ? ';' : ',';
}

function validateDate(raw) {
  if (!raw) return null;
  const s = raw.replace(/"/g, '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? null : s;
  }
  if (/^\d{8}$/.test(s)) {
    const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    const d   = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? null : iso;
  }
  const ptBR = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ptBR) {
    const [, dd, mm, yyyy] = ptBR;
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    const d   = new Date(iso + 'T00:00:00');
    if (!isNaN(d.getTime()) && d.getMonth() + 1 === Number(mm)) return iso;
  }
  const altISO = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (altISO) {
    const [, yyyy, mm, dd] = altISO;
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    const d   = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? null : iso;
  }
  return null;
}

function parseAmount(raw) {
  if (!raw) return null;
  let s = raw.replace(/"/g, '').replace(/[R$\s]/g, '').trim();
  if (!s) return null;
  const negative = s.startsWith('-') || s.startsWith('(');
  s = s.replace(/[()+-]/g, '');
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s))       s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(s))   s = s.replace(/,/g, '');
  else if (s.includes(',') && !s.includes('.'))     s = s.replace(',', '.');
  const val = parseFloat(s);
  if (isNaN(val)) return null;
  return negative ? -Math.abs(val) : val;
}

function normalizeHeader(h) {
  return h.toLowerCase().replace(/"/g,'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,'');
}

function autoDetectColumns(headers) {
  const norm = headers.map(normalizeHeader);
  const DATE_K  = ['data','date','datamovimento','datalancamento','datalcto','dataoperacao'];
  const DESC_K  = ['lancamento','descricao','historico','memo','description','estabelecimento','complemento','detalhes'];
  const VALUE_K = ['valor','value','amount','quantia','debito','credito','montante','valortransacao'];
  const find = (keys) => {
    for (const k of keys) { const i = norm.findIndex(h => h === k || h.startsWith(k)); if (i !== -1) return i; }
    for (const k of keys) { const i = norm.findIndex(h => h.includes(k)); if (i !== -1) return i; }
    return -1;
  };
  return { dateIdx: find(DATE_K), descIdx: find(DESC_K), valueIdx: find(VALUE_K) };
}

function splitLine(line, sep) {
  const regex = new RegExp(`${sep === '|' ? '\\|' : sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
  return line.split(regex).map(f => f.replace(/^"|"$/g,'').trim());
}

function parseCSVBuffer(buffer, mapping = null) {
  const text  = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('O CSV está vazio ou não tem dados válidos.');

  const sep        = detectSeparator(lines[0]);
  const rawHeaders = splitLine(lines[0], sep);

  // Auto-detectar se não foi fornecido mapeamento
  let { dateIdx, descIdx, valueIdx } = mapping || autoDetectColumns(rawHeaders);

  if (dateIdx == null || dateIdx < 0 || descIdx == null || descIdx < 0 || valueIdx == null || valueIdx < 0) {
    const previewRows = lines.slice(1, 4).map(l => splitLine(l, sep));
    const err         = new Error(`Não foi possível identificar as colunas automaticamente.\nHeaders: "${rawHeaders.join('", "')}"`);
    err.code          = 'COLUMNS_NOT_FOUND';
    err.headers       = rawHeaders;
    err.separator     = sep;
    err.autoMap       = autoDetectColumns(rawHeaders);
    err.previewRows   = previewRows;
    throw err;
  }

  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitLine(lines[i], sep);
    const date   = validateDate(fields[dateIdx]);
    const amount = parseAmount(fields[valueIdx]);
    const desc   = (fields[descIdx] || '').trim() || `Linha ${i + 1}`;
    if (!date || amount === null || amount === 0) continue;
    transactions.push({
      id:          crypto.randomUUID(),
      date, description: desc,
      value:       Math.abs(amount),
      type:        amount > 0 ? 'entrada' : 'saida',
      category:    'Diversos',
      source:      'csv',
    });
  }
  if (transactions.length === 0) throw new Error('Nenhuma transação válida encontrada no CSV.');
  return transactions;
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── OFX PARSER (ArrayBuffer) ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`));
  return m ? m[1].trim() : null;
}

function parseOFXDate(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g,'');
  if (digits.length < 8) return null;
  const y = digits.slice(0,4), mo = digits.slice(4,6), d = digits.slice(6,8);
  const dt = new Date(`${y}-${mo}-${d}T12:00:00`);
  return isNaN(dt.getTime()) ? null : `${y}-${mo}-${d}`;
}

function parseOFXBuffer(buffer) {
  // Tentar windows-1252 primeiro (padrão bancário BR), fallback para utf-8
  let text;
  try { text = new TextDecoder('windows-1252').decode(buffer); }
  catch { text = new TextDecoder('utf-8').decode(buffer); }

  if (!text.includes('OFXHEADER') && !text.includes('<OFX>')) {
    throw new Error('Formato inválido. O ficheiro não é um OFX reconhecido.');
  }

  const trnRegex   = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const transactions = [];
  const seenFitIds = new Set();
  let match;

  while ((match = trnRegex.exec(text)) !== null) {
    const block = match[1];
    const fitId = extractTag(block, 'FITID');
    if (fitId && seenFitIds.has(fitId)) continue;
    if (fitId) seenFitIds.add(fitId);

    const amountStr = extractTag(block, 'TRNAMT');
    const amount    = amountStr ? parseFloat(amountStr.replace(',','.')) : null;
    if (amount === null || isNaN(amount) || amount === 0) continue;

    const date = parseOFXDate(extractTag(block, 'DTPOSTED')) ?? new Date().toISOString().split('T')[0];
    const memo = extractTag(block, 'MEMO') ?? extractTag(block, 'NAME') ?? 'Transação OFX';

    transactions.push({
      id:          fitId || crypto.randomUUID(),
      fitId:       fitId || null,
      description: memo.replace(/\s+/g,' ').trim(),
      value:       Math.abs(amount),
      type:        amount > 0 ? 'receita' : 'saida',
      date, category: 'Diversos', source: 'ofx',
    });
  }
  return transactions;
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── PDF PARSER (ArrayBuffer via pdfjs-dist) ──────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

async function parsePDFBuffer(buffer, password = null) {
  const loadingTask = pdfjsLib.getDocument({
    data:     new Uint8Array(buffer),
    password: password || undefined,
  });

  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (err) {
    if (err.name === 'PasswordException' || err.message?.toLowerCase().includes('password')) {
      throw new Error('PASSWORD_REQUIRED');
    }
    throw err;
  }

  let faturaYear  = new Date().getFullYear();
  let faturaMonth = new Date().getMonth() + 1;
  let isCartao    = true;

  try {
    const firstPage    = await pdf.getPage(1);
    const textContent  = await firstPage.getTextContent();
    const firstPageTxt = textContent.items.map(i => i.str).join(' ');
    if (firstPageTxt.toLowerCase().includes('extrato conta corrente')) isCartao = false;
    const venc = firstPageTxt.match(/Vencimento:\s*\d{2}\/(\d{2})\/(\d{4})/i);
    if (venc) { faturaMonth = parseInt(venc[1], 10); faturaYear = parseInt(venc[2], 10); }
  } catch { /* ignora erro de cabeçalho */ }

  const regexTx = /(?:^|[^0-9])([0-3]\d\/[0-1]\d(?:\/\d{4})?)\s+(.+?)\s+(-?\s?\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*([DC\-])?(?:\s.*)?$/i;
  const transactions = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page        = await pdf.getPage(p);
    const textContent = await page.getTextContent();
    const viewport    = page.getViewport({ scale: 1 });
    const midX        = viewport.width / 2;

    const items   = textContent.items.filter(i => i.str?.trim());
    const leftCol = items.filter(i => i.transform[4] <  midX);
    const rightCol= items.filter(i => i.transform[4] >= midX);

    const buildLines = (colItems) => {
      const sorted = colItems.sort((a,b) => Math.round(b.transform[5]) - Math.round(a.transform[5]) || a.transform[4] - b.transform[4]);
      const lines = []; let cur = [], lastY = null;
      for (const item of sorted) {
        const y = Math.round(item.transform[5]);
        if (lastY === null || Math.abs(y - lastY) <= 6) cur.push(item.str.trim());
        else { lines.push(cur.join(' ')); cur = [item.str.trim()]; }
        lastY = y;
      }
      if (cur.length) lines.push(cur.join(' '));
      return lines;
    };

    for (const line of [...buildLines(leftCol), ...buildLines(rightCol)]) {
      const m = line.match(regexTx);
      if (!m) continue;
      const [, dataRaw, descricao, valorRaw, sufixo] = m;
      const valorNum  = parseFloat(valorRaw.replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/^-/,''));
      const isNegative = valorRaw.includes('-') || sufixo === 'D' || sufixo === '-';
      if (isNaN(valorNum) || descricao.length < 3) continue;

      const dParts = dataRaw.split('/');
      let ano = dParts.length === 3 ? dParts[2] : faturaYear;
      if (dParts.length === 2 && dParts[1] === '12' && faturaMonth <= 3)  ano = faturaYear - 1;
      if (dParts.length === 2 && dParts[1] === '01' && faturaMonth >= 11) ano = faturaYear + 1;

      transactions.push({
        id:          crypto.randomUUID(),
        date:        `${ano}-${dParts[1].padStart(2,'0')}-${dParts[0].padStart(2,'0')}`,
        description: descricao.substring(0, 50).trim(),
        value:       valorNum,
        type:        isCartao ? (isNegative ? 'entrada' : 'saida') : (isNegative ? 'saida' : 'entrada'),
        account:     isCartao ? 'cartao_credito' : 'conta_corrente',
        category:    'Importado',
        source:      'pdf',
      });
    }
  }

  if (transactions.length === 0) throw new Error('Nenhuma transação encontrada no PDF.');
  return transactions;
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── MESSAGE HANDLER ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

self.onmessage = async (event) => {
  const { id, type, buffer, mapping, password } = event.data;

  try {
    let transactions;

    if (type === 'csv') {
      transactions = parseCSVBuffer(buffer, mapping ?? null);
    } else if (type === 'ofx') {
      transactions = parseOFXBuffer(buffer);
    } else if (type === 'pdf') {
      transactions = await parsePDFBuffer(buffer, password);
    } else {
      throw new Error(`Tipo de ficheiro não suportado: "${type}". Use csv, ofx ou pdf.`);
    }

    self.postMessage({ id, success: true, transactions });

  } catch (err) {
    const payload = { id, success: false, error: err.message };
    // Propagar metadados estruturados do erro (ex: COLUMNS_NOT_FOUND)
    if (err.code)        payload.code        = err.code;
    if (err.headers)     payload.headers     = err.headers;
    if (err.autoMap)     payload.autoMap     = err.autoMap;
    if (err.separator)   payload.separator   = err.separator;
    if (err.previewRows) payload.previewRows = err.previewRows;
    self.postMessage(payload);
  }
};
