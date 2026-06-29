import { describe, it, expect } from 'vitest';
import { resolveAccountByName, normalizeAccountName, type AccountRef } from './accountResolution';

const ACCOUNTS: AccountRef[] = [
  { id: 'acc-poup', name: 'Poupança' },
  { id: 'acc-corr', name: 'Conta Corrente' },
  { id: 'acc-cart', name: 'Carteira' },
];

describe('normalizeAccountName', () => {
  it('remove acentos, caixa e espaços extras', () => {
    expect(normalizeAccountName('  Poupança  ')).toBe('poupanca');
    expect(normalizeAccountName('Conta   Corrente')).toBe('conta corrente');
  });
});

describe('resolveAccountByName', () => {
  it('resolve por nome exato (ignorando acentos/caixa)', () => {
    const r = resolveAccountByName('poupanca', ACCOUNTS);
    expect(r).toEqual({ ok: true, id: 'acc-poup', name: 'Poupança' });
  });

  it('resolve por match parcial único', () => {
    const r = resolveAccountByName('corrente', ACCOUNTS);
    expect(r).toEqual({ ok: true, id: 'acc-corr', name: 'Conta Corrente' });
  });

  it('resolve descartando qualificadores iniciais ("a poupança")', () => {
    const r = resolveAccountByName('a poupança', ACCOUNTS);
    expect(r.ok && r.id).toBe('acc-poup');
  });

  it('retorna not_found quando nenhuma conta casa', () => {
    expect(resolveAccountByName('investimentos', ACCOUNTS)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('retorna not_found quando a lista está vazia', () => {
    expect(resolveAccountByName('poupança', [])).toEqual({ ok: false, reason: 'not_found' });
  });

  it('retorna ambiguous quando múltiplas contas casam parcialmente', () => {
    const dup: AccountRef[] = [
      { id: 'a', name: 'Conta Itaú' },
      { id: 'b', name: 'Conta Nubank' },
    ];
    expect(resolveAccountByName('conta', dup)).toEqual({ ok: false, reason: 'ambiguous' });
  });
});
