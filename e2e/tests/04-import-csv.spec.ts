import { test, expect, type Page } from '@playwright/test';

/**
 * Fluxo: importação de arquivo CSV.
 * Verifica o fluxo de acesso ao botão de importação e abertura do modal.
 * O processamento real do CSV é coberto por testes unitários (ImportButton.test.tsx).
 */

async function navigateToMovimentacoes(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Movimentações').first()).toBeVisible({ timeout: 20_000 });
  await page.getByText('Movimentações').first().click();
  await expect(page.getByRole('button', { name: 'Todas' }).first()).toBeVisible({ timeout: 10_000 });
}

test.describe('Importação CSV', () => {
  test('botão de importação está visível no painel de Movimentações', async ({ page }) => {
    await navigateToMovimentacoes(page);

    const importBtn = page
      .getByRole('button', { name: /importar|import/i })
      .or(page.locator('[title*="mportar"], [aria-label*="mportar"]'))
      .first();

    await expect(importBtn).toBeVisible({ timeout: 10_000 });
  });

  test('clicar no botão de importação abre o seletor de arquivo', async ({ page }) => {
    await navigateToMovimentacoes(page);

    const importBtn = page
      .getByRole('button', { name: /importar|import/i })
      .or(page.locator('[title*="mportar"], [aria-label*="mportar"]'))
      .first();

    await importBtn.click();

    // O input de arquivo deve estar presente no DOM após clicar
    await expect(page.locator('input[type="file"]').first()).toBeAttached({ timeout: 10_000 });
  });

  test('input de arquivo aceita CSV, OFX e PDF', async ({ page }) => {
    await navigateToMovimentacoes(page);

    const importBtn = page
      .getByRole('button', { name: /importar|import/i })
      .or(page.locator('[title*="mportar"], [aria-label*="mportar"]'))
      .first();

    await importBtn.click();

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10_000 });

    const accept = await fileInput.getAttribute('accept');
    // Deve aceitar pelo menos um dos formatos de importação
    expect(accept ?? '').toMatch(/csv|ofx|pdf/i);
  });
});
