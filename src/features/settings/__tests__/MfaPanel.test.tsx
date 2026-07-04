import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MfaPanel from '../MfaPanel';

const mocks = vi.hoisted(() => ({
  currentUser: null as unknown,
  listTotpFactors: vi.fn(() => [] as unknown[]),
  startTotpEnrollment: vi.fn(),
  finalizeTotpEnrollment: vi.fn(),
  unenrollTotpFactor: vi.fn(),
}));

vi.mock('../../../shared/api/firebase/index', () => ({
  get auth() {
    return { currentUser: mocks.currentUser };
  },
}));

vi.mock('../../../shared/lib/mfa', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../shared/lib/mfa')>();
  return {
    ...original,
    listTotpFactors: mocks.listTotpFactors,
    startTotpEnrollment: mocks.startTotpEnrollment,
    finalizeTotpEnrollment: mocks.finalizeTotpEnrollment,
    unenrollTotpFactor: mocks.unenrollTotpFactor,
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

function makeUser(overrides: Record<string, unknown> = {}) {
  return { uid: 'user-1', email: 'a@b.com', isAnonymous: false, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser = makeUser();
  mocks.listTotpFactors.mockReturnValue([]);
});

describe('MfaPanel', () => {
  it('não renderiza nada para usuário anônimo (E2E/emulator)', () => {
    mocks.currentUser = makeUser({ isAnonymous: true });
    const { container } = render(<MfaPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sem fator inscrito: oferece o botão de ativação', () => {
    render(<MfaPanel />);
    expect(
      screen.getByRole('button', { name: /ativar verificação em duas etapas/i }),
    ).toBeInTheDocument();
  });

  it('ativação inicia enrollment e mostra a chave secreta', async () => {
    mocks.startTotpEnrollment.mockResolvedValue({
      secret: { __fake: true },
      secretKey: 'ABC234DEF567',
      otpauthUrl: 'otpauth://totp/Quantum%20Finance:a%40b.com?secret=ABC234DEF567',
    });
    render(<MfaPanel />);
    await userEvent.click(screen.getByRole('button', { name: /ativar verificação/i }));

    await waitFor(() => {
      expect(screen.getByText('ABC234DEF567')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/código do app autenticador/i)).toBeInTheDocument();
  });

  it('confirmação com código válido finaliza o enrollment', async () => {
    mocks.startTotpEnrollment.mockResolvedValue({
      secret: { __fake: true },
      secretKey: 'ABC234DEF567',
      otpauthUrl: 'otpauth://x',
    });
    mocks.finalizeTotpEnrollment.mockResolvedValue(undefined);
    render(<MfaPanel />);
    await userEvent.click(screen.getByRole('button', { name: /ativar verificação/i }));
    await waitFor(() => screen.getByLabelText(/código do app autenticador/i));

    await userEvent.type(screen.getByLabelText(/código do app autenticador/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(mocks.finalizeTotpEnrollment).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'user-1' }),
        { __fake: true },
        '123456',
      );
    });
  });

  it('código com formato inválido não chama finalize', async () => {
    mocks.startTotpEnrollment.mockResolvedValue({
      secret: { __fake: true },
      secretKey: 'ABC234DEF567',
      otpauthUrl: 'otpauth://x',
    });
    render(<MfaPanel />);
    await userEvent.click(screen.getByRole('button', { name: /ativar verificação/i }));
    await waitFor(() => screen.getByLabelText(/código do app autenticador/i));

    await userEvent.type(screen.getByLabelText(/código do app autenticador/i), '12');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(mocks.finalizeTotpEnrollment).not.toHaveBeenCalled();
  });

  it('com fator inscrito: mostra o fator e o botão de desativar', () => {
    mocks.listTotpFactors.mockReturnValue([
      { uid: 'factor-1', displayName: 'App autenticador (TOTP)', factorId: 'totp' },
    ]);
    render(<MfaPanel />);
    expect(screen.getByText('App autenticador (TOTP)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /desativar/i })).toBeInTheDocument();
  });

  it('desativar pede confirmação e chama unenroll', async () => {
    mocks.listTotpFactors.mockReturnValue([
      { uid: 'factor-1', displayName: 'App autenticador (TOTP)', factorId: 'totp' },
    ]);
    mocks.unenrollTotpFactor.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<MfaPanel />);
    await userEvent.click(screen.getByRole('button', { name: /desativar/i }));

    await waitFor(() => {
      expect(mocks.unenrollTotpFactor).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'user-1' }),
        'factor-1',
      );
    });
    confirmSpy.mockRestore();
  });

  it('cancelar no confirm não desativa', async () => {
    mocks.listTotpFactors.mockReturnValue([
      { uid: 'factor-1', displayName: 'App autenticador (TOTP)', factorId: 'totp' },
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<MfaPanel />);
    await userEvent.click(screen.getByRole('button', { name: /desativar/i }));

    expect(mocks.unenrollTotpFactor).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
