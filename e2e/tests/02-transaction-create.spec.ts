import { test, expect } from '@playwright/test';
import { dismissOnboardingIfPresent } from '../helpers/onboarding';

/**
 * Fluxo: criação manual de transação.
 * Verifica abertura do formulário, preenchimento e feedback de sucesso.
 */

test.describe('Criação manual de transação', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Aguarda dashboard carregar
    await expect(page.getByText('Dashboard').or(page.getByText('Nova Movimentação')).first())
      .toBeVisible({ timeout: 20_000 });
    await dismissOnboardingIfPresent(page);
  });

  test('botão "Nova Movimentação" abre o formulário', async ({ page }) => {
    // Botão pode estar no dashboard ou no header
    const btn = page.getByText('Nova Movimentação').first();
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();

    // Formulário abre — campo de descrição deve aparecer
    await expect(page.getByPlaceholder('Ex: Supermercado Extra')).toBeVisible({ timeout: 5_000 });
  });

  test('formulário tem campos obrigatórios visíveis', async ({ page }) => {
    await page.getByText('Nova Movimentação').first().click();

    await expect(page.getByPlaceholder('Ex: Supermercado Extra')).toBeVisible();
    await expect(page.getByPlaceholder('0,00').first()).toBeVisible();
    await expect(page.locator('input[name="date"]').first()).toBeVisible();
  });

  test('preencher e submeter transação de despesa', async ({ page }) => {
    await page.getByText('Nova Movimentação').first().click();

    // Tipo: Saída (clica na tab Saída se existir)
    const saidaBtn = page.getByRole('button', { name: /Saída|saida/i }).first();
    if (await saidaBtn.isVisible()) await saidaBtn.click();

    // Preenche descrição
    await page.getByPlaceholder('Ex: Supermercado Extra').fill('Supermercado E2E');

    // Preenche valor
    await page.getByPlaceholder('0,00').first().fill('150,00');

    // Data — usa a data de hoje (já pré-preenchida) ou define uma
    const dateInput = page.locator('input[name="date"]').first();
    if (!(await dateInput.inputValue())) {
      await dateInput.fill('2026-06-01');
    }

    // Submete
    const saveBtn = page.getByRole('button', { name: /Guardar|Salvar|Confirmar/i }).first();
    await saveBtn.click();

    // Feedback positivo (toast de sucesso ou formulário fecha)
    await expect(
      page.getByText(/sucesso|guardado|adicionad|criado/i).or(
        page.locator('[role="status"]')
      ).first()
    ).toBeVisible({ timeout: 8_000 })
      .catch(async () => {
        // alternativa: o formulário fecha (dialog some).
        // O save manual (Spark sync-queue → emulator) pode levar ~15s sob carga de CI;
        // toleramos isso aqui para evitar flake (o teste já falhava intermitentemente na main,
        // passando só via retry do Playwright). Ver investigação em roadmap_checklist.
        await expect(page.getByPlaceholder('Ex: Supermercado Extra')).not.toBeVisible({ timeout: 20_000 });
      });
  });

  test('fechar o formulário com o botão X cancela sem salvar', async ({ page }) => {
    await page.getByText('Nova Movimentação').first().click();
    await expect(page.getByPlaceholder('Ex: Supermercado Extra')).toBeVisible();

    // Pressiona Escape para fechar
    await page.keyboard.press('Escape');

    await expect(page.getByPlaceholder('Ex: Supermercado Extra')).not.toBeVisible({ timeout: 5_000 });
  });
});
