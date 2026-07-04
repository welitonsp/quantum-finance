import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PriceIntelligencePanel from '../components/PriceIntelligencePanel';
import type { PriceObservation, ShoppingList } from '../../../shared/types/shopping';

let seq = 0;
function obs(productName: string, store: string, unitPriceCents: number, observedAt: string): PriceObservation {
  seq += 1;
  return {
    id: `o${seq}`, uid: 'u1', productName, store,
    unitPriceCents: unitPriceCents as PriceObservation['unitPriceCents'],
    quantity: '1', unit: 'un', observedAt,
    createdAt: `2026-07-04T00:00:${String(seq).padStart(2, '0')}Z`, schemaVersion: 1,
  };
}

function list(items: Array<{ productName: string; quantity: string }>): ShoppingList {
  return {
    id: 'l1', uid: 'u1', name: 'Compra do mês', status: 'open',
    estimatedTotalCents: 0 as ShoppingList['estimatedTotalCents'],
    items: items.map((it, i) => ({
      id: `i${i}`, productName: it.productName, quantity: it.quantity, unit: 'un',
      estimatedUnitPriceCents: 0, estimatedTotalCents: 0, checked: false, createdAt: '2026-07-01',
    })) as ShoppingList['items'],
    createdAt: '2026-07-01', updatedAt: '2026-07-01', schemaVersion: 1,
  };
}

const OBSERVATIONS = [
  obs('arroz', 'Loja A', 2000, '2026-07-01'),
  obs('arroz', 'Loja B', 2200, '2026-07-01'),
  obs('feijão', 'Loja A', 900, '2026-07-01'),
  obs('feijão', 'Loja B', 800, '2026-07-01'),
  // tendência: leite subiu 10% na Loja A
  obs('leite', 'Loja A', 500, '2026-06-01'),
  obs('leite', 'Loja A', 550, '2026-07-01'),
];

describe('PriceIntelligencePanel', () => {
  it('não renderiza nada sem observações', () => {
    const { container } = render(
      <PriceIntelligencePanel observations={[]} activeList={null} onShowPriceHistory={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('compara a cesta da lista ativa por loja e destaca a mais barata', () => {
    render(
      <PriceIntelligencePanel
        observations={OBSERVATIONS}
        activeList={list([{ productName: 'Arroz', quantity: '2' }, { productName: 'FEIJÃO', quantity: '1' }])}
        onShowPriceHistory={vi.fn()}
      />,
    );

    expect(screen.getByText(/onde comprar/i)).toBeInTheDocument();
    // Loja A: 2×20,00 + 9,00 = 49,00 · Loja B: 2×22,00 + 8,00 = 52,00
    expect(screen.getByText(/R\$\s*49,00/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*52,00/)).toBeInTheDocument();
    expect(screen.getByText(/economia de r\$\s*3,00.*loja a/i)).toBeInTheDocument();
  });

  it('mostra movimentos de preço com percentual em bps formatado', () => {
    render(
      <PriceIntelligencePanel observations={OBSERVATIONS} activeList={null} onShowPriceHistory={vi.fn()} />,
    );
    expect(screen.getByText('Movimentos de preço')).toBeInTheDocument();
    expect(screen.getByText('leite')).toBeInTheDocument();
    expect(screen.getByText(/\+10,00%/)).toBeInTheDocument();
  });

  it('clicar num movimento abre o histórico do produto', async () => {
    const onShow = vi.fn();
    render(
      <PriceIntelligencePanel observations={OBSERVATIONS} activeList={null} onShowPriceHistory={onShow} />,
    );
    await userEvent.click(screen.getByText('leite'));
    expect(onShow).toHaveBeenCalledWith('leite');
  });

  it('sem lista ativa não mostra a seção de cesta, só os movimentos', () => {
    render(
      <PriceIntelligencePanel observations={OBSERVATIONS} activeList={null} onShowPriceHistory={vi.fn()} />,
    );
    expect(screen.queryByText(/onde comprar/i)).not.toBeInTheDocument();
    expect(screen.getByText('Movimentos de preço')).toBeInTheDocument();
  });
});
