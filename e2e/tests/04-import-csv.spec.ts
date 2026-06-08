import { test, expect, type Page } from '@playwright/test';

/**
 * Fluxo: importação de arquivo CSV.
 * Verifica o fluxo de abertura do modal de importação e presença do input de arquivo.
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

  test('clicar no botão de importação abre o modal', async ({ page }) => {
    await navigateToMovimentacoes(page);

    const importBtn = page
      .getByRole('button', { name: /importar|import/i })
      .or(page.locator('[title*="mportar"], [aria-label*="mportar"]'))
      .first();

    await importBtn.click();

    // Modal de importação deve abrir
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('modal de importação contém input de arquivo', async ({ page }) => {
    await navigateToMovimentacoes(page);

    const importBtn = page
      .getByRole('button', { name: /importar|import/i })
      .or(page.locator('[title*="mportar"], [aria-label*="mportar"]'))
      .first();

    await importBtn.click();

    // Aguarda o dialog abrir
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Input de arquivo deve estar presente dentro do dialog
    await expect(dialog.locator('input[type="file"]').first()).toBeAttached({ timeout: 5_000 });
  });
});
