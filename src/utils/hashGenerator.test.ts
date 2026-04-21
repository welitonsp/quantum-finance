import { describe, it, expect } from 'vitest';
import { generateTransactionHash } from './hashGenerator';

describe('hashGenerator — deduplicação determinística', () => {
  const baseTx = { date: '2026-04-20', value: 1050, description: 'Supermercado ABC' };

  it('é determinístico — mesmo input produz mesmo hash', () => {
    const h1 = generateTransactionHash(baseTx);
    const h2 = generateTransactionHash({ ...baseTx });
    expect(h1).toBe(h2);
  });

  it('normaliza case e espaços na descrição', () => {
    const h1 = generateTransactionHash(baseTx);
    const h2 = generateTransactionHash({ ...baseTx, description: '  SUPERMERCADO ABC  ' });
    const h3 = generateTransactionHash({ ...baseTx, description: 'Supermercado Abc' });
    expect(h1).toBe(h2);
    expect(h1).toBe(h3);
  });

  it('normaliza a data para YYYY-MM-DD (primeiros 10 chars)', () => {
    const h1 = generateTransactionHash(baseTx);
    const h2 = generateTransactionHash({ ...baseTx, date: '2026-04-20T23:59:59.999Z' });
    expect(h1).toBe(h2);
  });

  it('hashes diferentes quando valor muda (mesmo que por 1 centavo)', () => {
    const h1 = generateTransactionHash(baseTx);
    const h2 = generateTransactionHash({ ...baseTx, value: 1051 });
    expect(h1).not.toBe(h2);
  });

  it('hashes diferentes quando data muda', () => {
    const h1 = generateTransactionHash(baseTx);
    const h2 = generateTransactionHash({ ...baseTx, date: '2026-04-21' });
    expect(h1).not.toBe(h2);
  });

  it('hashes diferentes quando descrição (normalizada) muda', () => {
    const h1 = generateTransactionHash(baseTx);
    const h2 = generateTransactionHash({ ...baseTx, description: 'Padaria XYZ' });
    expect(h1).not.toBe(h2);
  });

  it('tolera acentos e caracteres UTF-8', () => {
    const tx = { date: '2026-04-20', value: 500, description: 'Educação — Curso André' };
    expect(() => generateTransactionHash(tx)).not.toThrow();
    expect(generateTransactionHash(tx)).toBe(generateTransactionHash({ ...tx }));
  });

  it('produz hashes não-vazios (base64)', () => {
    const h = generateTransactionHash(baseTx);
    expect(h.length).toBeGreaterThan(0);
    expect(() => atob(h)).not.toThrow();
  });

  it('trata valor 0 e descrição vazia sem explodir', () => {
    const h = generateTransactionHash({ date: '2026-04-20', value: 0, description: '' });
    expect(typeof h).toBe('string');
  });
});
