import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiService } from '../features/ai-chat/GeminiService';
import { batchCategorizeDescriptions } from './aiCategorize';

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
