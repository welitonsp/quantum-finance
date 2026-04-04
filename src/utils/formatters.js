// src/utils/formatters.js

/**
 * Formata um número para o padrão de moeda brasileiro (R$)
 * @param {number} value - O valor numérico a ser formatado
 * @returns {string} - Ex: R$ 1.500,00
 */
export const formatCurrency = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(0);
  }
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
  }).format(value);
};

/**
 * Formata um número em formato de percentagem
 * @param {number} value - O valor percentual
 * @param {number} decimals - Casas decimais (padrão: 1)
 * @returns {string} - Ex: 15.5%
 */
export const formatPercent = (value, decimals = 1) => {
  if (value === null || value === undefined || isNaN(value)) return `0.${'0'.repeat(decimals)}%`;
  return `${Number(value).toFixed(decimals)}%`;
};