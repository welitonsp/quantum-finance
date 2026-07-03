import { describe, it, expect } from 'vitest';
import { generateHash, generateTransactionHash } from './hashGenerator';

describe('generateHash — chave de memo estável (djb2)', () => {
  it('é determinístico — mesmo array de partes produz o mesmo hash', () => {
    const h1 = generateHash(['tx-1', '1000', '2026-04-20']);
    const h2 = generateHash(['tx-1', '1000', '2026-04-20']);
    expect(h1).toBe(h2);
  });

  it('produz hashes diferentes para conteúdos diferentes', () => {
    const h1 = generateHash(['tx-1', '1000']);
    const h2 = generateHash(['tx-2', '1000']);
    expect(h1).not.toBe(h2);
  });

  it('é sensível à ordem das partes', () => {
    const h1 = generateHash(['a', 'b']);
    const h2 = generateHash(['b', 'a']);
    expect(h1).not.toBe(h2);
  });

  it('trata array vazio sem lançar', () => {
    expect(() => generateHash([])).not.toThrow();
    expect(typeof generateHash([])).toBe('string');
  });

  it('retorna string em base36 (só dígitos e a-z)', () => {
    const h = generateHash(['tx-1', '2500', '2026-04-20']);
    expect(h).toMatch(/^[0-9a-z]+$/);
  });

  it('permanece estável para uma lista grande de partes (exercita todo o loop)', () => {
    const parts = Array.from({ length: 50 }, (_, i) => `tx-${i}-${i * 137}`);
    const h1 = generateHash(parts);
    const h2 = generateHash([...parts]);
    expect(h1).toBe(h2);
  });
});

describe('hashGenerator — deduplicação determinística (generateTransactionHash)', () => {
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
