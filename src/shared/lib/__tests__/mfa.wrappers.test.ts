import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock fino de firebase/auth para exercitar os wrappers de MFA sem SDK real.
const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  generateSecret: vi.fn(),
  getMultiFactorResolver: vi.fn(),
  assertionForEnrollment: vi.fn(() => ({ t: 'enroll' })),
  assertionForSignIn: vi.fn(() => ({ t: 'signin' })),
  state: { enrolledFactors: [] as Array<{ factorId: string; uid: string }> },
}));

vi.mock('firebase/auth', () => ({
  multiFactor: vi.fn(() => ({
    getSession: h.getSession,
    enroll: h.enroll,
    unenroll: h.unenroll,
    get enrolledFactors() {
      return h.state.enrolledFactors;
    },
  })),
  getMultiFactorResolver: h.getMultiFactorResolver,
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    generateSecret: h.generateSecret,
    assertionForEnrollment: h.assertionForEnrollment,
    assertionForSignIn: h.assertionForSignIn,
  },
  TotpSecret: class {},
}));

import {
  listTotpFactors,
  startTotpEnrollment,
  finalizeTotpEnrollment,
  unenrollTotpFactor,
  resolveTotpSignIn,
  TOTP_DISPLAY_NAME,
} from '../mfa';
import type { Auth, MultiFactorError, TotpSecret, User } from 'firebase/auth';

const user = (over: Partial<User> = {}): User =>
  ({ uid: 'u1', email: 'user@example.com', isAnonymous: false, ...over }) as User;

beforeEach(() => {
  vi.clearAllMocks();
  h.state.enrolledFactors = [];
});

describe('listTotpFactors', () => {
  it('retorna vazio para usuário anônimo', () => {
    expect(listTotpFactors(user({ isAnonymous: true }))).toEqual([]);
  });

  it('filtra apenas fatores TOTP', () => {
    h.state.enrolledFactors = [
      { factorId: 'totp', uid: 'f1' },
      { factorId: 'phone', uid: 'f2' },
    ];
    const factors = listTotpFactors(user());
    expect(factors).toHaveLength(1);
    expect(factors[0]!.uid).toBe('f1');
  });
});

describe('startTotpEnrollment', () => {
  it('gera segredo e URI otpauth usando o email como accountName', async () => {
    const generateQrCodeUrl = vi.fn(() => 'otpauth://totp/Quantum');
    h.getSession.mockResolvedValue('sess');
    h.generateSecret.mockResolvedValue({ secretKey: 'BASE32KEY', generateQrCodeUrl });

    const r = await startTotpEnrollment(user());
    expect(r.secretKey).toBe('BASE32KEY');
    expect(r.otpauthUrl).toBe('otpauth://totp/Quantum');
    expect(generateQrCodeUrl).toHaveBeenCalledWith('user@example.com', 'Quantum Finance');
  });

  it('usa o uid como accountName quando não há email', async () => {
    const generateQrCodeUrl = vi.fn(() => 'otpauth://x');
    h.getSession.mockResolvedValue('sess');
    h.generateSecret.mockResolvedValue({ secretKey: 'K', generateQrCodeUrl });

    await startTotpEnrollment(user({ email: null }));
    expect(generateQrCodeUrl).toHaveBeenCalledWith('u1', 'Quantum Finance');
  });
});

describe('finalizeTotpEnrollment', () => {
  const secret = {} as TotpSecret;

  it('rejeita código com formato inválido', async () => {
    await expect(finalizeTotpEnrollment(user(), secret, '12')).rejects.toThrow(
      'invalid_totp_code_format',
    );
    expect(h.enroll).not.toHaveBeenCalled();
  });

  it('efetiva o fator com código válido e display name padrão', async () => {
    h.enroll.mockResolvedValue(undefined);
    await finalizeTotpEnrollment(user(), secret, '123 456');
    expect(h.assertionForEnrollment).toHaveBeenCalledWith(secret, '123456');
    expect(h.enroll).toHaveBeenCalledWith({ t: 'enroll' }, TOTP_DISPLAY_NAME);
  });
});

describe('unenrollTotpFactor', () => {
  it('remove o fator pelo uid', async () => {
    h.unenroll.mockResolvedValue(undefined);
    await unenrollTotpFactor(user(), 'factor-uid');
    expect(h.unenroll).toHaveBeenCalledWith('factor-uid');
  });
});

describe('resolveTotpSignIn', () => {
  const auth = {} as Auth;
  const err = {} as MultiFactorError;

  it('rejeita código com formato inválido', async () => {
    await expect(resolveTotpSignIn(auth, err, 'abc')).rejects.toThrow(
      'invalid_totp_code_format',
    );
  });

  it('lança quando não há fator TOTP inscrito no resolver', async () => {
    h.getMultiFactorResolver.mockReturnValue({ hints: [{ factorId: 'phone', uid: 'p1' }] });
    await expect(resolveTotpSignIn(auth, err, '123456')).rejects.toThrow(
      'no_totp_factor_enrolled',
    );
  });

  it('conclui o sign-in com o fator TOTP', async () => {
    const resolveSignIn = vi.fn().mockResolvedValue('credential');
    h.getMultiFactorResolver.mockReturnValue({
      hints: [{ factorId: 'totp', uid: 'h1' }],
      resolveSignIn,
    });
    const cred = await resolveTotpSignIn(auth, err, '123456');
    expect(cred).toBe('credential');
    expect(h.assertionForSignIn).toHaveBeenCalledWith('h1', '123456');
    expect(resolveSignIn).toHaveBeenCalledWith({ t: 'signin' });
  });
});
