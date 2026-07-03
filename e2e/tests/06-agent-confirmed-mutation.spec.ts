import { test, expect, type Page } from '@playwright/test';
import { clearEmulatorData, countAgentTransactions, seedAccounts } from '../helpers/emulator';
import { dismissOnboardingIfPresent } from '../helpers/onboarding';

/**
 * Fluxo crítico do Agente Financeiro: mutação CONFIRMADA (FASE H).
 *
 * Protege o ciclo validado manualmente nas trilhas #295–#298:
 *   1. comando imperativo de despesa → PROPOSTA (não gravação imediata);
 *   2. cancelar a proposta → nada é gravado;
 *   3. confirmar a proposta → callable `executeAgentAction` grava em
 *      `users/{uid}/transactions` e a UI reflete via onSnapshot;
 *   4. o texto de sucesso só aparece DEPOIS da callable bem-sucedida.
 *
 * Determinístico e sem LLM real: o caminho exercido é a guarda determinística
 * `interpretMutationCommand` (passo 2 de `AIAssistantChat.submitMessage`), atrás da
 * flag `VITE_ENABLE_AGENT_ROUTER=true` (ligada só no webServer do E2E). O classificador
 * Gemini nunca é chamado. App Check fica gated sob o emulador de functions (#295).
 *
 * Verificação de banco: `countAgentTransactions()` consulta o Firestore Emulator
 * (collectionGroup `transactions`) — fonte de verdade direta, sem depender da UI.
 *
 * Requer emuladores auth+firestore+functions (o CI roda via `firebase emulators:exec
 * --only auth,firestore,functions`).
 */

// Comando imperativo determinístico. A guarda extrai descrição "CafeteriaQuantumE2E"
// e valor R$ 42,00 (4200 centavos), sem qualquer LLM.
const EXPENSE_COMMAND = 'registre uma despesa de R$ 42 em CafeteriaQuantumE2E hoje';
const EXPENSE_DESCRIPTION = 'CafeteriaQuantumE2E';
const SUCCESS_TEXT = 'Compra registrada pelo assistente.';
const SHEET_TITLE = 'Registrar compra';

/** Aguarda o app carregar (auth anônimo concluído). */
async function bootApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Centro de Comando' }).first())
    .toBeVisible({ timeout: 20_000 });
  await dismissOnboardingIfPresent(page);
}

/** Abre o chat e envia um comando. */
async function openChatAndSend(page: Page, command: string): Promise<void> {
  await page.getByTestId('ai-chat-fab').click();
  const input = page.getByPlaceholder('Analise os meus gastos');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(command);
  await input.press('Enter');
}

test.describe('Agente — mutação confirmada (propor → confirmar → gravar)', () => {
  test.beforeEach(async () => {
    // Estado determinístico: zera Auth e Firestore do emulador entre testes.
    await clearEmulatorData();
  });

  test('comando de despesa gera proposta e NÃO grava imediatamente', async ({ page }) => {
    await bootApp(page);
    expect(await countAgentTransactions()).toBe(0);

    await openChatAndSend(page, EXPENSE_COMMAND);

    // Proposta aparece como sheet de confirmação humana (não houve escrita).
    const sheet = page.getByRole('dialog', { name: SHEET_TITLE });
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByRole('button', { name: 'Registrar compra' })).toBeVisible();

    // Regressão-guard nº 1: nenhuma transação foi gravada antes da confirmação.
    expect(await countAgentTransactions()).toBe(0);
    // E o texto de sucesso NÃO pode existir antes de confirmar.
    await expect(page.getByText(SUCCESS_TEXT)).toHaveCount(0);
  });

  test('cancelar a proposta descarta e NÃO cria transação', async ({ page }) => {
    await bootApp(page);

    await openChatAndSend(page, EXPENSE_COMMAND);

    const sheet = page.getByRole('dialog', { name: SHEET_TITLE });
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // Cancelar explicitamente.
    await sheet.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet).toBeHidden({ timeout: 5_000 });

    // Regressão-guard nº 2: cancelar não pode gravar nada.
    expect(await countAgentTransactions()).toBe(0);
    await expect(page.getByText(SUCCESS_TEXT)).toHaveCount(0);

    // E a transação não deve aparecer na LISTA de Movimentações.
    // Escopo em <main>: a descrição também aparece nas mensagens do chat (comando +
    // pergunta), que ficam fora do <main> — a verificação de gravação é só a lista.
    await page.getByRole('button', { name: 'Movimentações' }).first().click();
    await expect(page.getByRole('main').getByText(EXPENSE_DESCRIPTION)).toHaveCount(0);
  });

  test('confirmar a proposta cria a transação e a UI reflete', async ({ page }) => {
    await bootApp(page);

    await openChatAndSend(page, EXPENSE_COMMAND);

    const sheet = page.getByRole('dialog', { name: SHEET_TITLE });
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // Confirmação humana explícita → callable `executeAgentAction`.
    await sheet.getByRole('button', { name: 'Registrar compra' }).click();

    // Regressão-guard nº 4: texto de sucesso só após a callable retornar com sucesso.
    await expect(page.getByText(SUCCESS_TEXT)).toBeVisible({ timeout: 15_000 });

    // Regressão-guard nº 3: exatamente uma transação foi materializada no caminho canônico.
    await expect.poll(async () => countAgentTransactions(), { timeout: 10_000 }).toBe(1);

    // A transação confirmada aparece na LISTA de Movimentações (via onSnapshot).
    // Escopo em <main> para não casar com o eco da descrição nas mensagens do chat.
    await page.getByRole('button', { name: 'Movimentações' }).first().click();
    await expect(page.getByRole('main').getByText(EXPENSE_DESCRIPTION).first())
      .toBeVisible({ timeout: 10_000 });
  });

});

// Comando imperativo de RECEITA (caminho determinístico, sem LLM). A guarda extrai
// descrição "FreelancerQuantumE2E" e valor R$ 500,00 (sem âncora R$, número puro).
const INCOME_COMMAND = 'recebi 500 de FreelancerQuantumE2E hoje';
const INCOME_DESCRIPTION = 'FreelancerQuantumE2E';
const INCOME_SUCCESS_TEXT = 'Receita registrada pelo assistente.';
const INCOME_SHEET_TITLE = 'Registrar receita';

test.describe('Agente — mutação confirmada de RECEITA (propor → confirmar → gravar)', () => {
  test.beforeEach(async () => {
    await clearEmulatorData();
  });

  test('comando de receita gera proposta e NÃO grava imediatamente', async ({ page }) => {
    await bootApp(page);
    expect(await countAgentTransactions()).toBe(0);

    await openChatAndSend(page, INCOME_COMMAND);

    const sheet = page.getByRole('dialog', { name: INCOME_SHEET_TITLE });
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByRole('button', { name: 'Registrar receita' })).toBeVisible();

    // Sem gravação antes de confirmar; sem texto de sucesso.
    expect(await countAgentTransactions()).toBe(0);
    await expect(page.getByText(INCOME_SUCCESS_TEXT)).toHaveCount(0);
  });

  test('cancelar a proposta de receita descarta e NÃO cria transação', async ({ page }) => {
    await bootApp(page);

    await openChatAndSend(page, INCOME_COMMAND);

    const sheet = page.getByRole('dialog', { name: INCOME_SHEET_TITLE });
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    await sheet.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet).toBeHidden({ timeout: 5_000 });

    expect(await countAgentTransactions()).toBe(0);
    await expect(page.getByText(INCOME_SUCCESS_TEXT)).toHaveCount(0);

    await page.getByRole('button', { name: 'Movimentações' }).first().click();
    await expect(page.getByRole('main').getByText(INCOME_DESCRIPTION)).toHaveCount(0);
  });

  test('confirmar a proposta de receita cria a transação e a UI reflete', async ({ page }) => {
    await bootApp(page);

    await openChatAndSend(page, INCOME_COMMAND);

    const sheet = page.getByRole('dialog', { name: INCOME_SHEET_TITLE });
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    await sheet.getByRole('button', { name: 'Registrar receita' }).click();

    // Texto de sucesso só após a callable retornar com sucesso.
    await expect(page.getByText(INCOME_SUCCESS_TEXT)).toBeVisible({ timeout: 15_000 });

    // Exatamente uma transação (de receita) materializada.
    await expect.poll(async () => countAgentTransactions(), { timeout: 10_000 }).toBe(1);

    // A receita aparece na lista de Movimentações (via onSnapshot).
    await page.getByRole('button', { name: 'Movimentações' }).first().click();
    await expect(page.getByRole('main').getByText(INCOME_DESCRIPTION).first())
      .toBeVisible({ timeout: 10_000 });
  });
});

// Comando imperativo de TRANSFERÊNCIA entre contas próprias (caminho determinístico,
// sem LLM). A guarda resolve "Poupança"/"Corrente" → IDs reais via a lista de contas,
// que é seedada no emulador (o executor server valida que ambas existem).
const TRANSFER_COMMAND = 'transfere 500 da Poupança para a Corrente';
const TRANSFER_SHEET_TITLE = 'Registrar transferência';
const TRANSFER_SUCCESS_TEXT = 'Transferência registrada pelo assistente.';

test.describe('Agente — transferência confirmada (propor → confirmar → gravar)', () => {
  test.beforeEach(async () => {
    await clearEmulatorData();
  });

  /**
   * Boota o app e seeda 2 contas. Navega para "Contas" e aguarda os nomes para garantir
   * que o `onSnapshot` de `useAccounts` já populou o estado do React (a guarda de
   * transferência depende da lista de contas estar disponível ao chat) — sem reload,
   * preservando a sessão/uid anônimo do seed.
   */
  async function bootWithAccounts(page: Page): Promise<void> {
    await bootApp(page);
    await seedAccounts([
      { id: 'acc-poupanca-e2e', name: 'Poupança', type: 'poupanca' },
      { id: 'acc-corrente-e2e', name: 'Corrente', type: 'corrente' },
    ]);
    await page.getByRole('button', { name: 'Contas' }).first().click();
    await expect(page.getByRole('main').getByText('Poupança').first())
      .toBeVisible({ timeout: 10_000 });
  }

  test('comando de transferência gera proposta (com nomes) e NÃO grava', async ({ page }) => {
    await bootWithAccounts(page);
    expect(await countAgentTransactions()).toBe(0);

    await openChatAndSend(page, TRANSFER_COMMAND);

    const sheet = page.getByRole('dialog', { name: TRANSFER_SHEET_TITLE });
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByRole('button', { name: 'Transferir' })).toBeVisible();
    // Display hints: a sheet mostra os NOMES das contas (não os IDs crus).
    await expect(sheet.getByText('acc-poupanca-e2e')).toHaveCount(0);

    // Sem gravação antes de confirmar; sem texto de sucesso.
    expect(await countAgentTransactions()).toBe(0);
    await expect(page.getByText(TRANSFER_SUCCESS_TEXT)).toHaveCount(0);
  });

  test('cancelar a transferência descarta e NÃO cria transação', async ({ page }) => {
    await bootWithAccounts(page);

    await openChatAndSend(page, TRANSFER_COMMAND);

    const sheet = page.getByRole('dialog', { name: TRANSFER_SHEET_TITLE });
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    await sheet.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet).toBeHidden({ timeout: 5_000 });

    expect(await countAgentTransactions()).toBe(0);
    await expect(page.getByText(TRANSFER_SUCCESS_TEXT)).toHaveCount(0);
  });

  test('confirmar a transferência cria exatamente 1 transação', async ({ page }) => {
    await bootWithAccounts(page);

    await openChatAndSend(page, TRANSFER_COMMAND);

    const sheet = page.getByRole('dialog', { name: TRANSFER_SHEET_TITLE });
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    await sheet.getByRole('button', { name: 'Transferir' }).click();

    // Texto de sucesso só após a callable `executeAgentAction` retornar com sucesso.
    await expect(page.getByText(TRANSFER_SUCCESS_TEXT)).toBeVisible({ timeout: 15_000 });

    // Exatamente uma transação (de transferência) materializada no caminho canônico.
    await expect.poll(async () => countAgentTransactions(), { timeout: 10_000 }).toBe(1);
  });
});
