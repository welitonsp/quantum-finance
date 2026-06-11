import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction, ModuleBalances } from '../shared/types/transaction';
import type { Budget } from '../hooks/useBudgets';
import type { Centavos } from '../shared/types/money';

const mockUseBudgets = vi.fn();

vi.mock('react-countup', () => ({
  default: ({ end, prefix = '' }: { end: number; prefix?: string }) => <span>{prefix}{end}</span>,
}));

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({ currentMonth: 5, currentYear: 2026 }),
}));

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

vi.mock('../hooks/useForecast', () => ({
  useForecast: () => ({
    survivalRate: 100,
    ruinProbability: 0,
    riskLevel: 'low',
    insight: '',
    mcLoading: false,
  }),
}));

vi.mock('../hooks/useFinancialMetrics', () => ({
  useFinancialMetrics: () => ({ metrics: null, loadingMetrics: false }),
}));

vi.mock('../hooks/useBudgets', () => ({
  useBudgets: (...args: unknown[]) => mockUseBudgets(...args),
  currentMonthStr: vi.fn(() => '2026-05'),
}));

vi.mock('./ForecastWidget', () => ({ default: () => <div data-testid="forecast-widget" /> }));
vi.mock('./ProactiveBriefing', () => ({ default: () => <div data-testid="proactive-briefing" /> }));
vi.mock('./SurvivalHeatmap', () => ({ default: () => <div data-testid="survival-heatmap" /> }));
vi.mock('./WealthKPIs', () => ({ default: () => <div data-testid="wealth-kpis" /> }));
vi.mock('./DashboardCharts', () => ({ default: () => <div data-testid="dashboard-charts" /> }));
vi.mock('./BudgetWidget', () => ({ default: () => <div data-testid="budget-widget" /> }));
vi.mock('./HealthGauge', () => ({ HealthGauge: () => <div data-testid="health-gauge" /> }));
vi.mock('./SparkLine', () => ({ SparkLine: () => <div data-testid="spark-line" /> }));
vi.mock('./IntelStrip', () => ({ IntelStrip: () => <div data-testid="intel-strip" /> }));
vi.mock('./KPICards', () => ({ default: () => <div data-testid="kpi-cards" /> }));
vi.mock('./QuantumInsights', () => ({ default: () => <div data-testid="quantum-insights" /> }));
vi.mock('./TimelineWidget', () => ({ default: () => <div data-testid="timeline-widget" /> }));

import DashboardContent from './DashboardContent';

const cents = (value: number): Centavos => value as Centavos;

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id:            'tx-dashboard',
    description:   'Movimentacao',
    value_cents:   cents(0),
    schemaVersion: 2,
    type:          'saida',
    category:      'Outros',
    date:          '2026-05-01',
    ...overrides,
  } as Transaction;
}

function budget(overrides: Partial<Budget>): Budget {
  return {
    id:                'budget-dashboard',
    category:          'Alimentação',
    targetAmount:      100,
    targetAmountCents: cents(10000),
    period:            'monthly',
    month:             '2026-05',
    createdAt:         1,
    ...overrides,
  };
}

function renderDashboard(transactions: Transaction[] = []) {
  const moduleBalances: ModuleBalances = {
    geral: {
      saldo: 1000,
      receitas: 2000,
      despesas: 1000,
      patrimonio: 1000,
      dividas: 0,
    },
  } as ModuleBalances;

  return render(
    <DashboardContent
      user={{ uid: 'uid-dashboard' }}
      transactions={transactions}
      allTransactions={transactions}
      loading={false}
      moduleBalances={moduleBalances}
      monthlyGoal={20}
      setMonthlyGoal={vi.fn()}
      onSaveTransaction={vi.fn().mockResolvedValue(undefined)}
      setIsFormOpen={vi.fn()}
      isFormOpen={false}
      transactionToEdit={null}
      setTransactionToEdit={vi.fn()}
      accounts={[]}
      recurringTasks={[]}
      categories={[]}
    />,
  );
}

describe('DashboardContent budget alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBudgets.mockReturnValue({
      budgets: [],
      insights: [],
      loading: false,
      addBudget: vi.fn(),
      removeBudget: vi.fn(),
      updateBudget: vi.fn(),
    });
  });

  it('renderiza estado vazio de alertas sem quebrar', () => {
    renderDashboard();

    expect(screen.getByText('Alertas de orçamento')).toBeInTheDocument();
    expect(screen.getByText('Nenhum orçamento cadastrado.')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/NaN|Infinity/);
  });

  it('renderiza budget em atencao no Dashboard', () => {
    mockUseBudgets.mockReturnValue({
      budgets: [budget({})],
      insights: [],
      loading: false,
      addBudget: vi.fn(),
      removeBudget: vi.fn(),
      updateBudget: vi.fn(),
    });

    renderDashboard([
      transaction({ category: 'Alimentação', value_cents: cents(8500), date: '2026-05-10' }),
    ]);

    expect(screen.getByText('Alimentação')).toBeInTheDocument();
    expect(screen.getByText('Atenção')).toBeInTheDocument();
    expect(screen.getByText(/85%/)).toBeInTheDocument();
  });
});
