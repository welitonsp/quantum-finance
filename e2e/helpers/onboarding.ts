import type { Page } from '@playwright/test';

/**
 * O ambiente de E2E não seeda contas/transações por padrão — exatamente a
 * condição que faz o OnboardingWizard aparecer como overlay em tela cheia
 * (`src/components/onboarding/OnboardingWizard.tsx`). Sem dispensá-lo, ele
 * bloqueia cliques em qualquer elemento por trás (z-[100]), fazendo toda
 * interação subsequente expirar no timeout padrão do Playwright.
 *
 * Chamar logo após `page.goto('/')` e antes de qualquer interação com o
 * dashboard. Idempotente — não faz nada se o wizard não estiver visível
 * (ex.: specs que já seedam contas via helpers/emulator.ts).
 */
export async function dismissOnboardingIfPresent(page: Page): Promise<void> {
  const skipButton = page.getByText('Pular por agora');
  try {
    await skipButton.waitFor({ state: 'visible', timeout: 5_000 });
    await skipButton.click();
  } catch {
    // Wizard não apareceu (ex.: spec com contas seedadas via helpers/emulator.ts) — segue normalmente.
  }
}
