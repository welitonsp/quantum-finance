/**
 * Motor de detecção de tarifas bancárias recorrentes.
 *
 * Analisa transações de saída em busca de cobranças com padrão recorrente:
 * - mesma descrição normalizada aparecendo em múltiplos meses
 * - valores típicos de tarifas (abaixo de um limiar configurável)
 * - coincidência com palavras-chave de tarifas bancárias comuns
 *
 * Motor puro: zero I/O, zero float, Decimal.js para somas.
 */

import Decimal from 'decimal.js';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import { addCentavos } from '../shared/types/money';

// ──────────────────────────────────────────────
// Tipos públicos
// ──────────────────────────────────────────────

export type TarifaRisco = 'alto' | 'medio' | 'baixo';

export interface TarifaDetectada {
  /** Descrição normalizada que identifica a cobrança */
  descricaoNormalizada: string;
  /** Exemplo de descrição original para exibição */
  descricaoExemplo: string;
  /** Meses em que apareceu (YYYY-MM) */
  meses: string[];
  /** Frequência: quantos meses distintos */
  frequencia: number;
  /** Valor mais recente em centavos */
  ultimoValorCents: Centavos;
  /** Total cobrado no período analisado */
  totalCobradoCents: Centavos;
  /** Projeção anual com base na frequência e valor médio */
  projecaoAnualCents: Centavos;
  /** Nível de risco: alto = tarifa quase certa, medio = suspeito, baixo = possível */
  risco: TarifaRisco;
  /** Razões que justificam a classificação */
  razoes: string[];
}

export interface AntiTarifaRelatorio {
  tarifas: TarifaDetectada[];
  totalEstimadoAnualCents: Centavos;
  periodoAnalisadoMeses: number;
  transacoesAnalisadas: number;
}

// ──────────────────────────────────────────────
// Palavras-chave de tarifas bancárias
// ──────────────────────────────────────────────

const KEYWORDS_ALTO_RISCO = [
  'tarifa', 'manutenção', 'manutencao', 'mensalidade conta',
  'pacote serviços', 'pacote servicos', 'anuidade',
  'seguro prestamista', 'seguro saldo', 'seguro cartao',
  'cobrança bancária', 'cobranca bancaria',
  'taxa adm', 'taxa administração', 'taxa administracao',
  'iof financiamento', 'cpmf', 'ted banco',
];

const KEYWORDS_MEDIO_RISCO = [
  'seguro', 'proteção', 'protecao', 'cobertura',
  'serviço adicional', 'servico adicional', 'taxa',
  'débito automático banco', 'debito automatico banco',
  'extrato', 'compensação', 'compensacao',
];

// Valor máximo considerado típico de tarifa: R$ 80,00
const LIMIAR_TARIFA_CENTS = 8000 as Centavos;
// Mínimo de aparições para considerar recorrente
const MIN_FREQUENCIA = 2;
// Janela de análise padrão: 12 meses
const JANELA_MESES = 12;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function normalizarDescricao(desc: string): string {
  return desc
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getYearMonth(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

function mesesAtras(meses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 7);
}

function canonicalCents(tx: Transaction): Centavos {
  if (tx.value_cents !== undefined) return tx.value_cents;
  return Math.round((tx.value ?? 0) * 100) as Centavos;
}

function contemKeyword(desc: string, keywords: string[]): boolean {
  return keywords.some((kw) => desc.includes(kw));
}

function classificarRisco(
  descNorm: string,
  frequencia: number,
  valorCents: Centavos,
): { risco: TarifaRisco; razoes: string[] } {
  const razoes: string[] = [];
  let pontos = 0;

  if (contemKeyword(descNorm, KEYWORDS_ALTO_RISCO)) {
    pontos += 3;
    razoes.push('Descrição contém termo típico de tarifa bancária');
  } else if (contemKeyword(descNorm, KEYWORDS_MEDIO_RISCO)) {
    pontos += 1;
    razoes.push('Descrição contém termo suspeito de cobrança');
  }

  if (frequencia >= 6) {
    pontos += 2;
    razoes.push(`Aparece em ${frequencia} meses consecutivos`);
  } else if (frequencia >= 3) {
    pontos += 1;
    razoes.push(`Aparece em ${frequencia} meses`);
  }

  if (valorCents <= LIMIAR_TARIFA_CENTS) {
    pontos += 1;
    razoes.push('Valor compatível com tarifas bancárias (abaixo de R$ 80)');
  }

  const risco: TarifaRisco = pontos >= 4 ? 'alto' : pontos >= 2 ? 'medio' : 'baixo';
  return { risco, razoes };
}

// ──────────────────────────────────────────────
// Motor principal
// ──────────────────────────────────────────────

interface Agrupado {
  descricaoExemplo: string;
  meses: Set<string>;
  totalCents: Centavos;
  ultimoValorCents: Centavos;
  ultimaData: string;
}

/**
 * Detecta tarifas recorrentes nas transações dos últimos `janelaMeses` meses.
 */
export function detectarTarifas(
  transactions: Transaction[],
  janelaMeses = JANELA_MESES,
): AntiTarifaRelatorio {
  const limite = mesesAtras(janelaMeses);

  const saidas = transactions.filter(
    (tx) =>
      !tx.isDeleted &&
      (tx.type === 'saida' || tx.type === 'despesa') &&
      getYearMonth(tx.date) >= limite,
  );

  // Agrupa por descrição normalizada
  const grupos = new Map<string, Agrupado>();

  for (const tx of saidas) {
    const norm = normalizarDescricao(tx.description);
    const ym = getYearMonth(tx.date);
    const cents = canonicalCents(tx);

    const existing = grupos.get(norm);
    if (existing) {
      existing.meses.add(ym);
      existing.totalCents = addCentavos(existing.totalCents, cents);
      if (tx.date > existing.ultimaData) {
        existing.ultimaData = tx.date;
        existing.ultimoValorCents = cents;
      }
    } else {
      grupos.set(norm, {
        descricaoExemplo: tx.description,
        meses: new Set([ym]),
        totalCents: cents,
        ultimoValorCents: cents,
        ultimaData: tx.date,
      });
    }
  }

  const tarifas: TarifaDetectada[] = [];

  for (const [norm, grupo] of grupos.entries()) {
    const frequencia = grupo.meses.size;
    if (frequencia < MIN_FREQUENCIA) continue;
    if (grupo.ultimoValorCents > LIMIAR_TARIFA_CENTS) continue;

    const { risco, razoes } = classificarRisco(norm, frequencia, grupo.ultimoValorCents);

    // Projeção anual: valor médio × 12 meses
    const valorMedioCents = new Decimal(grupo.totalCents)
      .dividedBy(frequencia)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber() as Centavos;
    const projecaoAnualCents = new Decimal(valorMedioCents)
      .times(12)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber() as Centavos;

    tarifas.push({
      descricaoNormalizada: norm,
      descricaoExemplo: grupo.descricaoExemplo,
      meses: Array.from(grupo.meses).sort(),
      frequencia,
      ultimoValorCents: grupo.ultimoValorCents,
      totalCobradoCents: grupo.totalCents,
      projecaoAnualCents,
      risco,
      razoes,
    });
  }

  // Ordena: alto risco primeiro, depois por projeção anual desc
  const ordemRisco: Record<TarifaRisco, number> = { alto: 0, medio: 1, baixo: 2 };
  tarifas.sort((a, b) => {
    const dr = ordemRisco[a.risco] - ordemRisco[b.risco];
    return dr !== 0 ? dr : b.projecaoAnualCents - a.projecaoAnualCents;
  });

  const totalEstimadoAnualCents = tarifas.reduce(
    (acc, t) => addCentavos(acc, t.projecaoAnualCents),
    0 as Centavos,
  );

  return {
    tarifas,
    totalEstimadoAnualCents,
    periodoAnalisadoMeses: janelaMeses,
    transacoesAnalisadas: saidas.length,
  };
}
