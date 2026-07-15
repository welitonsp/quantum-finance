import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Centavos } from '../../../shared/types/money';
import type { CreditCard, Transaction } from '../../../shared/types/transaction';
import type { UserCategory } from '../../../shared/schemas/categorySchemas';

// ─── Mock framer-motion — sem animação, AnimatePresence renderiza direto ───────
vi.mock('framer-motion', async () => {
  const { createElement, forwardRef, Fragment } = await import('react');
  const makeEl = (tag: string) =>
    forwardRef(function MockMotion(
      { children, animate, initial, exit, transition, whileHover, whileTap, variants, custom, ...props }:
        Record<string, unknown> & { children?: React.ReactNode },
      ref: React.Ref<unknown>,
    ) {
      void animate; void initial; void exit; void transition;
      void whileHover; void whileTap; void variants; void custom;
      return createElement(tag, { ...props, ref: ref as React.Ref<never> }, children);
    });
  return {
    motion:          { div: makeEl('div'), button: makeEl('button'), span: makeEl('span') },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      createElement(Fragment, null, children),
  };
});

const CATEGORIES: UserCategory[] = [
  { id: 'c-diversos', uid: 'u', name: 'Diversos', normalizedName: 'diversos', type: 'ambos',   color: '#64748b', icon: '📦', isDefault: true, isActive: true },
  { id: 'c-mercado',  uid: 'u', name: 'Mercado',  normalizedName: 'mercado',  type: 'saida',   color: '#f59e0b', icon: '🛒', isDefault: true, isActive: true },
  { id: 'c-salario',  uid: 'u', name: 'Salário',  normalizedName: 'salario',  type: 'entrada', color: '#10b981', icon: '💰', isDefault: true, isActive: true },
];

vi.mock('../../../hooks/useCategories', () => ({
  useCategories: () => ({
    categories: CATEGORIES,
    loading: false,
    error: null,
    addCategory: vi.fn(),
    updateCategory: vi.fn(),
    deactivateCategory: vi.fn(),
  }),
}));

const mockCreateInstallment = vi.fn();
vi.mock('../../../shared/services/FirestoreService', () => ({
  FirestoreService: {
    createInstallmentGroupWithHistory: (...args: unknown[]) => mockCreateInstallment(...args),
  },
}));

import TransactionForm from '../TransactionForm';

const cents = (value: number): Centavos => value as Centavos;

const CARD: CreditCard = {
  id: 'card-1',
  name: 'Nubank',
  limit: 500000,
  closingDay: 10,
  dueDay: 17,
  color: '#8b5cf6',
  active: true,
};

function setup(overrides: {
  editingTransaction?: Transaction | null;
  onSave?: (tx: Partial<Transaction>) => Promise<void>;
  onCancelEdit?: () => void;
} = {}) {
  const onSave = vi.fn(overrides.onSave ?? (() => Promise.resolve()));
  const onCancelEdit = overrides.onCancelEdit ?? vi.fn();
  render(
    <TransactionForm
      uid="uid-test"
      onSave={onSave}
      editingTransaction={overrides.editingTransaction ?? null}
      onCancelEdit={onCancelEdit}
      creditCards={[CARD]}
    />,
  );
  return { onSave, onCancelEdit };
}

describe('TransactionForm', () => {
  beforeEach(() => {
    mockCreateInstallment.mockReset();
    mockCreateInstallment.mockResolvedValue('grp-1');
  });

  it('exige descrição antes de salvar', async () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByText('A descrição é obrigatória.')).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejeita valor monetário inválido', async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByPlaceholderText('Ex: Supermercado Extra'), { target: { value: 'Mercado' } });
    fireEvent.change(screen.getByLabelText(/Valor \(R\$\)/), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByText('Insira um valor monetario valido.')).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejeita valor zero', async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByPlaceholderText('Ex: Supermercado Extra'), { target: { value: 'Mercado' } });
    fireEvent.change(screen.getByLabelText(/Valor \(R\$\)/), { target: { value: '0,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByText('Insira um valor válido maior que zero.')).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('caminho à vista chama onSave com centavos exatos e não parcela', async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByPlaceholderText('Ex: Supermercado Extra'), { target: { value: 'Mercado' } });
    fireEvent.change(screen.getByLabelText(/Valor \(R\$\)/), { target: { value: '123,45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Mercado', value: 123.45, value_cents: 12345 }),
    );
    expect(mockCreateInstallment).not.toHaveBeenCalled();
  });

  it('caminho parcelado chama createInstallmentGroupWithHistory com count clampado e sem chamar onSave', async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByPlaceholderText('Ex: Supermercado Extra'), { target: { value: 'Notebook' } });
    fireEvent.change(screen.getByLabelText(/Valor \(R\$\)/), { target: { value: '1.200,00' } });

    // Ativa o toggle de parcelamento (só existe para saída nova)
    fireEvent.click(screen.getByRole('button', { name: /Parcelado/ }));
    // Valor acima do máximo → clampa para 120
    fireEvent.change(screen.getByLabelText(/parcelas/i), { target: { value: '999' } });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mockCreateInstallment).toHaveBeenCalledTimes(1));
    const [uidArg, payload] = mockCreateInstallment.mock.calls[0] as [string, Record<string, unknown>];
    expect(uidArg).toBe('uid-test');
    expect(payload.totalValueCents).toBe(120000);
    expect(payload.installmentCount).toBe(120);
    expect(payload.description).toBe('Notebook');
    // Sem UI de seleção de cartão neste componente → cardId/closingDay ausentes
    expect('cardId' in payload).toBe(false);
    expect('closingDay' in payload).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('em edição não oferece parcelamento e salva via onSave', async () => {
    const editing: Transaction = {
      id: 'tx-1',
      description: 'Compra antiga',
      value_cents: cents(5000),
      value: 50,
      type: 'saida',
      category: 'Mercado',
      date: '2026-07-01',
    };
    const { onSave } = setup({ editingTransaction: editing });

    expect(screen.queryByRole('button', { name: /Parcelado/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Compra antiga', value_cents: 5000 }),
    );
    expect(mockCreateInstallment).not.toHaveBeenCalled();
  });

  it('trocar tipo para entrada reajusta categoria só-saída para a primeira compatível', () => {
    setup();
    // Seleciona a categoria só-saída "Mercado"
    fireEvent.click(screen.getByRole('button', { name: /Mercado/ }));
    // Ainda visível como opção selecionável em despesa
    expect(screen.getByRole('button', { name: /Mercado/ })).toBeTruthy();

    // Troca para Receita → categoria some de "Mercado" (reajustada para compatível)
    fireEvent.click(screen.getByRole('button', { name: /Receita/ }));

    expect(screen.queryByRole('button', { name: /Mercado/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Diversos/ })).toBeTruthy();
  });

  it('Esc chama onCancelEdit', () => {
    const { onCancelEdit } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });
});
