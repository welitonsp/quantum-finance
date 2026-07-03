// src/features/reports/ReportsContent.tsx
import { useState, useMemo } from 'react';
import { ComposedChart, BarChart, Bar, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Filter, AlertCircle, Calendar, Scissors, AlertTriangle, TrendingUp, BarChart3 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import type { Transaction, Account } from '../../shared/types/transaction';
import { getTransactionAbsCentavos, isExpense, isInvoicePayment } from '../../utils/transactionUtils';
import { fromCentavos } from '../../shared/types/money';
import { calcPareto, calcPatrimonyEvolution } from '../../utils/reportEngine';
import { normalizeCategoryName, type UserCategory } from '../../shared/schemas/categorySchemas';
import { TopTabs, ContextualAIButton, EmptyState } from '../../shared/components/ui';

interface Props {
  transactions: Transaction[];
  accounts?:    Account[];
  categories?:  UserCategory[];
}

interface ParetoItem {
  name:          string;
  valor:         number;
  pctIndividual: number;
  pctAcumulada:  number;
  isTop80:       boolean;
  rank:          number;
  color:         string;
}

type TimeFilter    = '30d' | '90d' | '180d' | 'all';
type ExpenseFilter = 'all' | 'variables';

const LOW_CUTTABLE_DEFAULT_CATEGORIES = new Set([
  'moradia',
  'assinaturas',
  'educacao',
  'impostos/taxas',
  'saude',
]);

const PARETO_FALLBACK_COLORS = ['#3B82F6', '#06B6D4', '#8B5CF6', '#F59E0B', '#10B981', '#F43F5E'];

function getCategoryColor(category: string, categories: UserCategory[], index: number): string {
  const normalizedName = normalizeCategoryName(category);
  return categories.find(item => item.normalizedName === normalizedName)?.color
    ?? PARETO_FALLBACK_COLORS[index % PARETO_FALLBACK_COLORS.length]
    ?? PARETO_FALLBACK_COLORS[0]!;
}

function isLowCuttableCategory(category: string | undefined, categories: UserCategory[]): boolean {
  if (!category) return false;
  const normalizedName = normalizeCategoryName(category);
  const catalogCategory = categories.find(item => item.normalizedName === normalizedName);
  if (catalogCategory && catalogCategory.type === 'entrada') return true;
  return LOW_CUTTABLE_DEFAULT_CATEGORIES.has(normalizedName);
}

export default function ReportsContent({ transactions, accounts, categories = [] }: Props) {
  const [activeTab,      setActiveTab]      = useState<'pareto' | 'tendencias'>('pareto');
  const [timeFilter,     setTimeFilter]     = useState<TimeFilter>('30d');
  const [expenseFilter,  setExpenseFilter]  = useState<ExpenseFilter>('all');

  const paretoData = useMemo<ParetoItem[]>(() => {
    if (!transactions || transactions.length === 0) return [];

    const catTotalsCents: Record<string, number> = {};
    let grandTotalCents = 0;
    const agora = new Date();

    transactions.forEach(t => {
      if (isExpense(t.type) && !isInvoicePayment(t)) {
        const txDate = new Date(t.date ?? (t as Transaction & { createdAt?: string }).createdAt ?? '');
        const diffDias = (agora.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);

        // Transação sem data válida produz `diffDias = NaN`. Como `NaN > limite` é
        // sempre `false`, ela escaparia silenciosamente dos filtros temporais e
        // poluiria os relatórios de 30/90/180 dias. Descarta explicitamente nas
        // janelas datadas; em 'all' (sem recorte temporal) ela permanece.
        if (timeFilter !== 'all' && Number.isNaN(diffDias)) return;

        if (timeFilter === '30d'  && diffDias > 30)  return;
        if (timeFilter === '90d'  && diffDias > 90)  return;
        if (timeFilter === '180d' && diffDias > 180) return;

        const cat = t.category ?? 'Diversos';
        if (expenseFilter === 'variables' && isLowCuttableCategory(cat, categories)) return;

        const cents = getTransactionAbsCentavos(t);
        catTotalsCents[cat] = (catTotalsCents[cat] ?? 0) + cents;
        grandTotalCents += cents;
      }
    });

    const sorted = Object.entries(catTotalsCents).sort((a, b) => b[1] - a[1]);
    let acumuladoCents = 0;

    return sorted.map(([name, cents], index) => {
      acumuladoCents += cents;
      return {
        name,
        valor:         fromCentavos(cents),
        pctIndividual: grandTotalCents > 0 ? Number(((cents / grandTotalCents) * 100).toFixed(1)) : 0,
        pctAcumulada:  grandTotalCents > 0 ? Number(((acumuladoCents / grandTotalCents) * 100).toFixed(1)) : 0,
        isTop80:       grandTotalCents > 0 && ((acumuladoCents / grandTotalCents) * 100) <= 80.1,
        rank:          index + 1,
        color:         getCategoryColor(name, categories, index),
      };
    });
  }, [categories, transactions, timeFilter, expenseFilter]);

  const topCategoriesCount = paretoData.filter(d => d.isTop80).length;
  const top80Value = paretoData.filter(d => d.isTop80).reduce((sum, item) => sum + item.valor, 0);

  const aiInsights = useMemo<string[]>(() => {
    if (paretoData.length === 0) return [];
    const topCategory = paretoData[0]!;
    return [
      `Os seus ${topCategoriesCount} maiores ralos representam ${formatCurrency(top80Value)} dos gastos neste período.`,
      `A categoria "${topCategory.name}" sozinha consome ${topCategory.pctIndividual}% do seu dinheiro.`,
      `Foco Tático: Reduzir 20% em "${topCategory.name}" gera uma economia de ${formatCurrency(topCategory.valor * 0.2)}.`,
    ];
  }, [paretoData, topCategoriesCount, top80Value]);

  const reportParetoData = useMemo(() => calcPareto(transactions), [transactions]);
  const patrimonyData    = useMemo(
    () => calcPatrimonyEvolution(transactions, accounts ?? [], new Date()),
    [transactions, accounts],
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 relative z-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-quantum-fg tracking-tight">Business Intelligence</h2>
          <p className="text-xs text-quantum-fgMuted mt-1">Análises profundas para otimização de património.</p>
        </div>
      </div>

      <TopTabs
        ariaLabel="Análises"
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as 'pareto' | 'tendencias')}
        tabs={[
          { id: 'pareto',     label: 'Análise Pareto (80/20)' },
          { id: 'tendencias', label: 'Tendências' },
        ]}
      />

      {activeTab === 'pareto' && (
        <div role="tabpanel" id="tabpanel-pareto" aria-labelledby="tab-pareto" className="space-y-6 animate-in slide-in-from-bottom-4">
          <div className="bg-quantum-card border border-quantum-border rounded-3xl p-6 shadow-lg relative overflow-hidden">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-quantum-accent/10 rounded-2xl"><Filter className="w-6 h-6 text-quantum-accent" /></div>
                <div>
                  <h3 className="text-lg font-bold text-quantum-fg">Regra 80/20 (Princípio de Pareto)</h3>
                  <p className="text-sm text-quantum-fgMuted mt-1 max-w-lg">Identifique os ralos de dinheiro com precisão matemática.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-quantum-card/50 p-2 rounded-2xl border border-quantum-border">
                <div className="flex items-center gap-1 bg-quantum-bg/50 p-1 rounded-xl border border-quantum-border">
                  <Calendar className="w-4 h-4 text-quantum-fgMuted ml-2" />
                  <select value={timeFilter} onChange={e => setTimeFilter(e.target.value as TimeFilter)} className="bg-transparent text-xs font-bold text-quantum-fg px-2 py-1.5 focus:outline-none cursor-pointer">
                    <option value="30d">Últimos 30 Dias</option>
                    <option value="90d">Últimos 3 Meses</option>
                    <option value="180d">Últimos 6 Meses</option>
                    <option value="all">Todo o Histórico</option>
                  </select>
                </div>
                <div className="flex items-center gap-1 bg-quantum-bg/50 p-1 rounded-xl border border-quantum-border">
                  <Scissors className="w-4 h-4 text-quantum-fgMuted ml-2" />
                  <select value={expenseFilter} onChange={e => setExpenseFilter(e.target.value as ExpenseFilter)} className="bg-transparent text-xs font-bold text-quantum-fg px-2 py-1.5 focus:outline-none cursor-pointer">
                    <option value="all">Todas as Despesas</option>
                    <option value="variables">Apenas Variáveis (Cortáveis)</option>
                  </select>
                </div>
              </div>
            </div>

            {paretoData.length > 0 ? (
              <>
                <div className="flex justify-end mb-4">
                  <ContextualAIButton label="Ver Dicas da IA" title="Recomendações Quânticas da IA" variant="solid">
                    <ul className="space-y-3 text-sm text-quantum-fg">
                      {aiInsights.map((insight, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="text-violet-400 mt-0.5">•</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </ContextualAIButton>
                </div>

                <div className="h-[400px] w-full mb-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={paretoData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3F" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                      <YAxis yAxisId="left"  stroke="#64748B" fontSize={10} tickFormatter={(val: number) => `R$ ${val >= 1000 ? (val/1000).toFixed(1)+'k' : val}`} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" stroke="#F59E0B" fontSize={10} tickFormatter={(val: number) => `${val}%`} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#131A2A', borderColor: '#1E2A3F', borderRadius: '12px', color: '#fff' }}
                        formatter={(value, name) => {
                          const v = Number(value ?? 0);
                          if (name === 'valor')        return [formatCurrency(v), 'Gasto Bruto'];
                          if (name === 'pctAcumulada') return [`${v}%`, 'Acumulado'];
                          return [String(value ?? ''), String(name ?? '')];
                        }}
                      />
                      <Bar yAxisId="left" dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={60}>
                        {paretoData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.isTop80 ? '#EF4444' : entry.color} fillOpacity={entry.isTop80 ? 0.8 : 0.55} />)}
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="pctAcumulada" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4, fill: '#131A2A', stroke: '#F59E0B', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#F59E0B' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-quantum-fg mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    TOP RALOS FINANCEIROS ({topCategoriesCount} categorias = {formatCurrency(top80Value)})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {paretoData.filter(d => d.isTop80).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-quantum-card/50 p-4 rounded-xl border border-red-500/20 hover:border-red-500/40 transition-colors">
                        <div>
                          <span className="font-bold text-quantum-fg text-sm">#{item.rank} {item.name}</span>
                          <p className="text-xs text-red-400 mt-0.5">{item.pctAcumulada}% acumulado</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-quantum-fg text-sm">{formatCurrency(item.valor)}</p>
                          <p className="text-xs text-quantum-fgMuted mt-0.5">{item.pctIndividual}% do total</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="border-2 border-dashed border-quantum-border rounded-2xl">
                <EmptyState
                  icon={AlertCircle}
                  title="Sem dados para este filtro"
                  description="Tente alargar o período ou mudar o tipo de despesa."
                />
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'tendencias' && (
        <div role="tabpanel" id="tabpanel-tendencias" aria-labelledby="tab-tendencias" className="space-y-6 animate-in slide-in-from-bottom-4">
          <div className="bg-quantum-card p-5 rounded-2xl border border-quantum-border">
            <h3 className="text-sm font-bold uppercase tracking-wider text-quantum-fgMuted mb-4">
              Evolução Patrimonial (6 meses)
            </h3>
            {patrimonyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={patrimonyData}>
                  <XAxis dataKey="monthLabel" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `R$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} />
                  <Tooltip contentStyle={{ backgroundColor: '#131A2A', borderColor: '#1E2A3F', borderRadius: '12px', color: '#fff' }} />
                  <Area type="monotone" dataKey="patrimonio" stroke="#6366F1" fill="#6366F1" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center">
                <EmptyState icon={TrendingUp} title="Sem histórico patrimonial suficiente." />
              </div>
            )}
          </div>

          <div className="bg-quantum-card p-5 rounded-2xl border border-quantum-border">
            <h3 className="text-sm font-bold uppercase tracking-wider text-quantum-fgMuted mb-4">
              Pareto 80/20 — Despesas
            </h3>
            {reportParetoData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={reportParetoData}>
                  <XAxis dataKey="category" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#131A2A', borderColor: '#1E2A3F', borderRadius: '12px', color: '#fff' }} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={60}
                    fill="#EF4444" fillOpacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center">
                <EmptyState icon={BarChart3} title="Sem despesas para gerar o Pareto." />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
