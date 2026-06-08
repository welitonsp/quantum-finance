import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockGetDocs,
  mockGetDoc,
  mockCollection,
  mockDoc,
  mockCallableDeleteUserData,
  mockHttpsCallable,
} = vi.hoisted(() => {
  const mockGetDocs    = vi.fn().mockResolvedValue({ docs: [] });
  const mockGetDoc     = vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) });
  const mockCollection = vi.fn((_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }));
  const mockDoc        = vi.fn((_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }));

  const mockCallableDeleteUserData = vi.fn().mockResolvedValue({ data: { deleted: true } });
  const mockHttpsCallable = vi.fn().mockReturnValue(mockCallableDeleteUserData);

  return {
    mockGetDocs,
    mockGetDoc,
    mockCollection,
    mockDoc,
    mockCallableDeleteUserData,
    mockHttpsCallable,
  };
});

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc:        mockDoc,
  getDocs:    mockGetDocs,
  getDoc:     mockGetDoc,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: mockHttpsCallable,
}));

vi.mock('../../shared/api/firebase/index', () => ({
  db:        { _isMock: true },
  auth:      { currentUser: { uid: 'test-uid-123' } },
  functions: { _isMock: true },
}));

// ─── Browser API stubs ─────────────────────────────────────────────────────────
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
const mockClick           = vi.fn();

Object.defineProperty(globalThis, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
});

Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
    },
  },
  writable: true,
});

const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  if (tag === 'a') {
    const el = originalCreateElement('a') as HTMLAnchorElement;
    el.click = mockClick;
    return el;
  }
  return originalCreateElement(tag);
});

// ─── Import SUT after mocks are in place ──────────────────────────────────────
import { exportAllUserData, deleteUserAccount } from '../../shared/services/DataPrivacyService';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeDoc(id: string, data: Record<string, unknown> = {}) {
  return { id, ref: { path: `mock/${id}` }, data: () => data };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDocs.mockResolvedValue({ docs: [] });
  mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
  mockCallableDeleteUserData.mockResolvedValue({ data: { deleted: true } });
  mockHttpsCallable.mockReturnValue(mockCallableDeleteUserData);
  mockCreateObjectURL.mockReturnValue('blob:mock-url');
  mockClick.mockReset();
});

// ─── exportAllUserData ────────────────────────────────────────────────────────

describe('exportAllUserData', () => {
  it('dispara o download via URL.createObjectURL e clique no anchor', async () => {
    await exportAllUserData('uid-abc');

    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
    expect(mockClick).toHaveBeenCalledOnce();
  });

  it('não inclui importHash nos dados exportados', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        makeDoc('tx-1', {
          description: 'Aluguel',
          value_cents: 120000,
          importHash: 'SECRET_HASH',
        }),
      ],
    });

    let capturedBlob: Blob | null = null;
    mockCreateObjectURL.mockImplementation((...args: unknown[]) => {
      capturedBlob = args[0] as Blob;
      return 'blob:mock-url';
    });

    await exportAllUserData('uid-abc');

    expect(capturedBlob).not.toBeNull();
    const text = await capturedBlob!.text();
    expect(text).not.toContain('importHash');
    expect(text).not.toContain('SECRET_HASH');
  });

  it('usa apenas o hash curto do uid — nunca o uid em texto claro', async () => {
    let capturedBlob: Blob | null = null;
    mockCreateObjectURL.mockImplementation((...args: unknown[]) => {
      capturedBlob = args[0] as Blob;
      return 'blob:mock-url';
    });

    await exportAllUserData('my-real-uid-value');

    const text = await capturedBlob!.text();
    expect(text).not.toContain('my-real-uid-value');
    const parsed = JSON.parse(text) as { uid_hash: string };
    expect(parsed.uid_hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('inclui exportedAt como string ISO no export', async () => {
    let capturedBlob: Blob | null = null;
    mockCreateObjectURL.mockImplementation((...args: unknown[]) => {
      capturedBlob = args[0] as Blob;
      return 'blob:mock-url';
    });

    await exportAllUserData('uid-abc');

    const parsed = JSON.parse(await capturedBlob!.text()) as { exportedAt: string };
    expect(parsed.exportedAt).toBeTruthy();
    expect(() => new Date(parsed.exportedAt)).not.toThrow();
  });
});

// ─── deleteUserAccount ────────────────────────────────────────────────────────

describe('deleteUserAccount', () => {
  it('chama exportAllUserData antes de deletar (garantia de backup)', async () => {
    const calls: string[] = [];

    mockCreateObjectURL.mockImplementation(() => {
      calls.push('export');
      return 'blob:mock-url';
    });
    mockCallableDeleteUserData.mockImplementation(async () => {
      calls.push('deleteCallable');
      return { data: { deleted: true } };
    });

    await deleteUserAccount('uid-abc');

    expect(calls[0]).toBe('export');
    expect(calls[1]).toBe('deleteCallable');
  });

  it('chama o callable deleteUserData via httpsCallable', async () => {
    await deleteUserAccount('uid-abc');

    expect(mockHttpsCallable).toHaveBeenCalledWith(
      expect.anything(),
      'deleteUserData',
    );
    expect(mockCallableDeleteUserData).toHaveBeenCalledOnce();
  });

  it('propaga REQUIRES_RECENT_LOGIN quando callable retorna unauthenticated', async () => {
    mockCallableDeleteUserData.mockRejectedValueOnce(
      Object.assign(new Error('unauthenticated'), { code: 'functions/unauthenticated' }),
    );

    await expect(deleteUserAccount('uid-abc')).rejects.toThrow('REQUIRES_RECENT_LOGIN');
  });

  it('propaga REQUIRES_RECENT_LOGIN quando auth/requires-recent-login', async () => {
    mockCallableDeleteUserData.mockRejectedValueOnce(
      Object.assign(new Error('requires-recent-login'), { code: 'auth/requires-recent-login' }),
    );

    await expect(deleteUserAccount('uid-abc')).rejects.toThrow('REQUIRES_RECENT_LOGIN');
  });

  it('relança outros erros sem transformação', async () => {
    const genericErr = Object.assign(new Error('network-error'), { code: 'functions/unavailable' });
    mockCallableDeleteUserData.mockRejectedValueOnce(genericErr);

    await expect(deleteUserAccount('uid-abc')).rejects.toThrow('network-error');
  });
});
