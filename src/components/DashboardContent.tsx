import { useMemo, useCallback, useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRightLeft, AlertTriangle,
  CheckCircle2, Activity, Landmark, Info, Target,
} from 'lucide-react';

import { useNavigation } from '../contexts/NavigationContext';
import { useDashboardData } from '../hooks/useFinancialData';
import ProactiveBriefing from './ProactiveBriefing';
import OneTouchActionsCard from './OneTouchActionsCard';
// Widgets analíticos pesados (gráficos) — code-split via lazy; só carregam ao expandir
// as seções recolhíveis "Saúde Financeira & Insights" / "Análises & Projeções" (PR 8).
const ForecastWidget   = lazy(() => import('./ForecastWidget'));
const SurvivalHeatmap  = lazy(() => import('./SurvivalHeatmap'));
const WealthKPIs       = lazy(() => import('./WealthKPIs'));
const DashboardCharts  = lazy(() => import('./DashboardCharts'));
import {
  calcStatus,
  calculateBudgetAlerts,
  resolveSavingsGoalPercent,
} from '../utils/dashboardUtils';
import { useForecast } from '../hooks/useForecast';
import { useBudgets } from '../hooks/useBudgets';
const BudgetWidget     = lazy(() => import('./BudgetWidget'));
import { IntelStrip } from './IntelStrip';
import KPICards from './KPICards';
import type { Transaction, ModuleBalances, CategoryDataPoint, Account, RecurringTask } from '../shared/types/transaction';
import { toCentavos, type Centavos } from '../shared/types/money';
import { useFinancialMetrics } from '../hooks/useFinancialMetrics';
import type { CreditCardWithMetrics } from '../shared/types/transaction';
import QuantumInsights from './QuantumInsights';
import QuantumCopilotCards from './QuantumCopilotCards';
import { useQuantumCopilot } from '../hooks/useQuantumCopilot';
import { useScoreHistory } from '../hooks/useScoreHistory';
import { computeHealthScore } from '../lib/healthScore';
const FinancialHealthScore = lazy(() => import('./FinancialHealthScore'));
import WeeklyCashflowWidget from './WeeklyCashflowWidget';
import { useWeeklyCashflow } from '../hooks/useWeeklyCashflow';
const TimelineWidget   = lazy(() => import('./TimelineWidget'));
import { toCentavos as toBalanceCents } from '../shared/schemas/financialSchemas';
// EconomyChallengeWidget/GoalsPanel — code-split via lazy (reduz o bundle eager do
// dashboard, mesmo padrão dos widgets analíticos acima; P2 hardening — listeners).
const EconomyChallengeWidget = lazy(() => import('./EconomyChallengeWidget'));
const GoalsPanel = lazy(() => import('./GoalsPanel'));
import AnomalyAlerts from './AnomalyAlerts';
import CentroComandoWidget from './CentroComandoWidget';
import { DashboardSection, Spinner } from '../shared/components/ui';
import type { TimeRange } from '../hooks/useFinancialData';
import type { UserCategory } from '../shared/schemas/categorySchemas';
import { DashboardHero } from './dashboard/DashboardHero';
import { useSpendingPower } from '../hooks/useSpendingPower';
import { SpendingPowerBadge } from './dashboard/SpendingPowerBadge';
import { DailyBriefingCard, type BudgetProposalPresentation } from './dashboard/DailyBriefingCard';
import { ActionConfirmationSheet } from '../features/ai-agent/ActionConfirmationSheet';
import { useAgentAction } from '../hooks/useAgentAction';
import type { ActionProposal } from '../shared/schemas/agentSchemas';
import { UpcomingEventsStrip } from './dashboard/UpcomingEventsStrip';
import { ScoreHeroCard } from './dashboard/ScoreHeroCard';
import { CrisisModeCard } from './dashboard/CrisisModeCard';
import { PatrimonioHeroCard } from './dashboard/PatrimonioHeroCard';

interface Props {
  user: { uid: string } | null;
  transactions: Transaction[];
  allTransactions: Transaction[];
  loading: boolean;
  moduleBalances: ModuleBalances | null;
  categoryData?: CategoryDataPoint[];
  topExpensesData?: CategoryDataPoint[];
  monthlyGoal: { percent?: number } | number | null;
  setMonthlyGoal: (goal: number) => void;
  onSaveTransaction: (tx: Partial<Transaction>) => Promise<void>;
  onEditTransaction?: (tx: Transaction) => void;
  onDeleteRequest?: (tx: Transaction | null) => void;
  onBatchDelete?: (ids: string[]) => Promise<void> | void;
  isFormOpen: boolean;
  setIsFormOpen: (v: boolean) => void;
  transactionToEdit: Transaction | null;
  setTransactionToEdit: (tx: Transaction | null) => void;
  onCloseForm?: () => void;
  accounts: Account[];
  recurringTasks: RecurringTask[];
  categories?: UserCategory[];
  /** Levantado em App.tsx (única fonte do listener onSnapshot de creditCards). */
  creditCards: CreditCardWithMetrics[];
  totalFaturaCents: Centavos;
}

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden:  { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 80, damping: 15 } },
};

const TIME_RANGE_LABELS: { value: TimeRange; label: string }[] = [
  { value: '7d',  label: '7 dias'  },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'all', label: 'Tudo'    },
];

export default function DashboardContent({
  user,
  transactions,
  allTransactions,
  loading,
  moduleBalances,
  monthlyGoal,
  onEditTransaction,
  setIsFormOpen,
  setTransactionToEdit,
  accounts,
  recurringTasks,
  categories = [],
  creditCards,
  totalFaturaCents,
}: Props) {
  const { currentMonth, currentYear, setCurrentPage } = useNavigation();
  // ── Hero metrics from existing moduleBalances prop ────────────────────────
  const saldo    = moduleBalances?.geral?.saldo    ?? 0;
  const receitas = moduleBalances?.geral?.receitas ?? 0;
  const despesas = moduleBalances?.geral?.despesas ?? 0;

  // Shared transaction set used by both forecast and budgets
  const txSet = allTransactions.length > 0 ? allTransactions : transactions;

  // Forecast driven by the full transaction set and live balance
  const forecast = useForecast(txSet, saldo);

  // Budget insights — lifted here so ProactiveBriefing and BudgetWidget share one subscription
  const { budgets, insights: budgetInsights, loading: budgetsLoading } = useBudgets(user?.uid ?? '', txSet);
  const budgetAlerts = useMemo(
    () => calculateBudgetAlerts(budgets, txSet),
    [budgets, txSet],
  );

  const patrimonio = moduleBalances?.geral?.patrimonio ?? saldo;
  const dividas    = moduleBalances?.geral?.dividas    ?? 0;
  const metaEcon   = resolveSavingsGoalPercent(monthlyGoal);

  const st = useMemo(
    () => calcStatus(saldo, receitas, despesas, patrimonio, dividas, metaEcon),
    [saldo, receitas, despesas, patrimonio, dividas, metaEcon],
  );

  const { status, color, rec, score, savingsRate, debtRatio, goalProgress } = st;

  const currentYYYYMM = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const todayYYYYMM = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const remainingDays = useMemo(() => {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return Math.max(0, daysInMonth - today.getDate());
  }, []);

  const spendingPower = useSpendingPower({
    saldo,
    recurringTasks,
    cardInvoiceCents: totalFaturaCents,
    currentYYYYMM: todayYYYYMM,
  });

  const { metrics, loadingMetrics } = useFinancialMetrics(
    user?.uid ?? '',
    allTransactions,
    accounts,
    currentMonth,
    currentYear,
    totalFaturaCents,
  );

  const StatusIcon  = status === 'CRÍTICO' ? AlertTriangle : status === 'ATENÇÃO' ? Activity : CheckCircle2;
  const incomeDelta = receitas > 0 ? ((receitas - despesas) / receitas * 100) : 0;
  const canonicalScore = metrics ? computeHealthScore(metrics) : score;

  const badgeColor = ({
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red:     'bg-red-500/10 text-red-400 border-red-500/20',
  } as Record<string, string>)[color] ?? '';

  const glowColor = ({
    emerald: 'bg-emerald-500',
    amber:   'bg-amber-500',
    red:     'bg-red-500',
  } as Record<string, string>)[color] ?? 'bg-emerald-500';

  const handleEditTx = useCallback((t: Transaction) => {
    if (onEditTransaction) {
      onEditTransaction(t);
    } else {
      setTransactionToEdit(t);
      setIsFormOpen(true);
    }
  }, [onEditTransaction, setTransactionToEdit, setIsFormOpen]);
  void handleEditTx;

  // ── Dashboard data hook (real-time, with timeRange) ───────────────────────
  const {
    kpis,
    timelineData,
    categoryData: dashCategoryData,
    timeRange,
    setTimeRange,
    loading: dashLoading,
  // FIX: single source of truth for transactions
  } = useDashboardData(allTransactions, loading, categories);

  const { history: scoreHistory } = useScoreHistory(user?.uid ?? '', metrics);

  const { insights: copilotInsights } = useQuantumCopilot({
    uid:            user?.uid ?? '',
    transactions:   allTransactions,
    recurringTasks,
    balance:        saldo,
    timeRange,
    loading,
  });

  const { weeks: cashflowWeeks, futureEvents } = useWeeklyCashflow(allTransactions, recurringTasks);

  // ── Insight → ActionProposal (create_budget via DailyBriefingCard) ───────────
  const [insightProposal, setInsightProposal] = useState<{
    proposal: ActionProposal;
    title: string;
    question: string;
    rows: BudgetProposalPresentation['rows'];
  } | null>(null);

  const { status: insightAgentStatus, error: insightAgentError, runAction: runInsightAction, reset: resetInsightAgent } = useAgentAction();

  const handleInsightPropose = useCallback((
    proposal: ActionProposal,
    pres: BudgetProposalPresentation,
  ) => {
    resetInsightAgent();
    setInsightProposal({ proposal, ...pres });
  }, [resetInsightAgent]);

  const handleInsightConfirm = useCallback(async () => {
    if (!insightProposal || !user?.uid) return;
    await runInsightAction(insightProposal.proposal, {
      intent: 'create_budget_proposal',
      question: insightProposal.question,
    });
  }, [insightProposal, user?.uid, runInsightAction]);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-[1800px] mx-auto px-4 md:px-6 py-8 space-y-6"
    >
      {/* ════════════════════════════════════════════════════════
          ACIMA DA DOBRA — 4 elementos fixos
          1. Alertas urgentes  2. Hero  3. Posso gastar?  4. Próximos 7 dias
          ════════════════════════════════════════════════════════ */}

      {/* 1. Alertas acionáveis */}
      <motion.div variants={itemVariants}>
        <CentroComandoWidget
          budgetAlerts={budgetAlerts}
          recurringTasks={recurringTasks}
          cards={creditCards}
          loading={budgetsLoading}
        />
      </motion.div>

      {/* 2. Hero — saldo + CTA principal */}
      <DashboardHero
        saldo={saldo}
        receitas={receitas}
        despesas={despesas}
        incomeDelta={incomeDelta}
        score={canonicalScore}
        color={color}
        status={status}
        rec={rec}
        glowColor={glowColor}
        badgeColor={badgeColor}
        StatusIcon={StatusIcon}
        txSet={txSet}
        onNewTransaction={() => setIsFormOpen(true)}
      />

      {/* Modo crise — condicional, substitui/complementa SpendingPower em danger */}
      {spendingPower.zone === 'danger' && (
        <motion.div variants={itemVariants}>
          <CrisisModeCard
            availableCents={spendingPower.availableCents}
            onNavigate={setCurrentPage}
          />
        </motion.div>
      )}

      {/* 3. Posso gastar hoje? */}
      <motion.div variants={itemVariants}>
        <SpendingPowerBadge power={spendingPower} remainingDays={remainingDays} />
      </motion.div>

      {/* 4. Próximos 7 dias — eventos financeiros iminentes */}
      <motion.div variants={itemVariants}>
        <UpcomingEventsStrip
          recurringTasks={recurringTasks}
          creditCards={creditCards}
          transactions={txSet}
          currentMonth={currentMonth}
          currentYear={currentYear}
        />
      </motion.div>

      {/* ════════════════════════════════════════════════════════
          INSIGHTS & METAS — aberto por padrão, abaixo da dobra
          ════════════════════════════════════════════════════════ */}
      <DashboardSection title="Insights & Metas" icon={Target} collapsible defaultCollapsed={false}>
        <div className="space-y-6 pt-2">
          <Suspense fallback={<div className="py-10 flex justify-center"><Spinner /></div>}>

            {/* Briefing diário — top 3 insights determinísticos */}
            <motion.div variants={itemVariants}>
              <DailyBriefingCard
                transactions={txSet}
                accounts={accounts}
                cardOpenInvoicesCents={totalFaturaCents}
                currentMonth={todayYYYYMM}
                budgets={budgets}
                onNavigate={setCurrentPage}
                onPropose={handleInsightPropose}
              />
            </motion.div>

            {/* Metas de poupança */}
            <motion.div variants={itemVariants}>
              <GoalsPanel
                uid={user?.uid ?? ''}
                {...(metrics ? { ativosCents: metrics.ativosCents } : {})}
                {...(metrics && metrics.despesa > 0
                  ? { monthlyExpensesCents: toCentavos(metrics.despesa) as Centavos }
                  : {})}
              />
            </motion.div>

            {/* Ação de 1 Toque — recorrentes a vencer */}
            <motion.div variants={itemVariants}>
              <OneTouchActionsCard uid={user?.uid ?? ''} recurringTasks={recurringTasks} />
            </motion.div>

          </Suspense>
        </div>
      </DashboardSection>

      {/* ════════════════════════════════════════════════════════
          SAÚDE FINANCEIRA & INSIGHTS — recolhido por padrão
          ════════════════════════════════════════════════════════ */}
      <DashboardSection title="Saúde Financeira" icon={Activity} collapsible defaultCollapsed>
        <div className="space-y-6 pt-2">
        <Suspense fallback={<div className="py-10 flex justify-center"><Spinner /></div>}>

      {/* KPIs de saúde — taxa poupança, endividamento, metas */}
      <motion.div variants={itemVariants}>
        <IntelStrip
          savingsRate={savingsRate}
          debtRatio={debtRatio}
          goalProgress={goalProgress}
          savingsGoalPercent={metaEcon}
        />
      </motion.div>

      {/* Score de saúde — ring compacto + trend */}
      <motion.div variants={itemVariants}>
        <ScoreHeroCard
          metrics={metrics}
          loading={loadingMetrics}
          history={scoreHistory}
          selectedMonth={currentYYYYMM}
        />
      </motion.div>

      {/* Patrimônio líquido — ativos vs passivos */}
      <motion.div variants={itemVariants}>
        <PatrimonioHeroCard metrics={metrics} loading={loadingMetrics} />
      </motion.div>

      <QuantumInsights metrics={metrics} loading={loadingMetrics} />

      <motion.div variants={itemVariants}>
        <FinancialHealthScore metrics={metrics} loading={loadingMetrics} history={scoreHistory} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <WeeklyCashflowWidget
          weeks={cashflowWeeks}
          futureEvents={futureEvents}
          loading={loading}
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <EconomyChallengeWidget
          uid={user?.uid ?? ''}
          transactions={allTransactions}
          loading={loading}
        />
      </motion.div>

      {copilotInsights.length > 0 && (
        <motion.div variants={itemVariants}>
          <QuantumCopilotCards insights={copilotInsights} loading={loading} />
        </motion.div>
      )}

      <motion.div variants={itemVariants}>
        <AnomalyAlerts transactions={allTransactions} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <ProactiveBriefing
          uid={user?.uid ?? ''}
          kpis={kpis}
          categoryData={dashCategoryData}
          timeRange={timeRange}
          dataLoading={dashLoading}
          forecast={forecast}
          budgets={budgetInsights}
          monteCarloData={{
            survivalRate:    forecast.survivalRate,
            ruinProbability: forecast.ruinProbability,
            riskLevel:       forecast.riskLevel,
            insight:         forecast.insight,
            mcLoading:       forecast.mcLoading,
          }}
        />
      </motion.div>

        </Suspense>
        </div>
      </DashboardSection>

      {/* ════════════════════════════════════════════════════════
          ANÁLISES & PROJEÇÕES — recolhido por padrão
          ════════════════════════════════════════════════════════ */}
      <DashboardSection title="Análises & Projeções" icon={Landmark} collapsible defaultCollapsed>
        <div className="space-y-6 pt-2">
        <Suspense fallback={<div className="py-10 flex justify-center"><Spinner /></div>}>

      {/* KPIs de período — receita, despesa, saldo, projeção */}
      <motion.div variants={itemVariants}>
        <KPICards transactions={transactions} />
      </motion.div>

      {/* KPIs + Gráficos com filtro de tempo */}
      <motion.div variants={itemVariants} className="space-y-4">
        {/* Seletor de período */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mr-1">Período:</span>
          {TIME_RANGE_LABELS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTimeRange(value)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                timeRange === value
                  ? 'bg-quantum-accent/20 text-quantum-accent border-quantum-accent/40'
                  : 'bg-quantum-card text-quantum-fgMuted border-quantum-border hover:border-quantum-accent/30 hover:text-quantum-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* KPIs agregados */}
        <WealthKPIs kpis={kpis} loading={dashLoading} />

        {/* Gráficos */}
        <DashboardCharts timelineData={timelineData} categoryData={dashCategoryData} />
      </motion.div>

      {/* ── MAPA DE CALOR ─────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <SurvivalHeatmap transactions={transactions} currentMonth={currentMonth} currentYear={currentYear} />
      </motion.div>

      {/* ── ORÇAMENTOS QUÂNTICOS ─────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <BudgetWidget
          uid={user?.uid ?? ''}
          transactions={txSet}
        />
      </motion.div>

      {/* ── PROJEÇÃO QUÂNTICA ─────────────────────────────────── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-quantum-fg uppercase tracking-widest">Projeção de Fluxo de Caixa</h2>
            <span title="Projeção de fluxo de caixa baseada nas suas transações atuais e despesas fixas."><Info className="w-4 h-4 text-quantum-fgMuted cursor-help" /></span>
          </div>
          <div className="bg-quantum-card/40 backdrop-blur-sm rounded-2xl p-5 border border-quantum-border min-h-[400px]">
            <ForecastWidget
              transactions={txSet}
              currentBalance={saldo}
            />
          </div>
        </div>
      </motion.div>

      {/* ── TIMELINE 90 DIAS ──────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <TimelineWidget
          transactions={txSet}
          recurringTasks={recurringTasks}
          currentBalanceCents={toBalanceCents(saldo)}
        />
      </motion.div>

        </Suspense>
        </div>
      </DashboardSection>

      {/* ── CONFIRMAÇÃO DE ORÇAMENTO VIA INSIGHT ─────────────── */}
      {insightProposal && (
        <ActionConfirmationSheet
          open={!!insightProposal}
          onClose={() => { setInsightProposal(null); resetInsightAgent(); }}
          onConfirm={handleInsightConfirm}
          title={insightProposal.title}
          question={insightProposal.question}
          rows={insightProposal.rows}
          status={insightAgentStatus}
          error={insightAgentError}
          confirmLabel="Definir orçamento"
          successMessage="Orçamento criado com sucesso."
        />
      )}

      {/* ── FAB MOBILE ────────────────────────────────────────── */}
      <button
        onClick={() => setIsFormOpen(true)}
        className="fixed bottom-6 right-6 lg:hidden w-14 h-14 bg-gradient-to-br from-cyan-500 to-violet-500 rounded-full flex items-center justify-center shadow-2xl shadow-cyan-500/50 z-50 active:scale-95 transition-transform"
        aria-label="Nova transação"
      >
        <ArrowRightLeft className="w-6 h-6 text-quantum-fg" />
      </button>

      <style>{`
        @keyframes slowRotate { 0% { transform: translate(-30%, -30%) rotate(0deg); } 100% { transform: translate(-30%, -30%) rotate(360deg); } }
        .animate-slow-rotate { animation: slowRotate 20s infinite linear; }
      `}</style>
    </motion.div>
  );
}
