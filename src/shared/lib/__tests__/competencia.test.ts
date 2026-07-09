import { describe, expect, it } from 'vitest';
import { computeCompetencia } from '../competencia';

describe('computeCompetencia — contrato canônico de competência', () => {
  describe('sem closingDay (undefined) — competência = mês da compra + índice', () => {
    it('parcela 0 fica no mês da compra', () => {
      expect(computeCompetencia('2026-03-15', undefined, 0)).toBe('2026-03');
    });

    it('soma o índice de parcela em meses', () => {
      expect(computeCompetencia('2026-03-15', undefined, 2)).toBe('2026-05');
    });

    it('rola o ano ao ultrapassar dezembro', () => {
      expect(computeCompetencia('2026-11-10', undefined, 3)).toBe('2027-02');
    });
  });

  describe('regra dia > closingDay (fechamento inclui o próprio dia)', () => {
    it('compra ANTES do fechamento fica na fatura corrente', () => {
      expect(computeCompetencia('2026-03-05', 10, 0)).toBe('2026-03');
    });

    it('compra EXATAMENTE no dia de fechamento fica na fatura corrente (boundary)', () => {
      expect(computeCompetencia('2026-03-10', 10, 0)).toBe('2026-03');
    });

    it('compra DEPOIS do fechamento cai na próxima fatura', () => {
      expect(computeCompetencia('2026-03-11', 10, 0)).toBe('2026-04');
    });

    it('deslocamento de fechamento rola o ano (dezembro → janeiro)', () => {
      expect(computeCompetencia('2026-12-20', 10, 0)).toBe('2027-01');
    });
  });

  describe('combinação fechamento + parcelas', () => {
    it('aplica o deslocamento de fechamento e depois soma as parcelas', () => {
      // dia 20 > closingDay 10 → base abril; +2 parcelas → junho
      expect(computeCompetencia('2026-03-20', 10, 2)).toBe('2026-06');
    });
  });

  describe('closingDay fora do intervalo 1–31 é ignorado', () => {
    it('closingDay 0 não desloca', () => {
      expect(computeCompetencia('2026-03-31', 0, 0)).toBe('2026-03');
    });

    it('closingDay 32 não desloca', () => {
      expect(computeCompetencia('2026-03-31', 32, 0)).toBe('2026-03');
    });
  });

  describe('entradas malformadas usam fallback determinístico', () => {
    it('data vazia: Number("")=0 → ano 0, mês 1 (comportamento documentado)', () => {
      // O fallback `?? 2000` só cobre `undefined`; '' vira 0 por Number(''),
      // então o resultado é '0-01'. Teste trava o comportamento real.
      expect(computeCompetencia('', undefined, 0)).toBe('0-01');
    });

    it('data sem dia usa dia 1 (não desloca com closingDay alto)', () => {
      expect(computeCompetencia('2026-07', 15, 0)).toBe('2026-07');
    });
  });
});
