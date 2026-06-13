import { useState, useMemo } from 'react';
import {
  FileText, Download, TrendingUp, TrendingDown, Minus,
  AlertCircle, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { useTransactions } from '../../hooks/useTransactions';
import { gerarInformeIR, anosDisponiveis, exportarInformeCSV } from '../../lib/irEngine';
import { formatBRL } from '../../shared/types/money';
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
          <p className="font-medium">Informação auxiliar — não substitui declaração oficial</p>
          <p className="mt-1 text-amber-700">
            Os valores são calculados com base nas suas movimentações registradas.
            Marque compras de ativos com a tag <strong>compra-ativo</strong> e vendas com <strong>venda-ativo</strong> para apurar ganhos de capital.
            Consulte um contador para a declaração definitiva.
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
              label="Total Isento"
              value={formatBRL(informe.totalIsentoCents)}
              color="green"
            />
            <SummaryCard
              label="IR Est. Ganho Capital"
              value={formatBRL(informe.totalIRDevidoCents)}
              color={informe.totalIRDevidoCents > 0 ? 'red' : 'gray'}
              {...(informe.totalIRDevidoCents > 0
                ? { hint: `Alíquota efetiva ${(informe.aliquotaEfetiva * 100).toFixed(1)}%` }
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
                <span>Ganhos de Capital ({informe.ganhoCapital.length} ativo{informe.ganhoCapital.length > 1 ? 's' : ''})</span>
                {showGanhos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showGanhos && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="text-left px-4 py-3">Ativo</th>
                        <th className="text-right px-4 py-3">Custo</th>
                        <th className="text-right px-4 py-3">Receita</th>
                        <th className="text-right px-4 py-3">Ganho Líq.</th>
                        <th className="text-right px-4 py-3">IR Est.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {informe.ganhoCapital.map((g) => (
                        <GanhoCapitalRow key={g.assetDescription} ganho={g} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Dica de tags */}
          <div className="flex gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Para apurar ganhos de capital, adicione a tag <strong>compra-ativo</strong> nas transações de compra de investimentos
              e <strong>venda-ativo</strong> nas transações de resgate/venda.
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
      <td className="px-4 py-3 font-medium text-gray-800 capitalize">{ganho.assetDescription}</td>
      <td className="px-4 py-3 text-right text-gray-600">{formatBRL(ganho.costCents)}</td>
      <td className="px-4 py-3 text-right text-gray-600">{formatBRL(ganho.revenueCents)}</td>
      <td className={`px-4 py-3 text-right font-medium flex items-center justify-end gap-1 ${gainColor}`}>
        <GainIcon className="w-3.5 h-3.5" />
        {formatBRL(Math.abs(ganho.gainCents))}
      </td>
      <td className="px-4 py-3 text-right font-semibold text-gray-800">
        {ganho.irDevidoCents > 0 ? formatBRL(ganho.irDevidoCents) : '—'}
      </td>
    </tr>
  );
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
