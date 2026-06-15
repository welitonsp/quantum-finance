import { useMemo } from 'react';
import { BrainCircuit, Cpu, ShieldAlert, ArrowUpRight } from 'lucide-react';
import { useNavigation } from '../../contexts/NavigationContext';
import { useTransactions } from '../../hooks/useTransactions';
import { useInsightsEngine } from '../../hooks/useInsightsEngine';
import { CopilotInsightCard, LoadingPage, EmptyState } from '../../shared/components/ui';
import type { CopilotInsightData } from '../../shared/components/ui';
import { formatBRL } from '../../shared/types/money';
import toast from 'react-hot-toast';

interface Props {
  uid: string;
}

export default function CopilotPage({ uid }: Props) {
  const { setCurrentPage } = useNavigation();
  const { transactions, loading } = useTransactions(uid);

  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;

  const { suggestions, anomalies, trend } = useInsightsEngine(transactions, year, month);

  const insights = useMemo<CopilotInsightData[]>(() => {
    const list: CopilotInsightData[] = [];

    // Tendência de gasto
    if (trend) {
      const isUp   = trend.type === 'spending_up';
      const isDown = trend.type === 'spending_down';
      if (isUp || isDown) {
        list.push({
          type:        isUp ? 'recomendacao' : 'insight',
          confidence:  Math.abs(trend.ratio) > 0.3 ? 'alta' : 'media',
          dataSources: ['Transações do mês atual', 'Transações do mês anterior'],
          title:       isUp ? 'Aumento nos gastos detectado' : 'Redução nos gastos detectada',
          description: isUp
            ? `Seus gastos este mês (${formatBRL(trend.currentCents)}) estão ${(trend.ratio * 100).toFixed(0)}% acima do mês anterior (${formatBRL(trend.previousCents)}). Revise as categorias mais impactadas.`
            : `Seus gastos este mês (${formatBRL(trend.currentCents)}) estão ${(Math.abs(trend.ratio) * 100).toFixed(0)}% abaixo do mês anterior. Bom trabalho!`,
        });
      }
    }

    // Anomalias por transação
    for (const anomaly of anomalies.slice(0, 3)) {
      list.push({
        type:        'recomendacao',
        confidence:  anomaly.multiplier >= 3 ? 'alta' : 'media',
        dataSources: [`Categoria: ${anomaly.category}`, 'Histórico dos últimos 3 meses'],
        title:       `Gasto atípico em ${anomaly.category}`,
        description: `Transação "${anomaly.description}" (${formatBRL(anomaly.valueCents)}) é ${anomaly.multiplier.toFixed(1)}× acima da média desta categoria. Verifique se é esperado.`,
      });
    }

    // Sugestões de alta prioridade
    for (const sug of suggestions.filter(s => s.priority === 'high').slice(0, 2)) {
      list.push({
        type:        'acao',
        confidence:  'alta',
        dataSources: ['Análise de gastos mensais', 'Comparativo com meses anteriores'],
        title:       'Ação recomendada',
        description: sug.message,
        action: {
          label:     'Revisar no Planejamento',
          onConfirm: () => { setCurrentPage('planning'); toast.success('Abrindo Planejamento...'); },
        },
      });
    }

    // Sugestões de média prioridade
    for (const sug of suggestions.filter(s => s.priority === 'medium').slice(0, 2)) {
      list.push({
        type:        'recomendacao',
        confidence:  'media',
        dataSources: ['Análise de gastos mensais'],
        title:       'Sugestão financeira',
        description: sug.message,
      });
    }

    return list;
  }, [suggestions, anomalies, trend, setCurrentPage]);

  if (loading) return <LoadingPage label="Carregando Copilot..." />;

  const quickLinks = [
    { id: 'quantum',     icon: Cpu,         label: 'Quantum AI',        desc: 'Auditoria automática e relatório CFO com Gemini'  },
    { id: 'anti-tarifa', icon: ShieldAlert, label: 'Agente Anti-Tarifa', desc: 'Detectar cobranças ocultas e tarifas recorrentes' },
  ] as const;

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-quantum-accent/10 border border-quantum-accent/25 flex items-center justify-center">
          <BrainCircuit className="w-5 h-5 text-quantum-accent" />
        </div>
        <div>
          <h1 className="text-xl font-black text-quantum-fg">Copilot IA</h1>
          <p className="text-xs text-quantum-fgMuted">Insights locais com fonte declarada, confiança e confirmação humana</p>
        </div>
      </div>

      {/* Insights locais */}
      <section aria-labelledby="insights-heading">
        <p id="insights-heading" className="text-[10px] text-quantum-fgMuted uppercase tracking-wider font-bold mb-4">
          Insights do mês atual — {insights.length} item{insights.length !== 1 ? 's' : ''}
        </p>
        {insights.length === 0 ? (
          <EmptyState
            icon={BrainCircuit}
            title="Sem insights disponíveis"
            description="Adicione transações para que o Copilot analise seus padrões financeiros."
          />
        ) : (
          <div className="space-y-3">
            {insights.map((item, i) => (
              <CopilotInsightCard key={i} {...item} />
            ))}
          </div>
        )}
      </section>

      {/* Agentes IA */}
      <section aria-labelledby="agents-heading">
        <p id="agents-heading" className="text-[10px] text-quantum-fgMuted uppercase tracking-wider font-bold mb-4">
          Agentes IA
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {quickLinks.map(({ id, icon: Icon, label, desc }) => (
            <button
              key={id}
              onClick={() => setCurrentPage(id)}
              className="text-left flex items-start gap-4 p-5 rounded-2xl border border-quantum-border bg-quantum-card/40 hover:brightness-110 transition-all group"
              aria-label={`Ir para ${label}`}
            >
              <div className="p-3 rounded-xl bg-quantum-accent/10 text-quantum-accent shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-quantum-fg group-hover:text-white transition-colors">{label}</p>
                <p className="text-xs text-quantum-fgMuted mt-1">{desc}</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-quantum-fgMuted group-hover:text-white transition-colors shrink-0 mt-1" />
            </button>
          ))}
        </div>
      </section>

      {/* Nota de auditabilidade */}
      <div className="text-[10px] text-quantum-fgMuted border border-quantum-border/30 rounded-xl p-3 leading-relaxed">
        <span className="font-bold text-quantum-fgMuted">Política IA:</span> todos os insights acima são calculados localmente, sem envio de dados financeiros para terceiros. Ações requerem confirmação humana explícita. Dados utilizados são declarados em cada card.
      </div>
    </div>
  );
}
