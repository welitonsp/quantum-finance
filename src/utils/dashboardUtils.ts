export const MONO = "'JetBrains Mono','Fira Code','SF Mono',ui-monospace,monospace";

export interface StatusResult {
  status: string;
  risk: string;
  color: string;
  rec: string;
  score: number;
  savingsRate: number;
  debtRatio: number;
  goalProgress: number;
  patrimonyRisk: number;
}

export const calcStatus = (
  saldo: number,
  receitas: number,
  despesas: number,
  patrimonio: number,
  dividas: number,
  meta: number
): StatusResult => {
  const savingsRate   = receitas > 0 ? ((receitas - despesas) / receitas) * 100 : 0;
  const debtRatio     = receitas > 0 ? (despesas / receitas) * 100 : 0;
  const patrimonyRisk = patrimonio <= 0 ? 100 : (dividas / Math.abs(patrimonio)) * 100;
  const goalProgress  = meta > 0 ? Math.min((savingsRate / meta) * 100, 100) : 0;

  let s = 0;
  s += savingsRate >= 20 ? 25 : savingsRate >= 10 ? 14 : savingsRate >= 5 ? 5 : 0;
  s += debtRatio   <= 40 ? 25 : debtRatio   <= 70 ? 14 : debtRatio   <= 90 ? 5 : 0;
  s += goalProgress >= 80 ? 25 : goalProgress >= 50 ? 14 : goalProgress >= 20 ? 5 : 0;
  s += patrimonyRisk <= 30 ? 25 : patrimonyRisk <= 80 ? 14 : patrimonyRisk <= 150 ? 5 : 0;
  const score = Math.min(s, 100);

  let status = 'SAUDÁVEL', risk = 'BAIXO', color = 'emerald';
  let rec = 'Indicadores estáveis. Considere aumentar aportes em renda variável.';

  if (saldo < 0 || debtRatio > 90 || patrimonyRisk > 150) {
    status = 'CRÍTICO'; risk = 'ALTO'; color = 'red';
    rec = 'Interrompa gastos não essenciais. Reestruture dívidas imediatamente.';
  } else if (savingsRate < 10 || debtRatio > 70 || goalProgress < 50) {
    status = 'ATENÇÃO'; risk = 'MÉDIO'; color = 'amber';
    rec = 'Reduza despesas variáveis e assinaturas. Reforce a reserva de emergência.';
  } else if (score >= 80) {
    status = 'EXCELENTE'; risk = 'MÍNIMO'; color = 'emerald';
    rec = 'Desempenho excepcional. Acelere posições em ativos de maior retorno.';
  }

  return { status, risk, color, rec, score, savingsRate, debtRatio, goalProgress, patrimonyRisk };
};
