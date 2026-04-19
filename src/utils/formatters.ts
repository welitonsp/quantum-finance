// src/utils/formatters.ts

export const formatCurrency = (value: number | null | undefined): string => {
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  if (value === null || value === undefined || isNaN(value)) return fmt.format(0);
  return fmt.format(value);
};

export const formatPercent = (value: number | null | undefined, decimals = 1): string => {
  if (value === null || value === undefined || isNaN(value)) return `0.${'0'.repeat(decimals)}%`;
  return `${Number(value).toFixed(decimals)}%`;
};
