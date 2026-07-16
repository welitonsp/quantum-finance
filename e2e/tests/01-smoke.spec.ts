import { test, expect } from '@playwright/test';
import { dismissOnboardingIfPresent } from '../helpers/onboarding';

/**
 * Smoke tests: verifica que a app carrega e os elementos principais são visíveis.
 * Requer: Firebase Auth Emulator (9099) + Firestore Emulator (8080) + Vite dev (5173).
 */

test.describe('Smoke — carregamento da app', () => {
  test('app carrega e exibe o dashboard sem erros visíveis', async ({ page }) => {
    await page.goto('/');

    // Aguarda a app sair do estado de loading (auth + data)
    await expect(page.getByRole('heading', { name: 'Hoje' }).first())
      .toBeVisible({ timeout: 20_000 });

    // Nenhum erro 500 ou tela branca
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('sidebar exibe os itens de navegação principais', async ({ page }) => {
    await page.goto('/');
    await dismissOnboardingIfPresent(page);

    await expect(page.getByRole('button', { name: 'Hoje' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Movimentações' }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('navegar para Movimentações exibe o painel de transações', async ({ page }) => {
    await page.goto('/');
    await dismissOnboardingIfPresent(page);

    await page.getByRole('button', { name: 'Movimentações' }).first().click();

    // Aguarda o painel de movimentações
    await expect(
      page.getByText('Todas').or(page.getByText('Entradas')).or(page.getByText('Saídas')).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
