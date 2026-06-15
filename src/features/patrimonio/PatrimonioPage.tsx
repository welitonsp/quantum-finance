import { useMemo } from 'react';
import {
  Landmark, CreditCard, TrendingDown, Receipt,
  ArrowUpRight, Wallet, AlertCircle,
} from 'lucide-react';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAccounts } from '../../hooks/useAccounts';
import { useCreditCards } from '../../hooks/useCreditCards';
import { useDebts } from '../../hooks/useDebts';
import { useGoals } from '../../hooks/useGoals';
import { formatBRL } from '../../shared/types/money';
import type { Centavos } from '../../shared/types/money';
import { LoadingPage } from '../../shared/components/ui';

interface Props {
  uid: string;
}

export default function PatrimonioPage({ uid }: Props) {
  const { setCurrentPage }    = useNavigation();
  const { accounts, loadingAccounts }  = useAccounts(uid);
  const { cards, totalFaturaCents, loading: loadingCards } = useCreditCards(uid);
  const { debts, loading: loadingDebts } = useDebts(uid);
  const { goals, loading: loadingGoals } = useGoals(uid);

  const loading = loadingAccounts || loadingCards || loadingDebts || loadingGoals;

  const totalAssetsCents = useMemo<Centavos>(
    () => accounts.reduce((acc, a) => acc + a.balance, 0) as Centavos,
    [accounts],
  );

  const activeDebts = useMemo(() => debts.filter(d => d.active), [debts]);

  const totalDebtRemainingCents = useMemo<Centavos>(
    () => activeDebts.reduce((acc, d) => acc + d.remainingCents, 0) as Centavos,
    [activeDebts],
  );

  const totalLiabilitiesCents = useMemo<Centavos>(
    () => (totalDebtRemainingCents + totalFaturaCents) as Centavos,
    [totalDebtRemainingCents, totalFaturaCents],
  );

  const netWorthCents = useMemo<Centavos>(
    () => (totalAssetsCents - totalLiabilitiesCents) as Centavos,
    [totalAssetsCents, totalLiabilitiesCents],
  );

  const activeGoals = useMemo(() => goals.filter(g => g.currentCents < g.targetCents), [goals]);

  if (loading) return <LoadingPage label="Carregando patrimônio..." />;

  const isPositive = netWorthCents >= 0;

  const modules = [
    {
      id:          'accounts',
      icon:        Landmark,
      label:       'Contas',
      color:       'text-emerald-400',
      bg:          'bg-emerald-500/10',
      border:      'border-emerald-500/20',
      summary:     `${accounts.length} conta${accounts.length !== 1 ? 's' : ''}`,
      detail:      `Saldo total: ${formatBRL(totalAssetsCents)}`,
    },
    {
      id:          'cards',
      icon:        CreditCard,
      label:       'Cartões',
      color:       'text-blue-400',
      bg:          'bg-blue-500/10',
      border:      'border-blue-500/20',
      summary:     `${cards.length} cartão${cards.length !== 1 ? 'ões' : ''}`,
      detail:      `Fatura total: ${formatBRL(totalFaturaCents)}`,
    },
    {
      id:          'debts',
      icon:        TrendingDown,
      label:       'Dívidas',
      color:       activeDebts.length > 0 ? 'text-red-400' : 'text-quantum-fgMuted',
      bg:          activeDebts.length > 0 ? 'bg-red-500/10' : 'bg-quantum-card/60',
      border:      activeDebts.length > 0 ? 'border-red-500/20' : 'border-quantum-border',
      summary:     `${activeDebts.length} dívida${activeDebts.length !== 1 ? 's' : ''} ativa${activeDebts.length !== 1 ? 's' : ''}`,
      detail:      `Total restante: ${formatBRL(totalDebtRemainingCents)}`,
    },
    {
      id:          'ir',
      icon:        Receipt,
      label:       'Módulo IR',
      color:       'text-amber-400',
      bg:          'bg-amber-500/10',
      border:      'border-amber-500/20',
      summary:     'Apuração de IR',
      detail:      'Informe de rendimentos e ganho de capital',
    },
  ] as const;

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-quantum-accent/10 border border-quantum-accent/25 flex items-center justify-center">
          <Wallet className="w-5 h-5 text-quantum-accent" />
        </div>
        <div>
          <h1 className="text-xl font-black text-quantum-fg">Patrimônio & Objetivos</h1>
          <p className="text-xs text-quantum-fgMuted">Visão consolidada de ativos, passivos e metas</p>
        </div>
      </div>

      {/* Net Worth KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-quantum-card/50 border border-quantum-border rounded-2xl p-5">
          <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wider mb-2">Total de Ativos</p>
          <p className="text-2xl font-black font-mono text-emerald-400">{formatBRL(totalAssetsCents)}</p>
          <p className="text-xs text-quantum-fgMuted mt-1">{accounts.length} conta{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-quantum-card/50 border border-quantum-border rounded-2xl p-5">
          <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wider mb-2">Total de Passivos</p>
          <p className="text-2xl font-black font-mono text-red-400">{formatBRL(totalLiabilitiesCents)}</p>
          <p className="text-xs text-quantum-fgMuted mt-1">Cartões + dívidas ativas</p>
        </div>
        <div className={`rounded-2xl p-5 border ${isPositive ? 'bg-emerald-500/5 border-emerald-500/25' : 'bg-red-500/5 border-red-500/25'}`}>
          <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wider mb-2">Patrimônio Líquido</p>
          <p className={`text-2xl font-black font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatBRL(netWorthCents)}
          </p>
          {!isPositive && (
            <div className="flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
              <p className="text-[10px] text-red-400">Passivos superam ativos</p>
            </div>
          )}
          {isPositive && activeGoals.length > 0 && (
            <p className="text-xs text-quantum-fgMuted mt-1">
              {activeGoals.length} meta{activeGoals.length !== 1 ? 's' : ''} em andamento
            </p>
          )}
        </div>
      </div>

      {/* Módulos */}
      <section aria-label="Módulos de patrimônio">
        <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wider font-bold mb-4">Módulos</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {modules.map(({ id, icon: Icon, label, color, bg, border, summary, detail }) => (
            <button
              key={id}
              onClick={() => setCurrentPage(id)}
              className={`text-left flex items-start gap-4 p-5 rounded-2xl border ${border} ${bg} hover:brightness-110 transition-all group`}
              aria-label={`Ir para ${label}`}
            >
              <div className={`p-3 rounded-xl bg-white/5 ${color} shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-quantum-fg group-hover:text-white transition-colors">{label}</p>
                <p className="text-xs font-bold text-quantum-fgMuted mt-0.5">{summary}</p>
                <p className="text-[11px] text-quantum-fgMuted mt-1 truncate">{detail}</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-quantum-fgMuted group-hover:text-white transition-colors shrink-0 mt-1" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
