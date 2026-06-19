import { describe, it, expect } from 'vitest';
import {
  renderAgentResponse,
  assertNoLiteralFinancials,
  LiteralFinancialError,
  PlaceholderError,
} from './agentResponseRenderer';

describe('agentResponseRenderer — pipes', () => {
  it('|brl formata centavos como BRL', () => {
    const out = renderAgentResponse('Sobra {{limite|brl}}.', { limite: 123456 });
    expect(out).toContain('R$');
    expect(out).toContain('1.234,56');
  });

  it('|pct aceita fração (0.30 → 30%)', () => {
    expect(renderAgentResponse('Uso de {{u|pct}}.', { u: 0.3 })).toBe('Uso de 30%.');
  });

  it('|pct aceita já-percentual (52.5 → 53%)', () => {
    expect(renderAgentResponse('Uso de {{u|pct}}.', { u: 52.5 })).toBe('Uso de 53%.');
  });

  it('|date formata YYYY-MM-DD como DD/MM/YYYY', () => {
    expect(renderAgentResponse('Vence {{d|date}}.', { d: '2025-07-15' })).toBe('Vence 15/07/2025.');
  });

  it('|mes formata YYYY-MM como Mmm/YYYY', () => {
    expect(renderAgentResponse('Fatura {{c|mes}}.', { c: '2025-07' })).toBe('Fatura Jul/2025.');
  });

  it('resolve múltiplos placeholders na mesma string', () => {
    const out = renderAgentResponse(
      'Compra de {{price|brl}} compromete {{u|pct}} a partir de {{c|mes}}.',
      { price: 400000, u: 0.28, c: '2025-08' },
    );
    expect(out).toBe('Compra de R$ 4.000,00 compromete 28% a partir de Ago/2025.');
  });
});

describe('agentResponseRenderer — rejeição de número literal', () => {
  it('rejeita R$ literal do LLM', () => {
    expect(() => renderAgentResponse('Vai sobrar R$ 412,00.', {}))
      .toThrow(LiteralFinancialError);
  });

  it('rejeita percentual literal do LLM', () => {
    expect(() => renderAgentResponse('Compromete 28% da renda.', {}))
      .toThrow(LiteralFinancialError);
  });

  it('rejeita decimal monetário literal do LLM', () => {
    expect(() => renderAgentResponse('O valor é 1234,56 hoje.', {}))
      .toThrow(LiteralFinancialError);
  });

  it('NÃO rejeita números via placeholder válido (BRL tem separador, mas é gerado)', () => {
    // O valor formatado contém "1.234,56", mas vem de placeholder → permitido.
    expect(() => renderAgentResponse('Sobra {{v|brl}}.', { v: 123456 })).not.toThrow();
  });

  it('assertNoLiteralFinancials passa em texto sem números financeiros', () => {
    expect(() => assertNoLiteralFinancials('A compra cabe no seu limite.')).not.toThrow();
  });

  it('permite inteiros simples sem cara de moeda (ex.: parcelas)', () => {
    expect(() => renderAgentResponse('Em 10 parcelas.', {})).not.toThrow();
  });
});

describe('agentResponseRenderer — placeholders ausentes/ inválidos', () => {
  it('lança PlaceholderError quando a chave não está no contexto', () => {
    expect(() => renderAgentResponse('Sobra {{ausente|brl}}.', {}))
      .toThrow(PlaceholderError);
  });

  it('lança PlaceholderError para |date mal formada', () => {
    expect(() => renderAgentResponse('Vence {{d|date}}.', { d: '15/07/2025' }))
      .toThrow(PlaceholderError);
  });

  it('lança PlaceholderError para |mes mal formada', () => {
    expect(() => renderAgentResponse('Fatura {{c|mes}}.', { c: '2025' }))
      .toThrow(PlaceholderError);
  });
});
