/**
 * PurchaseSimulator.tsx — Simulador de Decisão de Compra (FASE 3)
 * Responde "posso comprar isso agora?" com veredito verde/amarelo/vermelho.
 */
import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart, CheckCircle2, AlertTriangle, XCircle,
  TrendingUp, CalendarDays, CreditCard, Info,
} from 'lucide-react';
import { toCentavos, formatBRL } from '../../shared/types/money';
import type { Centavos } from '../../shared/types/money';
import { simulatePurchase } from '../../lib/purchaseSimulator';
import type { PurchaseSimulatorResult, VerdictColor } from '../../lib/purchaseSimulator';
import { usePrivacy } from '../../contexts/PrivacyContext';
import type { Transaction, ModuleBalances, CreditCardWithMetrics } from '../../shared/types/transaction';

// ─── Helper de formatação ──────────────────────────────────────────────────────
const MONTH_NAMES_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
] as const;

function formatCompetencia(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = parseInt(m ?? '1', 10) - 1;
  return `${MONTH_NAMES_PT[idx] ?? m}/${y}`;
}

function parseBrlInput(raw: string): Centavos | null {
  const clean = raw.replace(/\s/g, '').replace(',', '.');
  if (!clean || isNaN(Number(clean))) return null;
  try {
    return toCentavos(clean);
  } catch {
    return null;
  }
}

// ─── Veredito ─────────────────────────────────────────────────────────────────
const VERDICT_META: Record<VerdictColor, {
  icon: React.ReactNode;
  label: string;
  bg: string;
  border: string;
  text: string;
}> = {
  green: {
    icon: <CheckCircle2 className="w-5 h-5" />,
    label: 'Compra segura',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
  },
  yellow: {
    icon: <AlertTriangle className="w-5 h-5" />,
    label: 'Atenção',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
  },
  red: {
    icon: <XCircle className="w-5 h-5" />,
    label: 'Compra arriscada',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    text: 'text-rose-400',
  },
};

// ─── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  transactions: Transaction[];
  balances: Partial<ModuleBalances> | null;
  uid?: string;
  onRegisterPurchase?: (prefill: Partial<Transaction>) => void;
  creditCards?: CreditCardWithMetrics[];
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function PurchaseSimulator({ balances, onRegisterPurchase, creditCards }: Props) {
  const { isPrivacyMode } = usePrivacy();

  // ── Inputs ──────────────────────────────────────────────────────────────────
  const [priceRaw, setPriceRaw]           = useState('');
  const [installments, setInstallments]   = useState(1);
  const [closingDay, setClosingDay]       = useState(10);
  const [purchaseDate, setPurchaseDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [incomeRaw, setIncomeRaw]         = useState('');
  const [committedRaw, setCommittedRaw]   = useState('');
  const [cdiRateStr, setCdiRateStr]       = useState('0.83');
  const [commitLimitPct, setCommitLimitPct] = useState(30);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Saldo vem do contexto financeiro
  const balanceCents = useMemo<Centavos>(() => {
    const raw = balances?.geral?.saldo ?? 0;
    try { return toCentavos(raw); } catch { return 0 as Centavos; }
  }, [balances]);

  // Cartão selecionado (dados reais da FASE C)
  const selectedCard = useMemo(
    () => (creditCards ?? []).find(c => c.id === selectedCardId) ?? null,
    [creditCards, selectedCardId],
  );

  // ── Simulação ────────────────────────────────────────────────────────────────
  const result = useMemo<PurchaseSimulatorResult | null>(() => {
    const price = parseBrlInput(priceRaw);
    if (!price || price <= 0) return null;

    const monthlyIncome = parseBrlInput(incomeRaw) ?? undefined;
    const cdi = parseFloat(cdiRateStr) / 100;

    // Quando um cartão é selecionado: usa dados reais; caso contrário, fallback manual.
    const effectiveClosingDay = selectedCard?.closingDay ?? closingDay;
    const committed = selectedCard
      ? selectedCard.metrics.committedFutureCents
      : (parseBrlInput(committedRaw) ?? 0 as Centavos);
    const cardEffectiveLimitCents = selectedCard?.metrics.effectiveAvailableCents;

    return simulatePurchase({
      priceCents:            price,
      installments,
      closingDay:            effectiveClosingDay,
      purchaseDateISO:       purchaseDate,
      currentBalanceCents:   balanceCents,
      ...(monthlyIncome !== undefined ? { monthlyIncomeCents: monthlyIncome } : {}),
      commitmentLimitPct:    commitLimitPct / 100,
      currentCommittedCents: committed,
      cdiMonthlyRate:        isFinite(cdi) && cdi > 0 ? cdi : 0.0083,
      ...(cardEffectiveLimitCents !== undefined ? { cardEffectiveLimitCents } : {}),
    });
  }, [priceRaw, installments, closingDay, purchaseDate, balanceCents, incomeRaw, committedRaw, cdiRateStr, commitLimitPct, selectedCard]);

  const handleRegister = useCallback(() => {
    const price = parseBrlInput(priceRaw);
    if (!price || !onRegisterPurchase) return;
    onRegisterPurchase({
      description: 'Compra simulada',
      type: 'saida',
      value_cents: price,
      date: purchaseDate,
      source: 'manual',
      ...(installments > 1 ? { installmentCount: installments } : {}),
    });
  }, [priceRaw, purchaseDate, installments, onRegisterPurchase]);

  const mask = '•••••';
  const showValue = (cents: number) =>
    isPrivacyMode ? mask : formatBRL(cents);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="max-w-[900px] mx-auto px-4 md:px-6 py-8 space-y-6"
    >
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
          <ShoppingCart className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-black text-quantum-fg tracking-tight">Simulador de Compra</h1>
          <p className="text-xs text-quantum-fgMuted uppercase tracking-wider font-medium">
            Posso comprar isso agora?
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Painel de entrada ─────────────────────────────────────── */}
        <div className="bg-quantum-bg/90 backdrop-blur-2xl border border-white/8 rounded-2xl p-5 space-y-4">
          <h3 className="text-[10px] font-black text-quantum-fgMuted uppercase tracking-widest pb-2 border-b border-quantum-border flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5" /> Dados da Compra
          </h3>

          {/* Seletor de cartão — visível apenas se houver cartões cadastrados */}
          {creditCards && creditCards.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-quantum-fg flex items-center gap-1">
                <CreditCard className="w-3 h-3" /> Cartão de crédito
              </label>
              <select
                value={selectedCardId ?? ''}
                onChange={e => setSelectedCardId(e.target.value || null)}
                className="w-full bg-quantum-card/60 border border-quantum-border rounded-xl px-3 py-2.5 text-sm text-quantum-fg focus:outline-none focus:border-violet-500/60 transition-colors"
              >
                <option value="">Manual (sem cartão)</option>
                {creditCards.map(card => (
                  <option key={card.id} value={card.id}>
                    {card.name} — efetivo {isPrivacyMode ? '•••••' : formatBRL(card.metrics.effectiveAvailableCents)}
                  </option>
                ))}
              </select>
              {selectedCard && (
                <p className="text-[10px] text-cyan-400 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Dados reais · fechamento dia {selectedCard.closingDay} · comprometido futuro {isPrivacyMode ? mask : formatBRL(selectedCard.metrics.committedFutureCents)}
                </p>
              )}
            </div>
          )}

          {/* Valor */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-quantum-fg">Valor da compra (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={priceRaw}
              onChange={e => setPriceRaw(e.target.value)}
              className="w-full bg-quantum-card/60 border border-quantum-border rounded-xl px-3 py-2.5 text-sm text-quantum-fg placeholder-quantum-fgMuted focus:outline-none focus:border-violet-500/60 transition-colors"
            />
          </div>

          {/* Parcelas */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-quantum-fg">Parcelas</label>
            <select
              value={installments}
              onChange={e => setInstallments(Number(e.target.value))}
              className="w-full bg-quantum-card/60 border border-quantum-border rounded-xl px-3 py-2.5 text-sm text-quantum-fg focus:outline-none focus:border-violet-500/60 transition-colors"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>
              ))}
            </select>
          </div>

          {/* Data e fechamento */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-quantum-fg flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Data da compra
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={e => setPurchaseDate(e.target.value)}
                className="w-full bg-quantum-card/60 border border-quantum-border rounded-xl px-3 py-2.5 text-sm text-quantum-fg focus:outline-none focus:border-violet-500/60 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-quantum-fg">
                Dia de fechamento{selectedCard ? ' (cartão)' : ''}
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={selectedCard?.closingDay ?? closingDay}
                onChange={e => setClosingDay(Math.max(1, Math.min(31, Number(e.target.value))))}
                readOnly={!!selectedCard}
                className={`w-full bg-quantum-card/60 border border-quantum-border rounded-xl px-3 py-2.5 text-sm text-quantum-fg focus:outline-none transition-colors ${selectedCard ? 'opacity-60 cursor-not-allowed' : 'focus:border-violet-500/60'}`}
              />
            </div>
          </div>

          <h3 className="text-[10px] font-black text-quantum-fgMuted uppercase tracking-widest pb-2 pt-1 border-b border-quantum-border flex items-center gap-2">
            <Info className="w-3.5 h-3.5" /> Contexto Financeiro (opcional)
          </h3>

          {/* Renda e já comprometido */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-quantum-fg">Renda mensal (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="ex: 5000"
                value={incomeRaw}
                onChange={e => setIncomeRaw(e.target.value)}
                className="w-full bg-quantum-card/60 border border-quantum-border rounded-xl px-3 py-2.5 text-sm text-quantum-fg placeholder-quantum-fgMuted focus:outline-none focus:border-violet-500/60 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-quantum-fg">Já comprometido (R$)</label>
              {selectedCard ? (
                <div className="flex items-center justify-between bg-quantum-card/40 border border-quantum-border rounded-xl px-3 py-2.5">
                  <span className="text-[10px] text-quantum-fgMuted">Parcelas futuras reais</span>
                  <span className="text-sm font-mono font-bold text-violet-300">
                    {isPrivacyMode ? mask : formatBRL(selectedCard.metrics.committedFutureCents)}
                  </span>
                </div>
              ) : (
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="ex: 800"
                  value={committedRaw}
                  onChange={e => setCommittedRaw(e.target.value)}
                  className="w-full bg-quantum-card/60 border border-quantum-border rounded-xl px-3 py-2.5 text-sm text-quantum-fg placeholder-quantum-fgMuted focus:outline-none focus:border-violet-500/60 transition-colors"
                />
              )}
            </div>
          </div>

          {/* Limite % e CDI */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-quantum-fg">Limite comprometimento (%)</label>
              <input
                type="number"
                min={5}
                max={80}
                value={commitLimitPct}
                onChange={e => setCommitLimitPct(Math.max(5, Math.min(80, Number(e.target.value))))}
                className="w-full bg-quantum-card/60 border border-quantum-border rounded-xl px-3 py-2.5 text-sm text-quantum-fg focus:outline-none focus:border-violet-500/60 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-quantum-fg">CDI mensal (%)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.83"
                value={cdiRateStr}
                onChange={e => setCdiRateStr(e.target.value)}
                className="w-full bg-quantum-card/60 border border-quantum-border rounded-xl px-3 py-2.5 text-sm text-quantum-fg placeholder-quantum-fgMuted focus:outline-none focus:border-violet-500/60 transition-colors"
              />
            </div>
          </div>

          {/* Saldo / Limite efetivo (informativo) */}
          <div className="flex items-center justify-between pt-1 text-xs text-quantum-fgMuted border-t border-quantum-border">
            {selectedCard ? (
              <>
                <span>Limite efetivo do cartão</span>
                <span className="font-mono font-bold text-violet-300">
                  {isPrivacyMode ? mask : formatBRL(selectedCard.metrics.effectiveAvailableCents)}
                </span>
              </>
            ) : (
              <>
                <span>Saldo disponível atual</span>
                <span className="font-mono font-bold text-cyan-400">
                  {isPrivacyMode ? mask : formatBRL(balanceCents)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Painel de resultado ────────────────────────────────────── */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-quantum-bg/90 backdrop-blur-2xl border border-white/8 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-quantum-fgMuted min-h-[160px]"
              >
                <ShoppingCart className="w-10 h-10 opacity-30" />
                <p className="text-sm text-center">Informe o valor da compra para ver o veredito</p>
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                className="space-y-4"
              >
                {/* Veredito */}
                {(() => {
                  const meta = VERDICT_META[result.verdict];
                  return (
                    <div className={`rounded-2xl border ${meta.bg} ${meta.border} p-5 space-y-3`}>
                      <div className={`flex items-center gap-3 ${meta.text}`}>
                        {meta.icon}
                        <span className="text-base font-black">{meta.label}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {result.verdictReasons.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-quantum-fg">
                            <span className={`mt-0.5 shrink-0 ${meta.text}`}>•</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                {/* Métricas */}
                <div className="bg-quantum-bg/90 backdrop-blur-2xl border border-white/8 rounded-2xl p-5 space-y-3">
                  <h3 className="text-[10px] font-black text-quantum-fgMuted uppercase tracking-widest pb-2 border-b border-quantum-border">
                    Resumo Financeiro
                  </h3>
                  {[
                    {
                      label: 'Valor da parcela',
                      value: showValue(result.installmentAmountCents),
                      sub: installments > 1 ? `${installments}x` : 'à vista',
                    },
                    {
                      label: 'Custo total',
                      value: showValue(result.totalCostCents),
                    },
                    ...(selectedCard ? [{
                      label: 'Limite efetivo após compra',
                      value: showValue(result.effectiveLimitAfterCents),
                    }] : [{
                      label: '% comprometido (após)',
                      value: result.limitUsagePct > 0
                        ? `${(result.limitUsagePct * 100).toFixed(1)}%`
                        : '—',
                    }]),
                    ...(result.investmentGainCents !== undefined ? [{
                      label: 'Ganho CDI potencial',
                      value: showValue(result.investmentGainCents),
                      highlight: true,
                    }] : []),
                  ].map(({ label, value, sub, highlight }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-quantum-fgMuted">{label}</span>
                      <div className="text-right">
                        <span className={`text-sm font-mono font-bold ${highlight ? 'text-emerald-400' : 'text-quantum-fg'}`}>
                          {value}
                        </span>
                        {sub && <span className="text-[10px] text-quantum-fgMuted ml-1">{sub}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Impacto nas faturas */}
                {result.invoiceImpact.length > 0 && (
                  <div className="bg-quantum-bg/90 backdrop-blur-2xl border border-white/8 rounded-2xl p-5 space-y-3">
                    <h3 className="text-[10px] font-black text-quantum-fgMuted uppercase tracking-widest pb-2 border-b border-quantum-border flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5" /> Impacto nas Faturas
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {result.invoiceImpact.map(({ competencia, additionalCents }) => (
                        <div
                          key={competencia}
                          className="flex flex-col items-center bg-quantum-card/60 border border-quantum-border rounded-xl px-3 py-2 min-w-[80px]"
                        >
                          <span className="text-[10px] text-quantum-fgMuted font-bold uppercase tracking-wider">
                            {formatCompetencia(competencia)}
                          </span>
                          <span className="text-xs font-mono font-black text-violet-300 mt-0.5">
                            {isPrivacyMode ? mask : `+ ${formatBRL(additionalCents)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botão Registrar */}
                {onRegisterPurchase && (
                  <button
                    type="button"
                    onClick={handleRegister}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 font-bold text-sm transition-all"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Registrar esta compra
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="text-[10px] text-slate-600 text-center px-4 leading-relaxed">
        Simulação baseada nos dados inseridos · Não constitui aconselhamento financeiro.
        CDI estimado em {cdiRateStr}% a.m. · Saldo via dados do sistema.
      </p>
    </motion.div>
  );
}
