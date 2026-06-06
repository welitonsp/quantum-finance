import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT_ID    = 'demo-quantum-finance';

/** Limpa todos os usuários do Auth Emulator entre testes. */
export async function clearAuthEmulator(): Promise<void> {
  await fetch(
    `${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' },
  ).catch(() => { /* emulator pode não estar rodando em CI sem setup */ });
}

/** Aguarda o app carregar e o usuário estar autenticado (anônimo via emulator). */
export async function waitForApp(page: Page): Promise<void> {
  await page.goto('/');
  // O auto-login anônimo dispara via onAuthStateChanged + VITE_USE_EMULATOR
  // Aguarda a sidebar ou o dashboard aparecer (sinal de auth OK)
  await expect(page.locator('[data-testid="sidebar"], nav, [class*="sidebar"]').first())
    .toBeVisible({ timeout: 15_000 })
    .catch(async () => {
      // fallback: aguarda qualquer elemento principal do app
      await expect(page.locator('main, [class*="dashboard"], [class*="content"]').first())
        .toBeVisible({ timeout: 10_000 });
    });
}
