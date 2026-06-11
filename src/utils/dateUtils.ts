/**
 * Utilitários de data para o Quantum Finance.
 * NUNCA use `new Date(string)` diretamente — timezone bug em YYYY-MM-DD.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Soma `months` meses a uma string YYYY-MM, retornando nova string YYYY-MM.
 */
function addMonthsToYM(ym: string, months: number): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr); // 1-based
  const totalMonthsZero = (m - 1) + months; // 0-based month offset
  const targetYear  = y + Math.floor(totalMonthsZero / 12);
  const targetMonth = (totalMonthsZero % 12) + 1; // back to 1-based
  return `${targetYear}-${pad(targetMonth)}`;
}

/**
 * Computa a competência (YYYY-MM) de uma compra parcelada.
 *
 * Regra:
 *  - dia da compra < closingDay  → competência = mês da compra
 *  - dia da compra >= closingDay → competência = mês seguinte
 *
 * Para a i-ésima parcela (0-based), soma i meses à competência da 1ª parcela.
 *
 * @param purchaseDateISO - Data da compra em YYYY-MM-DD
 * @param closingDay      - Dia de fechamento do cartão (1–31)
 * @param installmentIndex - Índice 0-based da parcela
 * @returns Competência no formato YYYY-MM
 */
export function computeCompetencia(
  purchaseDateISO: string,
  closingDay: number,
  installmentIndex: number,
): string {
  const [yStr, mStr, dStr] = purchaseDateISO.split('-');
  const y = Number(yStr);
  const m = Number(mStr); // 1-based
  const d = Number(dStr);

  let baseYM: string;
  if (d < closingDay) {
    // Compra antes do fechamento: competência = mês atual
    baseYM = `${y}-${pad(m)}`;
  } else {
    // Compra no dia do fechamento ou depois: competência = mês seguinte
    if (m === 12) {
      baseYM = `${y + 1}-01`;
    } else {
      baseYM = `${y}-${pad(m + 1)}`;
    }
  }

  return addMonthsToYM(baseYM, installmentIndex);
}
