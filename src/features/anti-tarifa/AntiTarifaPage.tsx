import { useMemo, useState } from 'react';
import {
  ShieldAlert, ShieldCheck, ShieldQuestion,
  TrendingDown, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { useTransactions } from '../../hooks/useTransactions';
import { detectarTarifas } from '../../lib/antiTarifaEngine';
import { formatBRL } from '../../shared/types/money';
import type { TarifaDetectada, TarifaRisco } from '../../lib/antiTarifaEngine';

interface Props {
  uid: string;
}

export default function AntiTarifaPage({ uid }: Props) {
  const { transactions } = useTransactions(uid);
  const [janela, setJanela] = useState(12);
  const [expandido, setExpandido] = useState<string | null>(null);

  const relatorio = useMemo(
    () => detectarTarifas(transactions, janela),
    [transactions, janela],
  );

  const altoRisco = relatorio.tarifas.filter((t) => t.risco === 'alto');
  const medioRisco = relatorio.tarifas.filter((t) => t.risco === 'medio');
  const baixoRisco = relatorio.tarifas.filter((t) => t.risco === 'baixo');

  return (
    <div className="space-y-6 p-4 max-w-3xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-orange-600" />
          <h1 className="text-xl font-bold text-gray-900">Agente Anti-Tarifa</h1>
        </div>
        <select
          value={janela}
          onChange={(e) => setJanela(Number(e.target.value))}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
          aria-label="Janela de análise"
        >
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
        </select>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-red-500">Alto Risco</p>
          <p className="text-3xl font-bold text-red-700 mt-1">{altoRisco.length}</p>
          <p className="text-xs text-red-400 mt-1">cobranças suspeitas</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Médio Risco</p>
          <p className="text-3xl font-bold text-amber-700 mt-1">{medioRisco.length}</p>
          <p className="text-xs text-amber-400 mt-1">cobranças a monitorar</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-orange-600">Custo Est. Anual</p>
          <p className="text-2xl font-bold text-orange-700 mt-1">
            {formatBRL(relatorio.totalEstimadoAnualCents)}
          </p>
          <p className="text-xs text-orange-400 mt-1">em possíveis tarifas</p>
        </div>
      </div>

      {/* Contexto da análise */}
      <p className="text-xs text-gray-400">
        Analisadas <strong>{relatorio.transacoesAnalisadas}</strong> transações de saída nos últimos{' '}
        <strong>{relatorio.periodoAnalisadoMeses} meses</strong>.
        Cobranças acima de R$ 80,00 ou que aparecem em apenas 1 mês são excluídas automaticamente.
      </p>

      {relatorio.tarifas.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {altoRisco.length > 0 && (
            <GrupoTarifas
              titulo="Tarifas de Alto Risco"
              tarifas={altoRisco}
              risco="alto"
              expandido={expandido}
              setExpandido={setExpandido}
            />
          )}
          {medioRisco.length > 0 && (
            <GrupoTarifas
              titulo="Cobranças Suspeitas"
              tarifas={medioRisco}
              risco="medio"
              expandido={expandido}
              setExpandido={setExpandido}
            />
          )}
          {baixoRisco.length > 0 && (
            <GrupoTarifas
              titulo="Possíveis Cobranças"
              tarifas={baixoRisco}
              risco="baixo"
              expandido={expandido}
              setExpandido={setExpandido}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Sub-componentes
// ──────────────────────────────────────────────

const RISCO_CONFIG: Record<TarifaRisco, {
  icon: typeof ShieldAlert;
  cor: string;
  badge: string;
}> = {
  alto:  { icon: ShieldAlert,    cor: 'text-red-600',    badge: 'bg-red-100 text-red-700'    },
  medio: { icon: ShieldQuestion, cor: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700' },
  baixo: { icon: ShieldCheck,    cor: 'text-blue-500',   badge: 'bg-blue-50 text-blue-600'   },
};

function GrupoTarifas({
  titulo, tarifas, risco, expandido, setExpandido,
}: {
  titulo: string;
  tarifas: TarifaDetectada[];
  risco: TarifaRisco;
  expandido: string | null;
  setExpandido: (id: string | null) => void;
}) {
  const cfg = RISCO_CONFIG[risco];
  const Icon = cfg.icon;

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${cfg.cor}`} />
        <h2 className="text-sm font-semibold text-gray-700">{titulo}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
          {tarifas.length}
        </span>
      </div>
      <div className="space-y-2">
        {tarifas.map((t) => (
          <TarifaCard
            key={t.descricaoNormalizada}
            tarifa={t}
            aberto={expandido === t.descricaoNormalizada}
            onToggle={() =>
              setExpandido(expandido === t.descricaoNormalizada ? null : t.descricaoNormalizada)
            }
          />
        ))}
      </div>
    </section>
  );
}

function TarifaCard({
  tarifa, aberto, onToggle,
}: {
  tarifa: TarifaDetectada;
  aberto: boolean;
  onToggle: () => void;
}) {
  const cfg = RISCO_CONFIG[tarifa.risco];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        onClick={onToggle}
        aria-expanded={aberto}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.badge}`}>
            {tarifa.risco.toUpperCase()}
          </span>
          <span className="text-sm font-medium text-gray-800 truncate">
            {tarifa.descricaoExemplo}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-400">{tarifa.frequencia} meses</p>
            <p className="text-sm font-semibold text-gray-700">
              {formatBRL(tarifa.ultimoValorCents)}<span className="text-xs font-normal text-gray-400">/mês</span>
            </p>
          </div>
          {aberto ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {aberto && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50">
          {/* Linha de valores */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Último valor</p>
              <p className="font-semibold text-gray-800 mt-0.5">{formatBRL(tarifa.ultimoValorCents)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total cobrado</p>
              <p className="font-semibold text-gray-800 mt-0.5">{formatBRL(tarifa.totalCobradoCents)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Projeção anual</p>
              <p className="font-semibold text-orange-600 mt-0.5 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" />
                {formatBRL(tarifa.projecaoAnualCents)}
              </p>
            </div>
          </div>

          {/* Meses de ocorrência */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Aparece em</p>
            <div className="flex flex-wrap gap-1.5">
              {tarifa.meses.map((m) => (
                <span key={m} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-600">
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Razões */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Por que foi detectada</p>
            <ul className="space-y-1">
              {tarifa.razoes.map((r) => (
                <li key={r} className="flex items-start gap-2 text-xs text-gray-600">
                  <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Ação recomendada */}
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
            <strong>O que fazer:</strong> Entre em contato com seu banco e solicite o cancelamento
            desta cobrança ou a transferência para um pacote sem essa tarifa. Muitos bancos cancelam
            quando o cliente solicita explicitamente.
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 text-gray-400">
      <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-30" />
      <p className="font-medium text-gray-500">Nenhuma tarifa suspeita detectada</p>
      <p className="text-sm mt-1">
        Suas transações de saída não apresentam padrão recorrente de cobranças bancárias pequenas.
      </p>
    </div>
  );
}
