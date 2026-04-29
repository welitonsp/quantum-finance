/// <reference lib="webworker" />

import * as pdfjsLib  from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { fromCentavos, toCentavos, type Centavos } from '../../types/money';
import { parseImportedMoneyToCentavos } from '../importMoneyParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedTx {
  id: string;
  date: string;
  description: string;
  value: number;
  value_cents: Centavos;
  schemaVersion: 2;
  type: string;
  category: string;
  source: string;
  fitId?: string | null;
  account?: string;
}

interface ColumnMapping { dateIdx: number; descIdx: number; valueIdx: number; }

interface WorkerRequest {
  id: string;
  type: string;
  buffer: ArrayBuffer;
  fileName?: string;
  mapping?: ColumnMapping;
  password?: string;
}

interface WorkerError extends Error {
  code?: string;
  headers?: string[];
  autoMap?: ColumnMapping;
  separator?: string;
  previewRows?: string[][];
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

const CENTS_HEADER_KEYS = ['valorcentavos', 'valuecents', 'amountcents', 'cents', 'centavos', 'valoremcentavos'];

function isCentsHeader(normalizedHeader: string): boolean {
  return CENTS_HEADER_KEYS.some(k => normalizedHeader === k || normalizedHeader.endsWith(k));
}

function detectSeparator(line: string): string {
  const pipes = (line.match(/\|/g) || []).length;
  const semi  = (line.match(/;/g)  || []).length;
  const commas= (line.match(/,/g)  || []).length;
  if (pipes > semi && pipes > commas) return '|';
  return semi > commas ? ';' : ',';
}

function validateDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/"/g, '').trim();
  const isValidIso = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
  };

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidIso(s) ? s : null;
  if (/^\d{8}$/.test(s)) {
    const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return isValidIso(iso) ? iso : null;
  }
  const ptBR = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ptBR) {
    const dd = ptBR[1] ?? '';
    const mm = ptBR[2] ?? '';
    const yyyy = ptBR[3] ?? '';
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    return isValidIso(iso) ? iso : null;
  }
  const alt = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (alt) {
    const yyyy = alt[1] ?? '';
    const mm = alt[2] ?? '';
    const dd = alt[3] ?? '';
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    return isValidIso(iso) ? iso : null;
  }
  return null;
}

function parseAmountCents(
  raw: string | number | undefined,
  source: 'OFX' | 'PDF' | 'CSV' | 'UNKNOWN' = 'UNKNOWN',
  integerMinorUnits = false,
): Centavos | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') {
    try { return toCentavos(raw); } catch { return null; }
  }

  const s = raw.replace(/"/g, '').trim();
  if (!s) return null;

  if (source === 'OFX') {
    try { return toCentavos(s.replace(',', '.')); } catch { return null; }
  }

  if (source === 'PDF') {
    try { return toCentavos(s); } catch { return null; }
  }

  // CSV / UNKNOWN: usar parseImportedMoneyToCentavos para suportar integerMinorUnits
  try {
    return parseImportedMoneyToCentavos(s, { integerMinorUnits });
  } catch {
    return null;
  }
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/"/g,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
}

function autoDetectColumns(headers: string[]): ColumnMapping {
  const norm = headers.map(normalizeHeader);
  const DATE_K  = ['data','date','datamovimento','datalancamento','datalcto','dataoperacao'];
  const DESC_K  = ['lancamento','descricao','historico','memo','description','estabelecimento','complemento','detalhes'];
  const VALUE_K = ['valor','value','amount','quantia','debito','credito','montante','valortransacao'];
  const find = (keys: string[]) => {
    for (const k of keys) { const i=norm.findIndex(h=>h===k||h.startsWith(k)); if(i!==-1) return i; }
    for (const k of keys) { const i=norm.findIndex(h=>h.includes(k)); if(i!==-1) return i; }
    return -1;
  };
  return { dateIdx: find(DATE_K), descIdx: find(DESC_K), valueIdx: find(VALUE_K) };
}

function splitLine(line: string, sep: string): string[] {
  const regex = new RegExp(`${sep==='|'?'\\|':sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
  return line.split(regex).map(f=>f.replace(/^"|"$/g,'').trim());
}

function parseCSVBuffer(buffer: ArrayBuffer, mapping: ColumnMapping | null = null): ParsedTx[] {
  const text  = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/,'');
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if (lines.length < 2) throw new Error('O CSV está vazio ou não tem dados válidos.');

  const firstLine = lines[0] ?? '';
  const sep = detectSeparator(firstLine);
  const rawHeaders = splitLine(firstLine, sep);
  const { dateIdx, descIdx, valueIdx } = mapping || autoDetectColumns(rawHeaders);

  if (dateIdx < 0 || descIdx < 0 || valueIdx < 0) {
    const previewRows = lines.slice(1,4).map(l=>splitLine(l,sep));
    const err: WorkerError = new Error(`Não foi possível identificar as colunas automaticamente.\nHeaders: "${rawHeaders.join('", "')}"`);
    err.code='COLUMNS_NOT_FOUND'; err.headers=rawHeaders; err.separator=sep;
    err.autoMap=autoDetectColumns(rawHeaders); err.previewRows=previewRows;
    throw err;
  }

  // Detectar se a coluna de valor exporta centavos como inteiro sem separador decimal
  const valueHeaderNorm = normalizeHeader(rawHeaders[valueIdx] ?? '');
  const integerMinorUnits = isCentsHeader(valueHeaderNorm);

  const transactions: ParsedTx[] = [];
  for (let i=1; i<lines.length; i++) {
    const fields=splitLine(lines[i] ?? '',sep);
    const date=validateDate(fields[dateIdx]);
    const amount=parseAmountCents(fields[valueIdx], 'CSV', integerMinorUnits);
    const desc=(fields[descIdx]||'').trim()||`Linha ${i+1}`;
    if (!date||amount===null||amount===0) continue;
    const valueCents = Math.abs(amount) as Centavos;
    transactions.push({
      id:`csv:${i}:${date}:${valueCents}:${desc.slice(0,24)}`,
      date,
      description:desc.replace(/\s+/g,' ').trim(),
      value:fromCentavos(valueCents),
      value_cents:valueCents,
      schemaVersion:2,
      type:amount>0?'entrada':'saida',
      category:'Diversos',
      source:'csv',
    });
  }
  if (transactions.length===0) throw new Error('Nenhuma transação válida encontrada no CSV.');
  return transactions;
}

// ─── OFX ─────────────────────────────────────────────────────────────────────

function extractTag(block: string, tag: string): string | null {
  const m=block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`));
  return m?.[1]?.trim() ?? null;
}

function parseOFXDate(raw: string | null): string | null {
  if (!raw) return null;
  const d=raw.replace(/\D/g,'');
  if (d.length<8) return null;
  const dt=new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T12:00:00`);
  return isNaN(dt.getTime()) ? null : `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
}

function parseOFXBuffer(buffer: ArrayBuffer): ParsedTx[] {
  let text: string;
  try { text=new TextDecoder('windows-1252').decode(buffer); } catch { text=new TextDecoder('utf-8').decode(buffer); }
  if (!text.includes('OFXHEADER')&&!text.includes('<OFX>')) throw new Error('Formato inválido. O ficheiro não é um OFX reconhecido.');

  const trnRegex=/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const transactions: ParsedTx[] = [];
  const seenFitIds=new Set<string>();
  let match: RegExpExecArray | null;

  while ((match=trnRegex.exec(text))!==null) {
    const block=match[1] ?? '';
    const fitId=extractTag(block,'FITID');
    if (fitId&&seenFitIds.has(fitId)) continue;
    if (fitId) seenFitIds.add(fitId);
    const amountStr=extractTag(block,'TRNAMT');
    const amount=amountStr ? parseAmountCents(amountStr, 'OFX') : null;
    if (amount===null||amount===0) continue;
    const date=parseOFXDate(extractTag(block,'DTPOSTED'))??new Date().toISOString().split('T')[0] ?? '';
    const memo=extractTag(block,'MEMO')??extractTag(block,'NAME')??'Transação OFX';
    const valueCents = Math.abs(amount) as Centavos;
    transactions.push({
      id:fitId||`ofx:${transactions.length}:${date}:${valueCents}`,
      fitId:fitId||null,
      description:(memo as string).replace(/\s+/g,' ').trim(),
      value:fromCentavos(valueCents),
      value_cents:valueCents,
      schemaVersion:2,
      type:amount>0?'entrada':'saida',
      date,
      category:'Diversos',
      source:'ofx',
    });
  }
  return transactions;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

async function parsePDFBuffer(buffer: ArrayBuffer, password: string | null = null): Promise<ParsedTx[]> {
  const loadingOptions: { data: Uint8Array; password?: string } = { data:new Uint8Array(buffer) };
  if (password) loadingOptions.password = password;
  const loadingTask=pdfjsLib.getDocument(loadingOptions);
  let pdf: pdfjsLib.PDFDocumentProxy;
  try { pdf=await loadingTask.promise; }
  catch (err: unknown) {
    const e=err as Error&{name?:string};
    if (e.name==='PasswordException'||e.message?.toLowerCase().includes('password')) throw new Error('PASSWORD_REQUIRED');
    throw err;
  }

  let faturaYear=new Date().getFullYear(), faturaMonth=new Date().getMonth()+1, isCartao=true;
  try {
    const fp=await pdf.getPage(1);
    const tc=await fp.getTextContent();
    const txt=tc.items.map(i=>('str' in i ? i.str : '')).join(' ');
    if (txt.toLowerCase().includes('extrato conta corrente')) isCartao=false;
    const v=txt.match(/Vencimento:\s*\d{2}\/(\d{2})\/(\d{4})/i);
    if (v?.[1] && v[2]) { faturaMonth=parseInt(v[1],10); faturaYear=parseInt(v[2],10); }
  } catch { /* ignora */ }

  const regexTx=/(?:^|[^0-9])([0-3]\d\/[0-1]\d(?:\/\d{4})?)\s+(.+?)\s+(-?\s?\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*([DC-])?(?:\s.*)?$/i;
  const transactions: ParsedTx[] = [];

  for (let p=1; p<=pdf.numPages; p++) {
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const vp=page.getViewport({scale:1});
    const midX=vp.width/2;
    type TItem={str:string;transform:ArrayLike<number>};
    const isTextItem = (item: unknown): item is TItem =>
      !!item && typeof item === 'object' && 'str' in item && typeof (item as { str: unknown }).str === 'string' && (item as { str: string }).str.trim().length > 0;
    const xOf = (item: TItem): number => item.transform[4] ?? 0;
    const yOf = (item: TItem): number => item.transform[5] ?? 0;
    const items=tc.items.filter(isTextItem) as TItem[];
    const left=items.filter(i=>xOf(i)<midX);
    const right=items.filter(i=>xOf(i)>=midX);

    const buildLines=(cols:TItem[])=>{
      const sorted=[...cols].sort((a,b)=>Math.round(yOf(b))-Math.round(yOf(a))||xOf(a)-xOf(b));
      const lines:string[]=[]; let cur:string[]=[],lastY:number|null=null;
      for (const item of sorted) { const y=Math.round(yOf(item)); if(lastY===null||Math.abs(y-lastY)<=6) cur.push(item.str.trim()); else {lines.push(cur.join(' '));cur=[item.str.trim()];} lastY=y; }
      if(cur.length) lines.push(cur.join(' '));
      return lines;
    };

    for (const line of [...buildLines(left),...buildLines(right)]) {
      const m=line.match(regexTx);
      if (!m) continue;
      const dataRaw = m[1] ?? '';
      const descricao = m[2] ?? '';
      const valorRaw = m[3] ?? '';
      const sufixo = m[4];
      const parsedAmt=parseAmountCents(valorRaw.replace(/\s/g,''), 'PDF');
      const isNeg=valorRaw.includes('-')||sufixo==='D'||sufixo==='-';
      if (parsedAmt===null||parsedAmt===0||descricao.length<3) continue;
      const valueCents = Math.abs(parsedAmt) as Centavos;
      const dParts=dataRaw.split('/');
      const day = dParts[0] ?? '';
      const month = dParts[1] ?? '';
      let ano:string|number=dParts.length===3?(dParts[2] ?? faturaYear):faturaYear;
      if (dParts.length===2&&month==='12'&&faturaMonth<=3) ano=faturaYear-1;
      if (dParts.length===2&&month==='01'&&faturaMonth>=11) ano=faturaYear+1;
      const date=`${ano}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
      const parsedDate = new Date(`${date}T00:00:00Z`);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10)!==date) continue;
      transactions.push({
        id:`pdf:${p}:${transactions.length}:${date}:${valueCents}`,
        date,
        description:descricao.substring(0,50).trim(),
        value:fromCentavos(valueCents),
        value_cents:valueCents,
        schemaVersion:2,
        type:isCartao?(isNeg?'entrada':'saida'):(isNeg?'saida':'entrada'),
        account:isCartao?'cartao_credito':'conta_corrente',
        category:'Importado',
        source:'pdf',
      });
    }
  }
  if (transactions.length===0) throw new Error('Nenhuma transação encontrada no PDF.');
  return transactions;
}

// ─── Message Handler ──────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, buffer, mapping, password } = event.data;

  try {
    let transactions: ParsedTx[];

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
  } catch (err: unknown) {
    const e = err as WorkerError;
    const payload: Record<string, unknown> = { id, success: false, error: e.message };
    if (e.code)        payload['code']        = e.code;
    if (e.headers)     payload['headers']     = e.headers;
    if (e.autoMap)     payload['autoMap']     = e.autoMap;
    if (e.separator)   payload['separator']   = e.separator;
    if (e.previewRows) payload['previewRows'] = e.previewRows;
    self.postMessage(payload);
  }
};
