/**
 * Estados vazios honestos para conta sem dados financeiros (QA em produção:
 * conta com 0 contas e 0 transações exibia números fictícios/alarmantes).
 *
 * Cobre num único arquivo (limite de arquivos do PR):
 *  - GemeloFinanceiro e SimulationCenter: sem transações → estado vazio, sem
 *    números de exemplo (R$ 5.000 / R$ 3.000 / R$ 1.200); com dados → stats/gráfico.
 *  - DashboardContent: sem dados → sem CrisisModeCard, sem % de risco, sem
 *    "Meta Atrasada" e score neutro.
 *
 * Fica fora de `src/components/DashboardContent.test.tsx` porque aquele arquivo
 * não carrega na main (FirebaseError auth/invalid-api-key ao importar o SDK);
 * aqui o módulo Firebase é mockado.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, ModuleBalances, RecurringTask, Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

// ─── Mocks comuns ─────────────────────────────────────────────────────────────

vi.mock('../shared/api/firebase', () => ({
  FIREBASE_ENABLED: false,
  app: {},
  auth: {},
  db: {},
  functions: {},
}));

const mockSetCurrentPage = vi.fn();
vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({ currentMonth: 5, currentYear: 2026, setCurrentPage: mockSetCurrentPage }),
}));

vi.mock('../contexts/PrivacyContext', () => ({
  usePrivacy: () => ({ isPrivacyMode: false }),
}));

vi.mock('react-countup', () => ({
  default: ({ end, prefix = '', suffix = '' }: { end: number; prefix?: string; suffix?: string }) => (
    <span>{prefix}{end}{suffix}</span>
  ),
}));

// Worker Monte Carlo determinístico: responde a cada postMessage com um resultado fixo.
const workerPostMessage = vi.fn();
const FAKE_RESULT = {
  success: true,
  probabilidadeSobrevivencia: 87,
  p10Final: 1_111_100,
  p50Final: 2_222_200,
  p90Final: 3_333_300,
  chartData: [
    { month: 0, p10: 100000, p50: 100000, p90: 100000, coneBase: 100000, coneHeight: 0 },
    { month: 1, p10: 90000, p50: 110000, p90: 130000, coneBase: 90000, coneHeight: 40000 },
  ],
};
vi.mock('../features/simulation/workers/monteCarloWorker?worker', () => ({
  default: class FakeMonteCarloWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    postMessage(data: unknown) {
      workerPostMessage(data);
      setTimeout(() => this.onmessage?.({ data: FAKE_RESULT } as MessageEvent), 0);
    }
    terminate() { /* noop */ }
  },
}));

// ─── Mocks do Dashboard ──────────────────────────────────────────────────────

vi.mock('../hooks/useFinancialData', () => ({
  useDashboardData: () => ({
    kpis: [],
    timelineData: [],
    categoryData: [],
    timeRange: '30d',
    setTimeRange: vi.fn(),
    loading: false,
  }),
}));

// Mesmo cenário do QA: Monte Carlo do dashboard com 52% de risco de ficar negativo.
vi.mock('../hooks/useForecast', () => ({
  useForecast: () => ({
    survivalRate: 48,
    ruinProbability: 52,
    riskLevel: 'critical',
    insight: '',
    mcLoading: false,
  }),
}));

vi.mock('../hooks/useFinancialMetrics', () => ({
  useFinancialMetrics: () => ({ metrics: null, loadingMetrics: false }),
}));

vi.mock('../hooks/useBudgets', () => ({
  useBudgets: () => ({ budgets: [], insights: [], loading: false }),
  currentMonthStr: vi.fn(() => '2026-05'),
}));

vi.mock('../hooks/useScoreHistory', () => ({ useScoreHistory: () => ({ history: [] }) }));
vi.mock('../hooks/useQuantumCopilot', () => ({ useQuantumCopilot: () => ({ insights: [] }) }));
vi.mock('../hooks/useAgentAction', () => ({
  useAgentAction: () => ({ status: 'idle', error: null, runAction: vi.fn(), reset: vi.fn() }),
}));

// Stub que expõe o % de risco recebido, para provar que ele não aparece sem dados.
vi.mock('../components/ProactiveBriefing', () => ({
  default: ({ monteCarloData }: { monteCarloData?: { ruinProbability: number } }) => (
    <div data-testid="proactive-briefing">Risco de ficar negativo: {monteCarloData?.ruinProbability}%</div>
  ),
}));
vi.mock('../components/ForecastWidget', () => ({ default: () => <div data-testid="forecast-widget" /> }));
vi.mock('../components/SurvivalHeatmap', () => ({ default: () => <div data-testid="survival-heatmap" /> }));
vi.mock('../components/WealthKPIs', () => ({ default: () => <div data-testid="wealth-kpis" /> }));
vi.mock('../components/DashboardCharts', () => ({ default: () => <div data-testid="dashboard-charts" /> }));
vi.mock('../components/BudgetWidget', () => ({ default: () => <div data-testid="budget-widget" /> }));
vi.mock('../components/SparkLine', () => ({ SparkLine: () => <div data-testid="spark-line" /> }));
vi.mock('../components/KPICards', () => ({ default: () => <div data-testid="kpi-cards" /> }));
vi.mock('../components/QuantumInsights', () => ({ default: () => <div data-testid="quantum-insights" /> }));
vi.mock('../components/TimelineWidget', () => ({ default: () => <div data-testid="timeline-widget" /> }));
vi.mock('../components/GoalsPanel', () => ({ default: () => <div data-testid="goals-panel" /> }));
vi.mock('../components/EconomyChallengeWidget', () => ({ default: () => <div data-testid="economy-challenge" /> }));
vi.mock('../components/FinancialHealthScore', () => ({ default: () => <div data-testid="financial-health-score" /> }));
vi.mock('../components/OneTouchActionsCard', () => ({ default: () => <div data-testid="one-touch" /> }));
vi.mock('../components/dashboard/DailyBriefingCard', () => ({ DailyBriefingCard: () => <div data-testid="daily-briefing" /> }));
vi.mock('../components/dashboard/ScoreHeroCard', () => ({ ScoreHeroCard: () => <div data-testid="score-hero-card" /> }));
vi.mock('../components/dashboard/PatrimonioHeroCard', () => ({ PatrimonioHeroCard: () => <div data-testid="patrimonio-hero" /> }));
vi.mock('../components/WeeklyCashflowWidget', () => ({ default: () => <div data-testid="weekly-cashflow" /> }));
vi.mock('../components/AnomalyAlerts', () => ({ default: () => <div data-testid="anomaly-alerts" /> }));

import GemeloFinanceiro from '../features/simulation/GemeloFinanceiro';
import SimulationCenter from '../features/simulation/SimulationCenter';
import DashboardContent from '../components/DashboardContent';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const cents = (value: number): Centavos => value as Centavos;

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-1',
    description: 'Movimentação',
    value_cents: cents(10000),
    schemaVersion: 2,
    type: 'saida',
    category: 'Alimentação',
    date: '2026-05-10',
    ...overrides,
  } as Transaction;
}

const historyTransactions: Transaction[] = [
  tx({ id: 'in-1', type: 'entrada', category: 'Salário', value_cents: cents(400000), date: '2026-04-05' }),
  tx({ id: 'out-1', type: 'saida', value_cents: cents(150000), date: '2026-04-12' }),
  tx({ id: 'in-2', type: 'entrada', category: 'Salário', value_cents: cents(400000), date: '2026-05-05' }),
  tx({ id: 'out-2', type: 'saida', value_cents: cents(180000), date: '2026-05-12' }),
];

const EXAMPLE_VALUES = /R\$\s?5\.000|R\$\s?3\.000|R\$\s?1\.200|R\$\s?13\.749/;

const emptyBalances = { geral: { saldo: 0, receitas: 0, despesas: 0, patrimonio: 0, dividas: 0 } } as unknown as ModuleBalances;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Gêmeo Financeiro ────────────────────────────────────────────────────────

describe('GemeloFinanceiro — estado vazio', () => {
  function renderGemelo(transactions: Transaction[], recurringTasks: RecurringTask[] = []) {
    return render(
      <GemeloFinanceiro
        uid="uid-test"
        recurringTasks={recurringTasks}
        debts={[]}
        creditCards={[]}
        transactions={transactions}
        balances={emptyBalances}
      />,
    );
  }

  it('sem transações mostra estado vazio, sem valores de exemplo nem simulação', async () => {
    renderGemelo([]);

    expect(screen.getByText('Dados insuficientes para simular')).toBeInTheDocument();
    expect(screen.getByText(/registre ou importe suas transações para ver seu Gêmeo Financeiro/i)).toBeInTheDocument();
    expect(screen.queryByText('Cone de Incerteza')).not.toBeInTheDocument();
    expect(screen.queryByText('DNA Financeiro')).not.toBeInTheDocument();
    expect(screen.queryByText('Probabilidade de Sobrevivência')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(EXAMPLE_VALUES);

    // Nenhuma simulação é disparada com números inventados.
    await new Promise(r => setTimeout(r, 450));
    expect(workerPostMessage).not.toHaveBeenCalled();
  });

  it('CTA leva para Movimentações', () => {
    renderGemelo([]);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para Movimentações' }));
    expect(mockSetCurrentPage).toHaveBeenCalledWith('history');
  });

  it('sem transações mas com salário recorrente simula a partir dos compromissos reais', async () => {
    const salario = {
      id: 'rec-salario',
      description: 'Salário',
      value: 0,
      value_cents: cents(500000),
      category: 'Salário',
      dueDay: 5,
      active: true,
      type: 'entrada',
      frequency: 'mensal',
    } as RecurringTask;

    renderGemelo([], [salario]);

    expect(screen.queryByText('Dados insuficientes para simular')).not.toBeInTheDocument();
    expect(screen.getByText('DNA Financeiro')).toBeInTheDocument();
    expect(screen.getByText('Cone de Incerteza')).toBeInTheDocument();
    await waitFor(() => expect(workerPostMessage).toHaveBeenCalledTimes(1));
    // Receita vem do recorrente (R$ 5.000 real), não de histórico nem de exemplo.
    expect(workerPostMessage.mock.calls[0]![0]).toMatchObject({ receitaMensalCents: 500000, despesaFixaCents: 0 });
    expect(await screen.findByText(/R\$\s?22\.222/)).toBeInTheDocument();
  });

  it('dados removidos depois de simular voltam ao estado vazio sem nova execução', async () => {
    const view = renderGemelo(historyTransactions);
    await waitFor(() => expect(workerPostMessage).toHaveBeenCalledTimes(1));
    await screen.findByText(/R\$\s?22\.222/);

    view.rerender(
      <GemeloFinanceiro uid="uid-test" recurringTasks={[]} debts={[]} creditCards={[]} transactions={[]} balances={emptyBalances} />,
    );

    expect(screen.getByText('Dados insuficientes para simular')).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s?22\.222/)).not.toBeInTheDocument();
    await new Promise(r => setTimeout(r, 450));
    expect(workerPostMessage).toHaveBeenCalledTimes(1);
  });

  it('com histórico renderiza DNA, estatísticas e gráfico', async () => {
    renderGemelo(historyTransactions);

    expect(screen.queryByText('Dados insuficientes para simular')).not.toBeInTheDocument();
    expect(screen.getByText('DNA Financeiro')).toBeInTheDocument();
    expect(screen.getByText('Cone de Incerteza')).toBeInTheDocument();
    expect(screen.getByText('Probabilidade de Sobrevivência')).toBeInTheDocument();

    await waitFor(() => expect(workerPostMessage).toHaveBeenCalledTimes(1));
    // P50 vindo do worker (2.222.200 centavos = R$ 22.222).
    expect(await screen.findByText(/R\$\s?22\.222/)).toBeInTheDocument();
  });
});

// ─── Simulação Monte Carlo ───────────────────────────────────────────────────

describe('SimulationCenter — estado vazio', () => {
  it('sem transações mostra estado vazio, sem valores de exemplo nem P50', async () => {
    render(<SimulationCenter transactions={[]} balances={emptyBalances} />);

    expect(screen.getByText('Dados insuficientes para simular')).toBeInTheDocument();
    expect(screen.queryByText('Base de Cálculo')).not.toBeInTheDocument();
    expect(screen.queryByText('Provável P50')).not.toBeInTheDocument();
    expect(screen.queryByText('Cone de Incerteza')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(EXAMPLE_VALUES);

    await new Promise(r => setTimeout(r, 450));
    expect(workerPostMessage).not.toHaveBeenCalled();
  });

  it('com transações renderiza base de cálculo, KPIs e gráfico', async () => {
    render(<SimulationCenter transactions={historyTransactions} balances={emptyBalances} />);

    expect(screen.queryByText('Dados insuficientes para simular')).not.toBeInTheDocument();
    expect(screen.getByText('Base de Cálculo')).toBeInTheDocument();
    expect(screen.getByText('Receita Mensal Média')).toBeInTheDocument();
    expect(screen.getByText('Cone de Incerteza')).toBeInTheDocument();
    // Receita média real: (4.000 + 4.000) / 2 = R$ 4.000.
    expect(screen.getByText(/R\$\s?4\.000/)).toBeInTheDocument();

    await waitFor(() => expect(workerPostMessage).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/R\$\s?22\.222/)).toBeInTheDocument();
  });
});

describe('SimulationCenter — buckets de mês', () => {
  it('ignora datas inválidas e meses futuros nas médias', async () => {
    const noise: Transaction[] = [
      // Parcela/receita futura: antes inflava a média de receita.
      tx({ id: 'future', type: 'entrada', category: 'Salário', value_cents: cents(9_000_000), date: '2099-01-05' }),
      // Data inválida: antes virava um bucket "NaN-NaN" que diluía as médias.
      tx({ id: 'invalid', type: 'saida', value_cents: cents(70000), date: 'not-a-date' }),
    ];

    render(<SimulationCenter transactions={[...historyTransactions, ...noise]} balances={emptyBalances} />);

    await waitFor(() => expect(workerPostMessage).toHaveBeenCalledTimes(1));
    // Só abril e maio contam: receita média = (4.000 + 4.000) / 2 = R$ 4.000.
    expect(workerPostMessage.mock.calls[0]![0]).toMatchObject({ receitaMensalCents: 400000 });
    expect(screen.getByText(/R\$\s?4\.000/)).toBeInTheDocument();
  });

  it('usa a média real, sem pisos artificiais de receita/despesa', async () => {
    const small: Transaction[] = [
      tx({ id: 's-in', type: 'entrada', category: 'Salário', value_cents: cents(30000), date: '2026-05-05' }),
      tx({ id: 's-out', type: 'saida', value_cents: cents(5000), date: '2026-05-10' }),
    ];

    render(<SimulationCenter transactions={small} balances={emptyBalances} />);

    await waitFor(() => expect(workerPostMessage).toHaveBeenCalledTimes(1));
    // Antes: receita forçada a R$ 1.000 e despesa a R$ 500.
    expect(workerPostMessage.mock.calls[0]![0]).toMatchObject({
      receitaMensalCents: 30000,
      despesaFixaCents:   Math.round(5000 * 0.65),
    });
  });
});

// ─── Dashboard "Hoje" ────────────────────────────────────────────────────────

describe('DashboardContent — conta sem dados', () => {
  function renderDashboard({ accounts = [], transactions = [], loading = false }: { accounts?: Account[]; transactions?: Transaction[]; loading?: boolean }) {
    return render(
      <DashboardContent
        user={{ uid: 'uid-test' }}
        transactions={transactions}
        allTransactions={transactions}
        loading={loading}
        moduleBalances={emptyBalances}
        monthlyGoal={20}
        setMonthlyGoal={vi.fn()}
        onSaveTransaction={vi.fn().mockResolvedValue(undefined)}
        setIsFormOpen={vi.fn()}
        isFormOpen={false}
        transactionToEdit={null}
        setTransactionToEdit={vi.fn()}
        accounts={accounts}
        recurringTasks={[]}
        categories={[]}
        creditCards={[]}
        totalFaturaCents={cents(0)}
      />,
    );
  }

  it('sem contas e sem transações: sem modo crise, sem % de risco, sem meta atrasada e score neutro', async () => {
    renderDashboard({});

    fireEvent.click(screen.getByRole('button', { name: 'Expandir Saúde Financeira' }));

    expect(screen.queryByText('Atenção: limite crítico')).not.toBeInTheDocument();
    expect(screen.queryByText('Saldo comprometido')).not.toBeInTheDocument();
    expect(screen.queryByTestId('proactive-briefing')).not.toBeInTheDocument();
    expect(screen.queryByText(/52%/)).not.toBeInTheDocument();
    expect(screen.queryByText('Meta Atrasada')).not.toBeInTheDocument();
    expect(screen.queryByText('Poupança Crítica')).not.toBeInTheDocument();
    expect(screen.queryByTestId('score-hero-card')).not.toBeInTheDocument();
    expect(screen.queryByText('CRÍTICO')).not.toBeInTheDocument();

    expect(screen.getByLabelText('Score de saúde financeira: sem dados ainda')).toHaveTextContent('—');
    expect(await screen.findByText('Sem dados ainda')).toBeInTheDocument();
  });

  it('enquanto o primeiro snapshot carrega: nem estado neutro nem alertas', () => {
    renderDashboard({ loading: true });

    fireEvent.click(screen.getByRole('button', { name: 'Expandir Saúde Financeira' }));

    expect(screen.queryByText('Sem dados ainda')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sem dados ainda/)).not.toBeInTheDocument();
    expect(screen.queryByText('Atenção: limite crítico')).not.toBeInTheDocument();
    expect(screen.queryByTestId('proactive-briefing')).not.toBeInTheDocument();
    expect(screen.queryByText('Meta Atrasada')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Score de saúde financeira: carregando')).toBeInTheDocument();
  });

  it('com dados (conta existente) mantém os alertas reais', async () => {
    const account = { id: 'acc-1', name: 'Conta', type: 'corrente' } as unknown as Account;
    renderDashboard({ accounts: [account] });

    // Saldo 0 → disponível ≤ 0 → zona danger: o modo crise é legítimo aqui.
    expect(screen.getByText('Atenção: limite crítico')).toBeInTheDocument();
    expect(screen.queryByLabelText('Score de saúde financeira: sem dados ainda')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expandir Saúde Financeira' }));
    expect(await screen.findByTestId('proactive-briefing')).toHaveTextContent('52%');
    expect(screen.getByText('Meta Atrasada')).toBeInTheDocument();
    expect(screen.getByTestId('score-hero-card')).toBeInTheDocument();
  });
});
