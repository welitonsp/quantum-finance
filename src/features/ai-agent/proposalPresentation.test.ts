import { describe, expect, it } from 'vitest';
import { presentProposal, formatMissingInfoMessage } from './proposalPresentation';
import type { ActionProposal } from '../../shared/schemas/agentSchemas';
import type { Centavos } from '../../shared/types/money';

const cents = (n: number): Centavos => n as Centavos;

describe('presentProposal', () => {
  it('formata register_purchase à vista (sem linha de parcelas)', () => {
    const proposal: ActionProposal = {
      kind: 'register_purchase',
      status: 'pending',
      payload: { description: 'Notebook', amountCents: cents(400000), date: '2026-06-24', category: 'Eletrônicos' },
    };
    const p = presentProposal(proposal);
    expect(p.title).toBe('Registrar compra');
    expect(p.confirmLabel).toBe('Registrar compra');
    const labels = p.rows.map(r => r.label);
    expect(labels).toEqual(['Descrição', 'Valor', 'Data', 'Categoria']);
    const valor = p.rows.find(r => r.label === 'Valor');
    expect(valor?.emphasis).toBe(true);
    expect(valor?.value).toContain('4.000,00');
    expect(p.rows.find(r => r.label === 'Data')?.value).toBe('24/06/2026');
  });

  it('inclui linha de parcelas quando installments > 1', () => {
    const proposal: ActionProposal = {
      kind: 'register_purchase',
      status: 'pending',
      payload: { description: 'TV', amountCents: cents(300000), date: '2026-06-24', installments: 3 },
    };
    const p = presentProposal(proposal);
    expect(p.rows.find(r => r.label === 'Parcelas')?.value).toBe('3x');
    // category ausente → default 'Outros'
    expect(p.rows.find(r => r.label === 'Categoria')?.value).toBe('Outros');
  });

  it('formata create_budget com competência e limite', () => {
    const proposal: ActionProposal = {
      kind: 'create_budget',
      status: 'pending',
      payload: { category: 'Lazer', limitCents: cents(80000), competencia: '2026-06' },
    };
    const p = presentProposal(proposal);
    expect(p.title).toBe('Criar orçamento');
    expect(p.rows.find(r => r.label === 'Categoria')?.value).toBe('Lazer');
    expect(p.rows.find(r => r.label === 'Limite')?.value).toContain('800,00');
    expect(p.rows.find(r => r.label === 'Competência')?.value).toBe('2026-06');
  });

  it('formata register_transfer (De/Para/Valor/Data) e Descrição opcional', () => {
    const proposal: ActionProposal = {
      kind: 'register_transfer',
      status: 'pending',
      payload: { fromAccountId: 'acc-a', toAccountId: 'acc-b', amountCents: cents(50000), date: '2026-06-29', description: 'Reserva' },
    };
    const p = presentProposal(proposal);
    expect(p.title).toBe('Registrar transferência');
    expect(p.confirmLabel).toBe('Transferir');
    expect(p.successMessage).toBe('Transferência registrada pelo assistente.');
    expect(p.rows.map(r => r.label)).toEqual(['De', 'Para', 'Valor', 'Data', 'Descrição']);
    expect(p.rows.find(r => r.label === 'De')?.value).toBe('acc-a');
    expect(p.rows.find(r => r.label === 'Para')?.value).toBe('acc-b');
    expect(p.rows.find(r => r.label === 'Valor')?.value).toContain('500,00');
    expect(p.rows.find(r => r.label === 'Data')?.value).toBe('29/06/2026');
  });

  it('register_transfer sem descrição omite a linha Descrição', () => {
    const proposal: ActionProposal = {
      kind: 'register_transfer',
      status: 'pending',
      payload: { fromAccountId: 'acc-a', toAccountId: 'acc-b', amountCents: cents(50000), date: '2026-06-29' },
    };
    const p = presentProposal(proposal);
    expect(p.rows.map(r => r.label)).toEqual(['De', 'Para', 'Valor', 'Data']);
  });

  it('register_transfer: display hints substituem os IDs por nomes legíveis', () => {
    const proposal: ActionProposal = {
      kind: 'register_transfer',
      status: 'pending',
      payload: { fromAccountId: 'acc-a', toAccountId: 'acc-b', amountCents: cents(50000), date: '2026-06-29' },
    };
    const p = presentProposal(proposal, { fromAccountName: 'Poupança', toAccountName: 'Conta Corrente' });
    expect(p.rows.find(r => r.label === 'De')?.value).toBe('Poupança');
    expect(p.rows.find(r => r.label === 'Para')?.value).toBe('Conta Corrente');
  });

  it('formata contribute_to_goal e register_debt_payment', () => {
    const goalProposal: ActionProposal = {
      kind: 'contribute_to_goal',
      status: 'pending',
      payload: { goalId: 'g1', amountCents: cents(50000), date: '2026-06-24' },
    };
    const goal = presentProposal(goalProposal);
    expect(goal.title).toBe('Contribuir para meta');
    expect(goal.successMessage).toBe('Contribuição registrada pelo assistente.');

    const debtProposal: ActionProposal = {
      kind: 'register_debt_payment',
      status: 'pending',
      payload: { debtId: 'd1', amountCents: cents(25000), date: '2026-06-24' },
    };
    const debt = presentProposal(debtProposal);
    expect(debt.title).toBe('Registrar pagamento de dívida');
    expect(debt.rows.find(r => r.label === 'Valor')?.value).toContain('250,00');
  });
});

describe('formatMissingInfoMessage', () => {
  it('mapeia um único slot para rótulo pt-BR', () => {
    expect(formatMissingInfoMessage(['amountCents'])).toContain('o valor');
  });

  it('junta múltiplos slots com vírgula e "e"', () => {
    const msg = formatMissingInfoMessage(['description', 'amountCents']);
    expect(msg).toContain('a descrição da compra e o valor');
  });

  it('usa o nome cru quando o slot é desconhecido', () => {
    expect(formatMissingInfoMessage(['fooBar'])).toContain('fooBar');
  });
});
