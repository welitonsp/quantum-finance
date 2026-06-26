import { test, expect, type Page } from '@playwright/test';
import { clearEmulatorData, countAgentTransactions } from '../helpers/emulator';

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

  test('comando de receita é recusado com segurança e NÃO grava', async ({ page }) => {
    // Decisão de produto: o Agente registra apenas DESPESAS; receita roteia ao formulário.
    // Aqui apenas documentamos a recusa segura (sem proposta, sem escrita).
    await bootApp(page);

    await openChatAndSend(page, 'registre uma receita de R$ 100 de salário hoje');

    // Mensagem de recusa segura no chat; nenhuma sheet de confirmação.
    await expect(page.getByText(/só registro despesas pelo assistente/i).first())
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog', { name: SHEET_TITLE })).toHaveCount(0);

    expect(await countAgentTransactions()).toBe(0);
  });
});
