// Importação de NFC-e por conteúdo COLADO (XML fiscal ou HTML da consulta
// pública) — FASE Compras Inteligentes, entregável 4.
// ZERO rede: todo o parse é local (parseNfceDocument). Fetch real permanece
// bloqueado até a fase própria consumir o gate SSRF (functions/src/nfceUrlGate.ts).
//
// Contrato de governança: NADA é gravado sem revisão humana — o usuário vê
// os itens extraídos, ajusta preço/unidade, desmarca o que não quer e só
// então confirma. Cada item confirmado vira uma priceObservation via a
// callable server-trusted recordPriceObservation.

import { useMemo, useState } from 'react';
import { ClipboardPaste, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Decimal from 'decimal.js';
import { formatBRL } from '../../../shared/types/money';
import type { Centavos } from '../../../shared/types/money';
import type { PriceObservationCreateInput } from '../../../shared/schemas/shoppingSchemas';
import { parseNfceDocument } from '../lib/nfceHtmlParser';
import { NfceParseError, type NfceParseResult } from '../lib/nfceParser';

interface Props {
  onClose: () => void;
  onRecordObservation: (payload: PriceObservationCreateInput) => Promise<string>;
}

interface ReviewItem {
  include: boolean;
  productName: string;
  quantity: string;
  unit: string;
  /** Preço unitário em centavos; 0 = pendente de ajuste manual. */
  unitPriceCents: Centavos;
}

const UNIT_OPTIONS = ['un', 'kg', 'g', 'L', 'mL', 'cx', 'pct', 'dz'] as const;

/** uCom fiscal → unidade do catálogo do app; desconhecida → 'un'. */
function mapUnidade(uCom: string): string {
  const key = uCom.trim().toUpperCase();
  const map: Record<string, string> = {
    UN: 'un', UND: 'un', UNID: 'un', PC: 'un',
    KG: 'kg', G: 'g', GR: 'g',
    L: 'L', LT: 'L', LTS: 'L', ML: 'mL',
    CX: 'cx', PCT: 'pct', PT: 'pct', DZ: 'dz',
  };
  return map[key] ?? 'un';
}

/** "2.0000"/"0,748" → string decimal enxuta ("2"/"0.748"); inválida → "1". */
function normalizeQuantidade(raw: string): string {
  const normalized = raw.trim().replace(/\./g, (m, _i, s) =>
    s.includes(',') ? '' : m).replace(',', '.');
  try {
    const d = new Decimal(normalized);
    if (d.isNaN() || d.lessThanOrEqualTo(0)) return '1';
    return d.toString();
  } catch {
    return '1';
  }
}

/**
 * Deriva o preço unitário em centavos SEM heurística float:
 * 1) vUnCom fiscal quando converte exatamente para centavos inteiros;
 * 2) senão, total do item quando a quantidade é 1;
 * 3) senão, 0 → o usuário ajusta manualmente antes de confirmar.
 */
function deriveUnitPriceCents(valorUnitarioStr: string, totalCents: Centavos, quantidade: string): Centavos {
  const normalized = valorUnitarioStr.trim()
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  try {
    const cents = new Decimal(normalized).times(100);
    if (cents.isInteger() && cents.greaterThan(0) && cents.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER)) {
      return cents.toNumber() as Centavos;
    }
  } catch { /* cai para os fallbacks */ }
  if (quantidade === '1') return totalCents;
  return 0 as Centavos;
}

/** Entrada BRL do usuário ("12,34") → centavos; inválida → null. */
function parseBrlInput(raw: string): Centavos | null {
  const normalized = raw.trim().replace(/R\$/gi, '').replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = new Decimal(normalized).times(100);
  return cents.isInteger() ? (cents.toNumber() as Centavos) : null;
}

export default function NfceImportPanel({ onClose, onRecordObservation }: Props) {
  const [rawInput, setRawInput] = useState('');
  const [parsed, setParsed] = useState<NfceParseResult | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [saving, setSaving] = useState(false);

  const handleAnalyze = () => {
    try {
      const result = parseNfceDocument(rawInput);
      setParsed(result);
      setItems(result.itens.map((item) => ({
        include: true,
        productName: item.descricaoFiscal.slice(0, 120),
        quantity: normalizeQuantidade(item.quantidadeStr),
        unit: mapUnidade(item.unidade),
        unitPriceCents: deriveUnitPriceCents(item.valorUnitarioStr, item.totalCents, normalizeQuantidade(item.quantidadeStr)),
      })));
    } catch (error) {
      const msg = error instanceof NfceParseError
        ? error.message
        : 'Não foi possível interpretar o conteúdo colado.';
      toast.error(msg);
    }
  };

  const updateItem = (index: number, patch: Partial<ReviewItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const included = useMemo(() => items.filter((it) => it.include), [items]);
  const pendingPrice = useMemo(
    () => included.filter((it) => it.unitPriceCents <= 0).length,
    [included],
  );
  const totalMismatch = parsed !== null && parsed.somaItensCents !== parsed.totalNotaCents;

  const handleConfirm = async () => {
    if (!parsed || saving) return;
    if (included.length === 0) {
      toast.error('Nenhum item selecionado.');
      return;
    }
    if (pendingPrice > 0) {
      toast.error(`${pendingPrice} item(ns) sem preço unitário válido. Ajuste antes de confirmar.`);
      return;
    }
    setSaving(true);
    const observedAt = parsed.emitidoEm?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const store = parsed.emitenteNome.slice(0, 80);
    let ok = 0;
    let failed = 0;
    for (const item of included) {
      try {
        await onRecordObservation({
          productName: item.productName,
          store,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
          unit: item.unit as PriceObservationCreateInput['unit'],
          observedAt,
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setSaving(false);
    if (ok > 0) toast.success(`${ok} preço${ok !== 1 ? 's' : ''} registrado${ok !== 1 ? 's' : ''} de ${store}.`);
    if (failed > 0) toast.error(`${failed} item(ns) falharam — tente novamente.`);
    if (failed === 0) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-label="Importar NFC-e">
      <div className="bg-quantum-card border border-quantum-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-quantum-fg flex items-center gap-2">
            <ClipboardPaste size={20} className="text-blue-400" />
            Importar nota fiscal (NFC-e)
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-quantum-muted hover:text-quantum-fg">
            <X size={18} />
          </button>
        </div>

        {parsed === null ? (
          <>
            <p className="text-sm text-quantum-muted">
              Cole abaixo o <strong>XML da NFC-e</strong> ou o <strong>HTML da página de consulta</strong> da
              SEFAZ (abra a nota pelo QR Code no navegador, selecione tudo e copie). Nada é enviado
              a serviços externos — a leitura acontece no seu dispositivo.
            </p>
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="Cole aqui o XML ou o HTML da consulta da NFC-e…"
              aria-label="Conteúdo da NFC-e"
              rows={10}
              className="w-full bg-quantum-bg border border-quantum-border rounded-xl p-3 text-xs font-mono text-quantum-fg focus:outline-none focus:border-blue-500 resize-y"
            />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-quantum-muted hover:text-quantum-fg">
                Cancelar
              </button>
              <button
                onClick={handleAnalyze}
                disabled={rawInput.trim().length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-xl font-medium"
              >
                Analisar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-quantum-bg border border-quantum-border rounded-xl p-3 text-sm space-y-1">
              <p className="text-quantum-fg font-medium">{parsed.emitenteNome}</p>
              <p className="text-xs text-quantum-muted font-mono break-all">Chave: {parsed.chaveAcesso}</p>
              <p className="text-xs text-quantum-muted">
                Total da nota: <span className="font-mono text-quantum-fg">{formatBRL(parsed.totalNotaCents)}</span>
                {' · '}{parsed.itens.length} {parsed.itens.length === 1 ? 'item' : 'itens'}
              </p>
              {totalMismatch && (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Soma dos itens ({formatBRL(parsed.somaItensCents)}) difere do total — descontos/acréscimos da nota.
                </p>
              )}
            </div>

            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className={`border rounded-xl p-3 space-y-2 ${item.include ? 'border-quantum-border' : 'border-quantum-border/40 opacity-50'}`}>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.include}
                      onChange={(e) => updateItem(i, { include: e.target.checked })}
                      className="mt-1"
                    />
                    <span className="text-sm text-quantum-fg flex-1">{item.productName}</span>
                  </label>
                  {item.include && (
                    <div className="grid grid-cols-3 gap-2 pl-6">
                      <label className="text-xs text-quantum-muted">
                        Preço unit. (R$)
                        <input
                          type="text"
                          inputMode="decimal"
                          defaultValue={item.unitPriceCents > 0 ? (item.unitPriceCents / 100).toFixed(2).replace('.', ',') : ''}
                          placeholder="0,00"
                          onChange={(e) => {
                            const cents = parseBrlInput(e.target.value);
                            updateItem(i, { unitPriceCents: (cents ?? 0) as Centavos });
                          }}
                          className={`w-full mt-1 bg-quantum-bg border rounded-lg px-2 py-1.5 text-sm font-mono text-quantum-fg focus:outline-none focus:border-blue-500 ${item.unitPriceCents <= 0 ? 'border-amber-500/60' : 'border-quantum-border'}`}
                        />
                      </label>
                      <label className="text-xs text-quantum-muted">
                        Qtde
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, { quantity: e.target.value })}
                          className="w-full mt-1 bg-quantum-bg border border-quantum-border rounded-lg px-2 py-1.5 text-sm font-mono text-quantum-fg focus:outline-none focus:border-blue-500"
                        />
                      </label>
                      <label className="text-xs text-quantum-muted">
                        Unidade
                        <select
                          value={item.unit}
                          onChange={(e) => updateItem(i, { unit: e.target.value })}
                          className="w-full mt-1 bg-quantum-bg border border-quantum-border rounded-lg px-2 py-1.5 text-sm text-quantum-fg focus:outline-none focus:border-blue-500"
                        >
                          {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                onClick={() => { setParsed(null); setItems([]); }}
                className="px-4 py-2 text-sm text-quantum-muted hover:text-quantum-fg"
              >
                Voltar
              </button>
              <button
                onClick={() => void handleConfirm()}
                disabled={saving || included.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-xl font-medium"
              >
                <CheckCircle2 size={16} />
                {saving ? 'A registrar…' : `Registrar ${included.length} preço${included.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
