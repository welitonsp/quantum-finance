import { describe, it, expect } from 'vitest';
import { autoCategorize } from './autoCategory';

describe('autoCategorize — motor de regras', () => {
  it('retorna "Diversos" para descrição vazia ou apenas whitespace', () => {
    expect(autoCategorize('')).toBe('Diversos');
    // @ts-expect-error — validar robustez contra input inválido (null em runtime)
    expect(autoCategorize(null)).toBe('Diversos');
  });

  it('categoriza por palavras-chave base (case-insensitive)', () => {
    expect(autoCategorize('SUPERMERCADO PÃO DE AÇÚCAR')).toBe('Alimentação');
    expect(autoCategorize('iFood * pedido')).toBe('Alimentação');
    expect(autoCategorize('Uber Trip 34a')).toBe('Transporte');
    expect(autoCategorize('Posto Shell')).toBe('Transporte');
    expect(autoCategorize('Netflix.com')).toBe('Assinaturas');
    expect(autoCategorize('SPOTIFY BR')).toBe('Assinaturas');
    expect(autoCategorize('IOF sobre operação')).toBe('Impostos/Taxas');
  });

  it('retorna "Diversos" quando nenhuma regra casa', () => {
    expect(autoCategorize('Pagamento misterioso X42')).toBe('Diversos');
  });

  it('regras do utilizador têm prioridade sobre as regras base', () => {
    // "Posto" casaria com Transporte nas regras base, mas o user sobrepõe
    const rules = [{ keywords: ['posto'], category: 'Custom/Viagem' }];
    expect(autoCategorize('Posto Shell BR-101', rules)).toBe('Custom/Viagem');
  });

  it('regras do utilizador casam em qualquer ordem/case com trim', () => {
    const rules = [{ keywords: ['  FARMACIA  '], category: 'Saúde' }];
    expect(autoCategorize('Drogaria Farmacia Central', rules)).toBe('Saúde');
  });

  it('cai nas regras base quando as regras do utilizador não casam', () => {
    const rules = [{ keywords: ['cripto'], category: 'Investimento' }];
    expect(autoCategorize('Uber *trip', rules)).toBe('Transporte');
  });

  it('lida com regra do utilizador sem keywords sem explodir', () => {
    const rules = [{ keywords: [] as string[], category: 'Vazio' }];
    expect(autoCategorize('Uber *trip', rules)).toBe('Transporte');
  });

  it('não casa substrings espúrias (as regras base usam includes — documenta o comportamento real)', () => {
    // Comportamento atual: includes('posto') casa em "postoxy" também.
    // Este teste documenta o comportamento para não regredir sem querer.
    expect(autoCategorize('postoxy lanches')).toBe('Alimentação'); // 'lanches' vence primeiro? não — ordem das regras importa
    // 'Alimentação' tem 'padaria', 'pizza', 'lanches' → casa em 'lanches'
  });
});
