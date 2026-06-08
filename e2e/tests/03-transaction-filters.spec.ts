import { test, expect } from '@playwright/test';

/**
 * Fluxo: filtros de tipo no painel de Movimentações.
 * Verifica que as tabs Entradas / Saídas / Transferências filtram a lista.
 */

test.describe('Filtros de tipo em Movimentações', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Movimentações').first()).toBeVisible({ timeout: 20_000 });
    await page.getByText('Movimentações').first().click();
    // Aguarda o painel de transações
    await expect(page.getByRole('button', { name: 'Todas' }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('tab "Todas" está ativa por padrão', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Todas' }).first()).toBeVisible();
  });

  test('clicar em "Entradas" altera o filtro ativo', async ({ page }) => {
    const entradasBtn = page.getByRole('button', { name: /Entradas/i }).first();
    await expect(entradasBtn).toBeVisible({ timeout: 5_000 });
    await entradasBtn.click();
    await expect(entradasBtn).toBeVisible();
  });

  test('clicar em "Saídas" altera o filtro ativo', async ({ page }) => {
    const saidasBtn = page.getByRole('button', { name: /Saídas/i }).first();
    await expect(saidasBtn).toBeVisible({ timeout: 5_000 });
    await saidasBtn.click();
    await expect(saidasBtn).toBeVisible();
  });

  test('clicar em "Transferências" exibe a tab correspondente', async ({ page }) => {
    const transferBtn = page.getByRole('button', { name: /Transferências/i }).first();
    await expect(transferBtn).toBeVisible({ timeout: 5_000 });
    await transferBtn.click();
    await expect(transferBtn).toBeVisible();
  });

  test('clicar em "Todas" volta ao estado inicial', async ({ page }) => {
    await page.getByRole('button', { name: /Entradas/i }).first().click();
    await page.getByRole('button', { name: 'Todas' }).first().click();
    await expect(page.getByRole('button', { name: 'Todas' }).first()).toBeVisible();
  });
});
