import { describe, expect, it, vi } from 'vitest';

// Mocks mínimos para importar o módulo sem tocar Firebase real.
vi.mock('../api/firebase/index', () => ({ db: {}, auth: { currentUser: null }, functions: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), getDocs: vi.fn(), getDoc: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { EXPORTABLE_SUBCOLLECTIONS } from './DataPrivacyService';

describe('F-04 — inventário de export LGPD', () => {
  it('cobre todas as subcoleções de dados do usuário (não só as 10 originais)', () => {
    const list = EXPORTABLE_SUBCOLLECTIONS as readonly string[];
    // Coleções que estavam OMITIDAS antes do F-04 e agora devem constar.
    for (const c of [
      'debts', 'goals', 'scoreHistory', 'challenges', 'consents',
      'dataProcessingLog', 'shoppingLists', 'priceObservations', 'fcmTokens', 'decisions',
    ]) {
      expect(list).toContain(c);
    }
  });

  it('mantém as coleções originais', () => {
    const list = EXPORTABLE_SUBCOLLECTIONS as readonly string[];
    for (const c of ['transactions', 'accounts', 'budgets', 'creditCards', 'recurringTasks']) {
      expect(list).toContain(c);
    }
  });

  it('não duplica entradas', () => {
    const list = EXPORTABLE_SUBCOLLECTIONS as readonly string[];
    expect(new Set(list).size).toBe(list.length);
  });
});
