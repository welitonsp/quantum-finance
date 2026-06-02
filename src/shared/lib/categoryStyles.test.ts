import { describe, it, expect } from 'vitest';
import {
  getCategoryBadgeClass,
  getCategoryMeta,
  CATEGORY_BADGE_CLASSES,
  CATEGORY_META,
} from './categoryStyles';

describe('getCategoryBadgeClass', () => {
  it('retorna a classe para categoria conhecida', () => {
    expect(getCategoryBadgeClass('Alimentação')).toBe(CATEGORY_BADGE_CLASSES['Alimentação']);
  });

  it('retorna fallback para categoria desconhecida (linha 70)', () => {
    const fallback = CATEGORY_BADGE_CLASSES['Diversos']!;
    expect(getCategoryBadgeClass('Categoria Inexistente')).toBe(fallback);
  });

  it('retorna fallback customizado quando fornecido', () => {
    const customFallback = 'custom-class';
    expect(getCategoryBadgeClass('Inexistente', customFallback)).toBe(customFallback);
  });

  it('retorna fallback quando category é undefined', () => {
    const fallback = CATEGORY_BADGE_CLASSES['Diversos']!;
    expect(getCategoryBadgeClass(undefined)).toBe(fallback);
  });
});

describe('getCategoryMeta', () => {
  it('retorna meta para categoria conhecida', () => {
    const meta = getCategoryMeta('Alimentação');
    expect(meta).toBeDefined();
    expect(meta).toBe(CATEGORY_META['Alimentação']);
  });

  it('retorna meta de Outros para categoria desconhecida (linha 74)', () => {
    expect(getCategoryMeta('Categoria Inexistente')).toBe(CATEGORY_META['Outros']);
  });

  it('retorna meta de Outros para undefined', () => {
    expect(getCategoryMeta(undefined)).toBe(CATEGORY_META['Outros']);
  });
});
