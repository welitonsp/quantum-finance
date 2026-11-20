import { test, expect } from '@playwright/test';
import { dismissOnboardingIfPresent } from '../helpers/onboarding';

/**
 * Fluxo: importação de arquivo CSV via modal "Ingestão Quântica".
 * O botão de importação fica no Header e está visível no Dashboard (xl+).
 * O processamento real do CSV é coberto por testes unitários (ImportButton.test.tsx).
 */

test.describe('Importação CSV', () => {
  test.beforeEach(async ({ page }) => {
    // O ImportButton está no Header, visível na página inicial do dashboard.
    await page.goto('/');
    await expect(page.getByText('Saldo em Caixa').first())
      .toBeVisible({ timeout: 20_000 });
    await dismissOnboardingIfPresent(page);
  });

  test('botão de importação está visível no Header', async ({ page }) => {
    const importBtn = page.getByRole('button', { name: 'Importar arquivo de extrato' }).first();
    await expect(importBtn).toBeVisible({ timeout: 10_000 });
  });

  test('clicar no botão de importação abre o modal Ingestão Quântica', async ({ page }) => {
    const importBtn = page.getByRole('button', { name: 'Importar arquivo de extrato' }).first();
    await expect(importBtn).toBeVisible({ timeout: 10_000 });
    await importBtn.click();

    // Modal com título "Ingestão Quântica" deve aparecer.
    await expect(page.getByRole('dialog', { name: 'Ingestão Quântica' }).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test('modal de importação contém input de arquivo', async ({ page }) => {
    const importBtn = page.getByRole('button', { name: 'Importar arquivo de extrato' }).first();
    await expect(importBtn).toBeVisible({ timeout: 10_000 });
    await importBtn.click();

    const dialog = page.getByRole('dialog', { name: 'Ingestão Quântica' }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Input de arquivo deve estar presente dentro do dialog
    await expect(dialog.locator('input[type="file"]').first()).toBeAttached({ timeout: 5_000 });
  });
});
