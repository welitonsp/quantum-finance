/// <reference lib="webworker" />

import * as pdfjsLib  from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedTx {
  id: string;
  date: string;
  description: string;
  value: number;
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const d = new Date(s+'T00:00:00'); return isNaN(d.getTime()) ? null : s; }
  if (/^\d{8}$/.test(s)) { const iso=`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; const d=new Date(iso+'T00:00:00'); return isNaN(d.getTime())?null:iso; }
  const ptBR = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ptBR) { const [,dd,mm,yyyy]=ptBR; const iso=`${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`; const d=new Date(iso+'T00:00:00'); if(!isNaN(d.getTime())&&d.getMonth()+1===Number(mm)) return iso; }
  const alt = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (alt) { const [,yyyy,mm,dd]=alt; const iso=`${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`; const d=new Date(iso+'T00:00:00'); return isNaN(d.getTime())?null:iso; }
  return null;
}

function parseAmount(
  raw: string | number | undefined,
  source: 'OFX' | 'PDF' | 'CSV' | 'UNKNOWN' = 'UNKNOWN'
): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  let s = raw.replace(/"/g, '').replace(/[R$]/g, '').trim();
  if (!s) return null;

  if (source === 'OFX') {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  if (source === 'PDF') {
    // Brazilian format: dots as thousand separators, comma as decimal
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  // CSV / UNKNOWN — heuristic detection
  const neg = s.startsWith('-') || s.startsWith('(');
  s = s.replace(/[()+-]/g, '');
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(s)) s = s.replace(/,/g, '');
  else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  const val = parseFloat(s);
  if (isNaN(val)) return null;
  return neg ? -Math.abs(val) : val;
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

  const sep = detectSeparator(lines[0]);
  const rawHeaders = splitLine(lines[0], sep);
  const { dateIdx, descIdx, valueIdx } = mapping || autoDetectColumns(rawHeaders);

  if (dateIdx < 0 || descIdx < 0 || valueIdx < 0) {
    const previewRows = lines.slice(1,4).map(l=>splitLine(l,sep));
    const err: WorkerError = new Error(`Não foi possível identificar as colunas automaticamente.\nHeaders: "${rawHeaders.join('", "')}"`);
    err.code='COLUMNS_NOT_FOUND'; err.headers=rawHeaders; err.separator=sep;
    err.autoMap=autoDetectColumns(rawHeaders); err.previewRows=previewRows;
    throw err;
  }

  const transactions: ParsedTx[] = [];
  for (let i=1; i<lines.length; i++) {
    const fields=splitLine(lines[i],sep);
    const date=validateDate(fields[dateIdx]);
    const amount=parseAmount(fields[valueIdx]);
    const desc=(fields[descIdx]||'').trim()||`Linha ${i+1}`;
    if (!date||amount===null||amount===0) continue;
    transactions.push({ id:crypto.randomUUID(), date, description:desc, value:Math.abs(amount), type:amount>0?'entrada':'saida', category:'Diversos', source:'csv' });
  }
  if (transactions.length===0) throw new Error('Nenhuma transação válida encontrada no CSV.');
  return transactions;
}

// ─── OFX ─────────────────────────────────────────────────────────────────────

function extractTag(block: string, tag: string): string | null {
  const m=block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`));
  return m ? m[1].trim() : null;
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
    const block=match[1];
    const fitId=extractTag(block,'FITID');
    if (fitId&&seenFitIds.has(fitId)) continue;
    if (fitId) seenFitIds.add(fitId);
    const amountStr=extractTag(block,'TRNAMT');
    const amount=amountStr ? parseAmount(amountStr, 'OFX') : null;
    if (amount===null||amount===0) continue;
    const date=parseOFXDate(extractTag(block,'DTPOSTED'))??new Date().toISOString().split('T')[0];
    const memo=extractTag(block,'MEMO')??extractTag(block,'NAME')??'Transação OFX';
    transactions.push({ id:fitId||crypto.randomUUID(), fitId:fitId||null, description:(memo as string).replace(/\s+/g,' ').trim(), value:Math.abs(amount), type:amount>0?'receita':'saida', date, category:'Diversos', source:'ofx' });
  }
  return transactions;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

async function parsePDFBuffer(buffer: ArrayBuffer, password: string | null = null): Promise<ParsedTx[]> {
  const loadingTask=pdfjsLib.getDocument({ data:new Uint8Array(buffer), password:password||undefined });
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
    if (v) { faturaMonth=parseInt(v[1],10); faturaYear=parseInt(v[2],10); }
  } catch { /* ignora */ }

  const regexTx=/(?:^|[^0-9])([0-3]\d\/[0-1]\d(?:\/\d{4})?)\s+(.+?)\s+(-?\s?\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*([DC\-])?(?:\s.*)?$/i;
  const transactions: ParsedTx[] = [];

  for (let p=1; p<=pdf.numPages; p++) {
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const vp=page.getViewport({scale:1});
    const midX=vp.width/2;
    const items=tc.items.filter(i=>'str' in i&&(i as {str:string}).str.trim());
    type TItem={str:string;transform:number[]};
    const left=items.filter(i=>(i as TItem).transform[4]<midX);
    const right=items.filter(i=>(i as TItem).transform[4]>=midX);

    const buildLines=(cols:typeof items)=>{
      const sorted=(cols as TItem[]).sort((a,b)=>Math.round(b.transform[5])-Math.round(a.transform[5])||a.transform[4]-b.transform[4]);
      const lines:string[]=[]; let cur:string[]=[],lastY:number|null=null;
      for (const item of sorted) { const y=Math.round(item.transform[5]); if(lastY===null||Math.abs(y-lastY)<=6) cur.push(item.str.trim()); else {lines.push(cur.join(' '));cur=[item.str.trim()];} lastY=y; }
      if(cur.length) lines.push(cur.join(' '));
      return lines;
    };

    for (const line of [...buildLines(left),...buildLines(right)]) {
      const m=line.match(regexTx);
      if (!m) continue;
      const [,dataRaw,descricao,valorRaw,sufixo]=m;
      const parsedAmt=parseAmount(valorRaw.replace(/\s/g,''), 'PDF');
      const valorNum=parsedAmt !== null ? Math.abs(parsedAmt) : NaN;
      const isNeg=valorRaw.includes('-')||sufixo==='D'||sufixo==='-';
      if (isNaN(valorNum)||descricao.length<3) continue;
      const dParts=dataRaw.split('/');
      let ano:string|number=dParts.length===3?dParts[2]:faturaYear;
      if (dParts.length===2&&dParts[1]==='12'&&faturaMonth<=3) ano=faturaYear-1;
      if (dParts.length===2&&dParts[1]==='01'&&faturaMonth>=11) ano=faturaYear+1;
      transactions.push({ id:crypto.randomUUID(), date:`${ano}-${dParts[1].padStart(2,'0')}-${dParts[0].padStart(2,'0')}`, description:descricao.substring(0,50).trim(), value:valorNum, type:isCartao?(isNeg?'entrada':'saida'):(isNeg?'saida':'entrada'), account:isCartao?'cartao_credito':'conta_corrente', category:'Importado', source:'pdf' });
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
