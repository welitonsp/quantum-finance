import { useState, useMemo } from 'react';
import {
  FileText, Download, TrendingUp, TrendingDown, Minus,
  AlertCircle, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { useTransactions } from '../../hooks/useTransactions';
import { gerarInformeIR, anosDisponiveis, exportarInformeCSV, classeLabel } from '../../lib/irEngine';
import { formatBRL } from '../../shared/types/money';
import { formatPercent } from '../../utils/formatters';
import type { IRGanhoCapital, IRRendimento } from '../../lib/irEngine';

interface Props {
  uid: string;
}

export default function IRPage({ uid }: Props) {
  const { transactions } = useTransactions(uid);
  const [anoSelecionado, setAnoSelecionado] = useState<number>(() => new Date().getFullYear() - 1);
  const [showGanhos, setShowGanhos] = useState(false);

  const anos = useMemo(() => anosDisponiveis(transactions), [transactions]);
  const informe = useMemo(
    () => gerarInformeIR(transactions, anoSelecionado),
    [transactions, anoSelecionado],
  );

  function handleExport() {
    const csv = exportarInformeCSV(informe);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe-ir-${anoSelecionado}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const temDados = informe.rendimentos.length > 0 || informe.ganhoCapital.length > 0;

  return (
    <div className="space-y-6 p-4 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Módulo IR</h1>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={anoSelecionado}
            onChange={(e) => setAnoSelecionado(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            aria-label="Selecionar ano-calendário"
          >
            {anos.length === 0 && (
              <option value={anoSelecionado}>{anoSelecionado}</option>
            )}
            {anos.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {temDados && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          )}
        </div>
      </div>

      {/* Aviso de uso */}
      <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Estimativa — confira com um contador antes de pagar qualquer DARF</p>
          <p className="mt-1 text-amber-700">
            Os valores saem das suas movimentações. O ganho de capital é apurado por mês, com preço médio
            (inclusive compras de anos anteriores), isenção de R$ 20 mil/mês em vendas de ações e R$ 35 mil/mês
            em outros bens, e compensação de prejuízo na bolsa. Feriados não entram no vencimento.
          </p>
        </div>
      </div>

      {!temDados ? (
        <EmptyState ano={anoSelecionado} />
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              label="Total Tributável"
              value={formatBRL(informe.totalTributavelCents)}
              color="blue"
            />
            <SummaryCard
              label="Isento e exclusivo"
              value={formatBRL(informe.totalIsentoCents + informe.totalExclusivaCents)}
              color="green"
              hint={`Isento ${formatBRL(informe.totalIsentoCents)} · exclusivo ${formatBRL(informe.totalExclusivaCents)}`}
            />
            <SummaryCard
              label="DARFs estimadas no ano"
              value={formatBRL(informe.totalIRDevidoCents)}
              color={informe.totalIRDevidoCents > 0 ? 'red' : 'gray'}
              {...(informe.totalIRDevidoCents > 0
                ? { hint: `Alíquota média sobre ganhos ${formatPercent(informe.aliquotaEfetiva * 100, 1)}` }
                : {})}
            />
          </div>

          {/* Rendimentos */}
          {informe.rendimentos.length > 0 && (
            <section aria-labelledby="rendimentos-titulo">
              <h2 id="rendimentos-titulo" className="text-base font-semibold text-gray-800 mb-3">
                Rendimentos por Categoria
              </h2>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                {informe.rendimentos.map((r) => (
                  <RendimentoRow key={r.category} rendimento={r} />
                ))}
              </div>
            </section>
          )}

          {/* Ganhos de Capital */}
          {informe.ganhoCapital.length > 0 && (
            <section aria-labelledby="ganhos-titulo">
              <button
                id="ganhos-titulo"
                className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-3 w-full text-left"
                onClick={() => setShowGanhos((v) => !v)}
                aria-expanded={showGanhos}
              >
                <span>Ganhos de Capital ({informe.ganhoCapital.length} apuraç{informe.ganhoCapital.length > 1 ? 'ões' : 'ão'} mensa{informe.ganhoCapital.length > 1 ? 'is' : 'l'})</span>
                {showGanhos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showGanhos && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="text-left px-4 py-3">Mês</th>
                        <th className="text-left px-4 py-3">Ativo</th>
                        <th className="text-right px-4 py-3">Custo</th>
                        <th className="text-right px-4 py-3">Venda</th>
                        <th className="text-right px-4 py-3">Ganho Líq.</th>
                        <th className="text-right px-4 py-3">IR Est.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {informe.ganhoCapital.map((g) => (
                        <GanhoCapitalRow key={`${g.competencia}|${g.assetClass}|${g.assetDescription}`} ganho={g} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* DARFs */}
          {informe.darfs.length > 0 && (
            <section aria-labelledby="darfs-titulo">
              <h2 id="darfs-titulo" className="text-base font-semibold text-gray-800 mb-3">DARFs estimadas</h2>
              <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Mês</th>
                      <th className="text-left px-4 py-3">Código</th>
                      <th className="text-right px-4 py-3">Valor</th>
                      <th className="text-right px-4 py-3">Vencimento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {informe.darfs.map((d) => (
                      <tr key={`${d.competencia}|${d.codigo}`}>
                        <td className="px-4 py-3 text-gray-800">{mesBR(d.competencia)}</td>
                        <td className="px-4 py-3 text-gray-600">{d.codigo} {d.codigo === '6015' ? '(bolsa)' : '(ganho de capital)'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatBRL(d.valorCents)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{dataBR(d.vencimento)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Dica de tags */}
          <div className="flex gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Para apurar ganhos de capital, use as tags <strong>compra-ativo</strong> e <strong>venda-ativo</strong>.
              Opcionais: <strong>ativo:PETR4</strong> (nome do ativo), <strong>qtd:100</strong> (quantidade, para venda parcial),
              e a classe <strong>acao</strong>, <strong>day-trade</strong>, <strong>fii</strong> ou <strong>cripto</strong>
              (sem classe = outros bens). Rendimentos isentos: categoria Reembolso, Estorno, Presente… ou tag <strong>isento</strong>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Sub-componentes
// ──────────────────────────────────────────────

function SummaryCard({
  label, value, color, hint,
}: {
  label: string;
  value: string;
  color: 'blue' | 'green' | 'red' | 'gray';
  hint?: string | undefined;
}) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    green: 'bg-green-50 border-green-100 text-green-700',
    red: 'bg-red-50 border-red-100 text-red-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {hint && <p className="text-xs mt-1 opacity-75">{hint}</p>}
    </div>
  );
}

function RendimentoRow({ rendimento }: { rendimento: IRRendimento }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
      <div>
        <p className="text-sm font-medium text-gray-800">{rendimento.label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{rendimento.transactionCount} transaç{rendimento.transactionCount === 1 ? 'ão' : 'ões'}</p>
      </div>
      <span className="text-sm font-semibold text-gray-900">
        {formatBRL(rendimento.totalCents)}
      </span>
    </div>
  );
}

function GanhoCapitalRow({ ganho }: { ganho: IRGanhoCapital }) {
  const isPositive = ganho.gainCents > 0;
  const isNegative = ganho.gainCents < 0;
  const GainIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const gainColor = isPositive ? 'text-red-600' : isNegative ? 'text-green-600' : 'text-gray-500';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{mesBR(ganho.competencia)}</td>
      <td className="px-4 py-3 font-medium text-gray-800">
        <span className="uppercase">{ganho.assetDescription}</span>
        <span className="block text-xs text-gray-400">{classeLabel(ganho.assetClass)}</span>
      </td>
      <td className="px-4 py-3 text-right text-gray-600">{formatBRL(ganho.costCents)}</td>
      <td className="px-4 py-3 text-right text-gray-600">{formatBRL(ganho.revenueCents)}</td>
      <td className={`px-4 py-3 text-right font-medium flex items-center justify-end gap-1 ${gainColor}`}>
        <GainIcon className="w-3.5 h-3.5" />
        {formatBRL(Math.abs(ganho.gainCents))}
      </td>
      <td className="px-4 py-3 text-right font-semibold text-gray-800">
        {ganho.isento ? <span className="text-green-700">Isento</span> : ganho.irDevidoCents > 0 ? formatBRL(ganho.irDevidoCents) : '—'}
      </td>
    </tr>
  );
}

/** YYYY-MM → MM/AAAA. */
function mesBR(competencia: string): string {
  const [y, m] = competencia.split('-');
  return `${m}/${y}`;
}

/** YYYY-MM-DD → DD/MM/AAAA. */
function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function EmptyState({ ano }: { ano: number }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
      <p className="font-medium text-gray-500">Nenhum rendimento encontrado para {ano}</p>
      <p className="text-sm mt-1">
        Registre transações de entrada com categorias Salário, Freelance ou Investimento
        para visualizar o informe.
      </p>
    </div>
  );
}
