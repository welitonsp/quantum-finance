import { test, expect } from '@playwright/test';

/**
 * Fluxo: importação de arquivo CSV via modal "Ingestão Quântica".
 * O botão de importação fica no Header e está visível no Dashboard (xl+).
 * O processamento real do CSV é coberto por testes unitários (ImportButton.test.tsx).
 */

test.describe('Importação CSV', () => {
  test.beforeEach(async ({ page }) => {
    // O ImportButton está no Header, visível na página de Dashboard
    await page.goto('/');
    await expect(
      page.getByText('Quantum Finance').or(page.getByText('Dashboard')).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test('botão de importação está visível no Header', async ({ page }) => {
    const importBtn = page.locator('[aria-label="Importar ficheiro de extrato"]').first();
    await expect(importBtn).toBeVisible({ timeout: 10_000 });
  });

  test('clicar no botão de importação abre o modal Ingestão Quântica', async ({ page }) => {
    const importBtn = page.locator('[aria-label="Importar ficheiro de extrato"]').first();
    await expect(importBtn).toBeVisible({ timeout: 10_000 });
    await importBtn.click();

    // Modal com título "Ingestão Quântica" deve aparecer
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('modal de importação contém input de arquivo', async ({ page }) => {
    const importBtn = page.locator('[aria-label="Importar ficheiro de extrato"]').first();
    await expect(importBtn).toBeVisible({ timeout: 10_000 });
    await importBtn.click();

    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Input de arquivo deve estar presente dentro do dialog
    await expect(dialog.locator('input[type="file"]').first()).toBeAttached({ timeout: 5_000 });
  });
});
