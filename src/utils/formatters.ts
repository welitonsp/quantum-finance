import Decimal from 'decimal.js';
import { fromCentavos, type Centavos } from '../shared/types/money';

type FormatCurrencyOptions = {
  cents?: boolean;
};

export const formatCurrency = (
  value: Centavos | number | null | undefined,
  options: FormatCurrencyOptions = {}
): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(0);
  }

  const reais = options.cents ? fromCentavos(value) : Number(value);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reais);
};

type DisplayNumberInput = number | string | null | undefined;

/**
 * Arredonda um número de exibição (percentual, meses etc. — nunca dinheiro) com
 * Decimal.js ROUND_HALF_UP. null, undefined, NaN e não-finitos (±Infinity) viram 0.
 * Exportado para que a UI classifique pelo mesmo valor que exibe.
 */
export const roundForDisplay = (value: DisplayNumberInput, decimals = 1): number => {
  // Number() aceitável aqui: valor de exibição, não monetário.
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  const rounded = new Decimal(n).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toNumber();
  return rounded === 0 ? 0 : rounded; // evita "-0,0"
};

/** Número no formato pt-BR com casas fixas: 1.234,5 */
export const formatNumber = (value: DisplayNumberInput, decimals = 1): string =>
  roundForDisplay(value, decimals).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/** Percentual no formato pt-BR (vírgula decimal, sem espaço antes do %): 15,6% */
export const formatPercent = (value: DisplayNumberInput, decimals = 1): string =>
  `${formatNumber(value, decimals)}%`;

const compactCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/**
 * Moeda compacta pt-BR para eixos de gráfico (recebe reais, não centavos):
 * 950 → "R$ 950", 1500 → "R$ 1,5 mil", 1500000 → "R$ 1,5 mi". Não-finitos viram "R$ 0".
 */
export const formatCompactCurrency = (reais: number | null | undefined): string => {
  const n = typeof reais === 'number' && Number.isFinite(reais) ? reais : 0;
  return compactCurrencyFormatter.format(n);
};
