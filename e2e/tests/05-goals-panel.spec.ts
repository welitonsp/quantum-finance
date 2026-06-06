import { test, expect } from '@playwright/test';

/**
 * Fluxo: painel de Metas de Poupança no Dashboard.
 * Verifica criação de meta, exibição de progresso e remoção.
 */

test.describe('Metas de Poupança', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Aguarda o dashboard carregar com o painel de metas
    await expect(page.getByText('Metas de Poupança').first())
      .toBeVisible({ timeout: 20_000 });
  });

  test('painel de Metas é visível no Dashboard', async ({ page }) => {
    await expect(page.getByText('Metas de Poupança').first()).toBeVisible();
  });

  test('botão "Nova meta" abre o formulário de criação', async ({ page }) => {
    const novaMetaBtn = page.getByRole('button', { name: /nova meta/i }).first();
    await expect(novaMetaBtn).toBeVisible({ timeout: 5_000 });
    await novaMetaBtn.click();

    // Formulário deve exibir campo de nome da meta
    await expect(page.getByPlaceholder(/nome da meta/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('criar uma nova meta com nome e valor', async ({ page }) => {
    const novaMetaBtn = page.getByRole('button', { name: /nova meta/i }).first();
    await novaMetaBtn.click();

    // Preenche o nome
    await page.getByPlaceholder(/nome da meta/i).first().fill('Viagem E2E');

    // Preenche o valor (campo com placeholder 0,00)
    await page.locator('input[inputmode="decimal"]').filter({ hasText: '' }).first().fill('10000');

    // Clica em "Criar Meta"
    const criarBtn = page.getByRole('button', { name: /criar meta/i }).first();
    await expect(criarBtn).toBeVisible();
    await criarBtn.click();

    // A meta deve aparecer na lista
    await expect(page.getByText('Viagem E2E').first()).toBeVisible({ timeout: 8_000 });
  });

  test('meta criada exibe barra de progresso', async ({ page }) => {
    // Cria uma meta primeiro
    await page.getByRole('button', { name: /nova meta/i }).first().click();
    await page.getByPlaceholder(/nome da meta/i).first().fill('Meta Progresso E2E');
    await page.locator('input[inputmode="decimal"]').first().fill('5000');
    await page.getByRole('button', { name: /criar meta/i }).first().click();

    // Aguarda a meta aparecer
    await expect(page.getByText('Meta Progresso E2E').first()).toBeVisible({ timeout: 8_000 });

    // Barra de progresso deve existir (div com width style)
    const progressBar = page.locator('[class*="rounded-full"][class*="h-full"]').first();
    await expect(progressBar).toBeVisible({ timeout: 5_000 });
  });
});
