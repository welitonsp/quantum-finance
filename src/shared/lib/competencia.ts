/**
 * competencia.ts — Fonte canônica do cálculo de competência (YYYY-MM) de uma
 * cobrança/parcela de cartão de crédito.
 *
 * Regra de negócio única: o dia de fechamento (`closingDay`) é o último dia
 * incluído na fatura corrente. Uma compra feita EXATAMENTE no dia de fechamento
 * permanece na fatura atual; apenas compras com `dia > closingDay` caem na
 * próxima fatura. Para parcelas, soma-se `installmentIndex` meses à competência
 * base.
 *
 * Esta função substitui as duas implementações divergentes anteriores
 * (`resolveCompetencia` em firestoreCore e `computeCompetencia` em
 * purchaseSimulator), que discordavam no dia exato do fechamento. Como o
 * `installmentRepo` persiste a competência real com a regra `dia > closingDay`,
 * ela é adotada como canônica para todo o sistema.
 *
 * Zero I/O, zero dependências — 100% testável.
 */

/**
 * @param purchaseDateISO Data da compra no formato YYYY-MM-DD.
 * @param closingDay Dia de fechamento do cartão (1–31). `undefined` → sem
 *   deslocamento de fechamento (competência = mês da compra + índice).
 * @param installmentIndex Índice 0-based da parcela dentro do grupo.
 * @returns Competência no formato YYYY-MM.
 */
export function computeCompetencia(
  purchaseDateISO: string,
  closingDay: number | undefined,
  installmentIndex: number,
): string {
  const parts = purchaseDateISO.split('-').map(Number);
  const y = parts[0] ?? 2000;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;

  let baseYear = y;
  let baseMonth = m; // 1-based

  if (closingDay !== undefined && closingDay >= 1 && closingDay <= 31) {
    if (d > closingDay) {
      baseMonth += 1;
      if (baseMonth > 12) { baseMonth = 1; baseYear += 1; }
    }
  }

  const totalMonths = (baseYear * 12 + (baseMonth - 1)) + installmentIndex;
  const resultYear  = Math.floor(totalMonths / 12);
  const resultMonth = (totalMonths % 12) + 1; // 1-based
  return `${resultYear}-${String(resultMonth).padStart(2, '0')}`;
}
