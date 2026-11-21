import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  listTotpFactors: vi.fn(),
  startTotpEnrollment: vi.fn(),
  finalizeTotpEnrollment: vi.fn(),
  unenrollTotpFactor: vi.fn(),
}));
vi.mock('../../shared/api/supabase/auth', () => ({
  ...api,
  normalizeTotpCode: (raw: string) => (/^\d{6}$/.test(raw.replace(/\s+/g, '')) ? raw.replace(/\s+/g, '') : null),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import MfaPanelSupabase from './MfaPanelSupabase';

describe('MfaPanelSupabase', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it('ativa o TOTP: mostra QR e chave, confirma o código e lista o fator', async () => {
    api.listTotpFactors.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'f1', friendlyName: 'App autenticador (TOTP)' }]);
    api.startTotpEnrollment.mockResolvedValue({ factorId: 'f1', qrCodeSvg: '<svg/>', secretKey: 'ABC123', otpauthUrl: 'otpauth://x' });
    api.finalizeTotpEnrollment.mockResolvedValue(undefined);

    render(<MfaPanelSupabase />);
    fireEvent.click(await screen.findByText('Ativar verificação em duas etapas'));
    expect(await screen.findByText('ABC123')).toBeInTheDocument();
    expect(screen.getByAltText('QR code para o app autenticador')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Código do app autenticador'), { target: { value: '123 456' } });
    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() => expect(api.finalizeTotpEnrollment).toHaveBeenCalledWith('f1', '123 456'));
    expect(await screen.findByText('App autenticador (TOTP)')).toBeInTheDocument();
  });

  it('código mal formado não chama o servidor e cancelar remove o fator pendente', async () => {
    api.listTotpFactors.mockResolvedValue([]);
    api.startTotpEnrollment.mockResolvedValue({ factorId: 'f9', qrCodeSvg: '<svg/>', secretKey: 'K', otpauthUrl: 'otpauth://x' });
    api.unenrollTotpFactor.mockResolvedValue(undefined);

    render(<MfaPanelSupabase />);
    fireEvent.click(await screen.findByText('Ativar verificação em duas etapas'));
    await screen.findByText('K');
    fireEvent.change(screen.getByLabelText('Código do app autenticador'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('Confirmar'));
    expect(api.finalizeTotpEnrollment).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(api.unenrollTotpFactor).toHaveBeenCalledWith('f9'));
    expect(await screen.findByText('Ativar verificação em duas etapas')).toBeInTheDocument();
  });
});
