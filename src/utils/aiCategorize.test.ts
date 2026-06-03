import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiService } from '../features/ai-chat/GeminiService';
import { batchCategorizeDescriptions, categorizeTransaction, applyAICategories } from './aiCategorize';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import type { UserCategoryRule } from '../hooks/useCategoryRules';

vi.mock('../features/ai-chat/GeminiService', () => ({
  GeminiService: {
    categorizeTransactionsBatch: vi.fn(),
  },
}));

describe('batchCategorizeDescriptions', () => {
  beforeEach(() => {
    vi.mocked(GeminiService.categorizeTransactionsBatch).mockReset();
  });

  it('envia IDs opacos para a IA e mapeia a resposta para a descrição original', async () => {
    const sensitiveDescription = 'PIX JOAO CPF 123.456.789-00 aluguel apartamento';

    vi.mocked(GeminiService.categorizeTransactionsBatch).mockResolvedValue([
      { id: 'tx_0', category: 'Moradia' },
    ]);

    const result = await batchCategorizeDescriptions([sensitiveDescription]);

    expect(result).toEqual({ [sensitiveDescription]: 'Moradia' });
    expect(GeminiService.categorizeTransactionsBatch).toHaveBeenCalledTimes(1);

    const [payload] = vi.mocked(GeminiService.categorizeTransactionsBatch).mock.calls[0] ?? [];
    expect(payload).toEqual([
      { id: 'tx_0', description: sensitiveDescription },
    ]);
    expect(payload?.[0]?.id).not.toBe(sensitiveDescription);
    expect(payload?.[0]?.id).not.toContain('PIX');
    expect(payload?.[0]?.id).not.toContain('123.456.789-00');
    expect(payload?.[0]?.id).toMatch(/^tx_\d+$/);
  });

  it('mantem IDs opacos determinísticos por item único do lote', async () => {
    const descriptions = ['Padaria Central', 'Farmacia Boa Saude'];

    vi.mocked(GeminiService.categorizeTransactionsBatch).mockResolvedValue([
      { id: 'tx_0', category: 'Alimentação' },
      { id: 'tx_1', category: 'Saúde' },
    ]);

    const result = await batchCategorizeDescriptions(descriptions);

    expect(result).toEqual({
      'Padaria Central': 'Alimentação',
      'Farmacia Boa Saude': 'Saúde',
    });

    const [payload] = vi.mocked(GeminiService.categorizeTransactionsBatch).mock.calls[0] ?? [];
    expect(payload?.map(tx => tx.id)).toEqual(['tx_0', 'tx_1']);
    expect(payload?.map(tx => tx.id)).not.toContain('Padaria Central');
    expect(payload?.map(tx => tx.id)).not.toContain('Farmacia Boa Saude');
  });
});

// ─── categorizeTransaction ────────────────────────────────────────────────────

function tx(desc: string, cat: string): Transaction {
  return {
    id: desc, uid: 'u', description: desc, category: cat,
    value_cents: 100 as Centavos, type: 'saida', date: '2026-01-01',
    source: 'manual', schemaVersion: 2,
  } as Transaction;
}

describe('categorizeTransaction', () => {
  it('retorna undefined para descrição vazia ou só espaços', () => {
    expect(categorizeTransaction('', [], [])).toBeUndefined();
    expect(categorizeTransaction('   ', [], [])).toBeUndefined();
  });

  it('aplica regra do usuário quando keyword bate na descrição normalizada', () => {
    const rules: UserCategoryRule[] = [
      { keywords: ['padaria'], category: 'Alimentação' },
    ];
    expect(categorizeTransaction('Padaria Central', [], rules)).toBe('Alimentação');
  });

  it('prioriza regra do usuário sobre histórico', () => {
    const rules: UserCategoryRule[] = [
      { keywords: ['mercado'], category: 'Alimentação' },
    ];
    const history = [tx('Mercado ABC', 'Lazer')];
    expect(categorizeTransaction('Mercado ABC', history, rules)).toBe('Alimentação');
  });

  it('match exato via histórico retorna categoria mais frequente', () => {
    const history = [
      tx('Supermercado ABC', 'Alimentação'),
      tx('Supermercado ABC', 'Alimentação'),
      tx('Supermercado ABC', 'Lazer'),
    ];
    expect(categorizeTransaction('Supermercado ABC', history)).toBe('Alimentação');
  });

  it('match parcial quando descrição contém chave do histórico', () => {
    const history = [tx('uber', 'Transporte')];
    expect(categorizeTransaction('Uber Eats 1234', history)).toBe('Transporte');
  });

  it('keyword fallback do dicionário quando sem histórico nem regras', () => {
    // 'farmacia' está no dicionário de keywords para Saúde
    const result = categorizeTransaction('Farmacia Popular', []);
    expect(result).toBe('Saúde');
  });

  it('retorna undefined quando nada bate', () => {
    expect(categorizeTransaction('XYZABC789', [])).toBeUndefined();
  });

  it('ignora transação do histórico sem description ou category', () => {
    const history = [
      { ...tx('', 'Alimentação'), description: '' },
      { ...tx('XYZNOMATCH99', ''), category: '' },
    ];
    // histórico inválido é ignorado → nenhum match → retorna undefined
    expect(categorizeTransaction('XYZNOMATCH99', history)).toBeUndefined();
  });
});

// ─── applyAICategories ────────────────────────────────────────────────────────

describe('applyAICategories', () => {
  it('aplica categoria do mapa quando descrição bate', () => {
    const txs = [{ description: 'Supermercado', category: 'Outros' }];
    const result = applyAICategories(txs, { Supermercado: 'Alimentação' });
    expect(result[0]!.category).toBe('Alimentação');
  });

  it('mantém categoria original quando descrição não está no mapa', () => {
    const txs = [{ description: 'Desconhecido', category: 'Outros' }];
    const result = applyAICategories(txs, { Supermercado: 'Alimentação' });
    expect(result[0]!.category).toBe('Outros');
  });

  it('retorna array vazio para entrada vazia', () => {
    expect(applyAICategories([], {})).toEqual([]);
  });

  it('não muta os objetos originais', () => {
    const original = [{ description: 'Cafe', category: 'Outros' }];
    const result = applyAICategories(original, { Cafe: 'Alimentação' });
    expect(original[0]!.category).toBe('Outros');
    expect(result[0]!.category).toBe('Alimentação');
  });
});
