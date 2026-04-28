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

export const formatPercent = (value: number | null | undefined, decimals = 1): string => {
  if (value === null || value === undefined || isNaN(value)) return `0.${'0'.repeat(decimals)}%`;
  return `${Number(value).toFixed(decimals)}%`;
};
