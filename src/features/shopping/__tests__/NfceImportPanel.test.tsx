import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NfceImportPanel from '../components/NfceImportPanel';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const CHAVE_VALIDA = '52260711222333000181650010000001231123456780';

const XML_FIXTURE = `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe${CHAVE_VALIDA}" versao="4.00">
  <ide><mod>65</mod><dhEmi>2026-07-04T10:30:00-03:00</dhEmi></ide>
  <emit><CNPJ>11222333000181</CNPJ><xNome>SUPERMERCADO EXEMPLO LTDA</xNome></emit>
  <det nItem="1"><prod><cProd>001</cProd><xProd>ARROZ TIPO 1 5KG</xProd><uCom>UN</uCom>
    <qCom>2.0000</qCom><vUnCom>21.4500000000</vUnCom><vProd>42.90</vProd></prod></det>
  <det nItem="2"><prod><cProd>002</cProd><xProd>TOMATE KG</xProd><uCom>KG</uCom>
    <qCom>0.7480</qCom><vUnCom>8.9900000000</vUnCom><vProd>6.72</vProd></prod></det>
  <total><ICMSTot><vNF>49.62</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

function setup(onRecord = vi.fn().mockResolvedValue('obs-id')) {
  const onClose = vi.fn();
  render(<NfceImportPanel onClose={onClose} onRecordObservation={onRecord} />);
  return { onClose, onRecord };
}

async function pasteAndAnalyze(content: string) {
  const textarea = screen.getByLabelText(/conteúdo da nfc-e/i);
  // paste é muito mais rápido que type para conteúdo longo
  await userEvent.click(textarea);
  await userEvent.paste(content);
  await userEvent.click(screen.getByRole('button', { name: /analisar/i }));
}

beforeEach(() => vi.clearAllMocks());

describe('NfceImportPanel', () => {
  it('analisa XML colado e mostra a revisão com emitente, chave e itens', async () => {
    setup();
    await pasteAndAnalyze(XML_FIXTURE);

    await waitFor(() => {
      expect(screen.getByText('SUPERMERCADO EXEMPLO LTDA')).toBeInTheDocument();
    });
    expect(screen.getByText(new RegExp(CHAVE_VALIDA))).toBeInTheDocument();
    expect(screen.getByText('ARROZ TIPO 1 5KG')).toBeInTheDocument();
    expect(screen.getByText('TOMATE KG')).toBeInTheDocument();
    // Aviso de divergência: 42,90 + 6,72 = 49,62 == vNF → SEM aviso.
    expect(screen.queryByText(/difere do total/i)).not.toBeInTheDocument();
  });

  it('conteúdo inválido mostra erro e permanece na tela de colagem', async () => {
    const toast = (await import('react-hot-toast')).default;
    setup();
    await pasteAndAnalyze('conteúdo aleatório sem nota');

    expect(toast.error).toHaveBeenCalled();
    expect(screen.getByLabelText(/conteúdo da nfc-e/i)).toBeInTheDocument();
  });

  it('confirmar registra 1 observação por item incluído com store/data da nota', async () => {
    const { onRecord, onClose } = setup();
    await pasteAndAnalyze(XML_FIXTURE);
    await waitFor(() => screen.getByText('SUPERMERCADO EXEMPLO LTDA'));

    await userEvent.click(screen.getByRole('button', { name: /registrar 2 preços/i }));

    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(2));
    const first = onRecord.mock.calls[0]?.[0];
    expect(first).toMatchObject({
      productName: 'ARROZ TIPO 1 5KG',
      store: 'SUPERMERCADO EXEMPLO LTDA',
      unitPriceCents: 2145, // vUnCom 21.4500000000 → exato
      quantity: '2',
      unit: 'un',
      observedAt: '2026-07-04', // data de emissão da nota
    });
    const second = onRecord.mock.calls[1]?.[0];
    expect(second).toMatchObject({
      productName: 'TOMATE KG',
      unitPriceCents: 899,
      quantity: '0.748',
      unit: 'kg',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('item desmarcado não é registrado', async () => {
    const { onRecord } = setup();
    await pasteAndAnalyze(XML_FIXTURE);
    await waitFor(() => screen.getByText('TOMATE KG'));

    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[1]!); // desmarca TOMATE

    await userEvent.click(screen.getByRole('button', { name: /registrar 1 preço/i }));
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
    expect(onRecord.mock.calls[0]?.[0]?.productName).toBe('ARROZ TIPO 1 5KG');
  });

  it('falha em um item não fecha o painel e reporta erro', async () => {
    const toast = (await import('react-hot-toast')).default;
    const onRecord = vi.fn()
      .mockResolvedValueOnce('ok')
      .mockRejectedValueOnce(new Error('permission-denied'));
    const { onClose } = setup(onRecord);
    await pasteAndAnalyze(XML_FIXTURE);
    await waitFor(() => screen.getByText('TOMATE KG'));

    await userEvent.click(screen.getByRole('button', { name: /registrar 2 preços/i }));
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(2));

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/1 item/));
    expect(onClose).not.toHaveBeenCalled();
  });
});
