import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDoc, mockOnSnapshot, mockLog } = vi.hoisted(() => ({
  mockDoc:        vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
  mockOnSnapshot: vi.fn(),
  mockLog:        vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
}));

vi.mock('../shared/api/firebase/index', () => ({ db: { _isMock: true } }));
vi.mock('../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));

import { useAiConsent } from './useAiConsent';

/** Instala um snapshot bem-sucedido com o payload informado (undefined → doc inexistente). */
function withSnapshot(data: Record<string, unknown> | undefined) {
  mockOnSnapshot.mockImplementation((_ref: unknown, onNext: (s: unknown) => void) => {
    onNext({ exists: () => data !== undefined, data: () => data });
    return () => {};
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  withSnapshot(undefined);
});

describe('useAiConsent', () => {
  it('sem uid não assina e encerra loading com aiGranted false', async () => {
    const { result } = renderHook(() => useAiConsent(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.aiGranted).toBe(false);
  });

  it('doc com ai:true → aiGranted true', async () => {
    withSnapshot({ ai: true });
    const { result } = renderHook(() => useAiConsent('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.aiGranted).toBe(true);
  });

  it('doc com ai:false → aiGranted false', async () => {
    withSnapshot({ ai: false });
    const { result } = renderHook(() => useAiConsent('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.aiGranted).toBe(false);
  });

  it('doc inexistente → aiGranted false', async () => {
    withSnapshot(undefined);
    const { result } = renderHook(() => useAiConsent('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.aiGranted).toBe(false);
  });

  it('erro no snapshot registra log sanitizado e mantém fail-closed', async () => {
    mockOnSnapshot.mockImplementation((_ref: unknown, _n: unknown, onErr: (e: unknown) => void) => {
      onErr(new Error('perm denied'));
      return () => {};
    });
    const { result } = renderHook(() => useAiConsent('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLog).toHaveBeenCalledWith('ai_consent_read', expect.any(Error));
    expect(result.current.aiGranted).toBe(false);
  });
});
