import Decimal from 'decimal.js';
import type { Centavos } from '../types/money';

export interface ImportMoneyOptions {
  /**
   * Quando true, o valor bruto já está em centavos como inteiro sem separador decimal.
   * Ex: "1200" → 1200 centavos (R$ 12,00), não 120000 (R$ 1.200,00).
   * Use APENAS quando o header da coluna garantidamente exporta minor units (centavos).
   */
  integerMinorUnits?: boolean;
}

/**
 * Faz parsing de valores monetários brutos vindos de importações (CSV/OFX/PDF)
 * retornando centavos inteiros como fonte canônica.
 *
 * Casos suportados:
 *   "12,00"      -> 1200    BRL decimal com virgula
 *   "1.200,00"   -> 120000  BRL com separador de milhar
 *   "1,200.00"   -> 120000  formato americano com milhar
 *   "1200.00"    -> 120000  decimal com ponto (padrao americano)
 *   "1200"       -> 120000  inteiro sem separador -> interpreta como reais
 *   "-12,00"     -> -1200   negativo explicito
 *   "(12,00)"    -> -1200   notacao contabil de negativo
 *   "R$ 12,00"   -> 1200    com prefixo BRL
 *
 *   Com integerMinorUnits=true:
 *   "1200"       -> 1200    banco exportou em centavos
 */
export function parseImportedMoneyToCentavos(
  raw: string,
  options?: ImportMoneyOptions,
): Centavos {
  // Normalizar: NBSP, aspas, prefixo R$, espacos residuais
  let s = raw
    .replace(/\u00a0/g, ' ')
    .replace(/"/g, '')
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s+/g, '');

  if (!s) throw new Error(`Valor monetario vazio na importacao: "${raw}"`);

  // Detectar negativo por parenteses contabeis ou sinal explicito
  const isNegative = (s.startsWith('(') && s.endsWith(')')) || s.startsWith('-');
  s = s.replace(/[()]/g, '').replace(/^[+-]/, '');

  // Modo inteiro-em-centavos: banco exporta "1200" significando R$ 12,00
  if (options?.integerMinorUnits) {
    if (!/^\d+$/.test(s)) {
      throw new Error(
        `Esperado inteiro em centavos (sem separador decimal), mas recebido: "${raw}". ` +
          `Use integerMinorUnits apenas para colunas que garantidamente exportam centavos.`,
      );
    }
    const n = parseInt(s, 10);
    if (!Number.isSafeInteger(n)) throw new Error(`Valor fora do limite seguro: "${raw}"`);
    const result = isNegative ? -n : n;
    devLog(raw, s, result);
    return result as Centavos;
  }

  // Parsing monetario padrao -> normalizar para string decimal com ponto
  const normalized = normalizeDecimalString(s, raw);
  const decimal = new Decimal(normalized);
  if (!decimal.isFinite()) throw new Error(`Valor nao-finito: "${raw}"`);

  const cents = decimal.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const n = cents.toNumber();
  if (!Number.isSafeInteger(n)) throw new Error(`Valor fora do limite seguro: "${raw}"`);

  const result = isNegative ? -Math.abs(n) : n;
  devLog(raw, normalized, result);
  return result as Centavos;
}

function normalizeDecimalString(s: string, original: string): string {
  if (!/^[\d.,]+$/.test(s)) {
    throw new Error(`Formato monetario invalido para importacao: "${original}"`);
  }

  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Ambos presentes: o separador que vier por ultimo e o decimal
    return lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.') // BRL 1.234,56 -> 1234.56
      : s.replace(/,/g, '');                    // US  1,234.56 -> 1234.56
  }

  if (lastComma !== -1) {
    // So virgula: se exatamente 2 digitos apos -> decimal BRL, senao milhar
    const afterComma = s.slice(lastComma + 1);
    return afterComma.length === 2
      ? s.replace(',', '.') // "12,00" -> "12.00"
      : s.replace(/,/g, ''); // "1,200" -> "1200"
  }

  const dotCount = (s.match(/\./g) ?? []).length;
  if (dotCount > 1) {
    // Multiplos pontos como separador de milhar: "1.234.567" -> "1234567"
    return s.replace(/\./g, '');
  }

  // Sem separador ou ponto unico: "1200" -> "1200", "1200.00" -> "1200.00"
  return s;
}

function devLog(raw: string, normalized: string, centavos: number): void {
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
    console.debug(`[importMoneyParser] raw="${raw}" -> normalized="${normalized}" -> ${centavos} centavos`);
  }
}
