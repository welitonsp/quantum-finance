/** Helpers para interagir com o Firebase Emulator via REST durante testes E2E. */

const FS_HOST   = 'http://127.0.0.1:8080';
const AUTH_HOST = 'http://127.0.0.1:9099';

// O client usa VITE_FIREBASE_PROJECT_ID: `demo-quantum-finance` no CI (ci.yml) e o
// projeto real localmente (.env). Os endpoints REST do emulador são keyed por projeto,
// então as verificações varrem ambos os candidatos — independentes do ambiente.
const PROJECTS = ['demo-quantum-finance', 'quantum-finance-39235'];

/** Apaga todos os documentos de uma coleção no Emulator (compat — projeto demo). */
export async function clearFirestoreCollection(path: string): Promise<void> {
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/demo-quantum-finance/databases/(default)/documents`,
    { method: 'DELETE' },
  ).catch(() => {}); // ignora se emulator não está rodando
}

/**
 * Reseta Firestore + Auth do emulador para TODOS os projetos candidatos.
 * Garante estado determinístico entre testes seja qual for o `projectId` do client
 * (CI usa `demo-quantum-finance`; local usa o projeto real do `.env`).
 */
export async function clearEmulatorData(): Promise<void> {
  for (const p of PROJECTS) {
    await fetch(`${FS_HOST}/emulator/v1/projects/${p}/databases/(default)/documents`, { method: 'DELETE' })
      .catch(() => {});
    await fetch(`${AUTH_HOST}/emulator/v1/projects/${p}/accounts`, { method: 'DELETE' })
      .catch(() => {});
  }
}

/**
 * Conta as transações (`collectionGroup('transactions')`) no Firestore Emulator,
 * somando os projetos candidatos. É a verificação de nível de banco para
 * "o agente NÃO gravou sem confirmação" e "confirmar gravou exatamente uma".
 *
 * Usa `:runQuery` com `Authorization: Bearer owner` (bypassa as regras no emulador,
 * sem afetar produção) e não depende do `uid` — o estado é zerado a cada teste, então
 * o total de `transactions` no emulador equivale ao do único usuário anônimo.
 */
export async function countAgentTransactions(): Promise<number> {
  let total = 0;
  for (const p of PROJECTS) {
    try {
      const res = await fetch(
        `${FS_HOST}/v1/projects/${p}/databases/(default)/documents:runQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
          body: JSON.stringify({
            structuredQuery: { from: [{ collectionId: 'transactions', allDescendants: true }] },
          }),
        },
      );
      if (!res.ok) continue;
      const rows = (await res.json()) as Array<{ document?: unknown }>;
      if (Array.isArray(rows)) total += rows.filter((r) => r && r.document).length;
    } catch {
      /* ignora projeto inacessível */
    }
  }
  return total;
}

/** Verifica se o Firestore Emulator está acessível. */
export async function isEmulatorReady(): Promise<boolean> {
  try {
    const res = await fetch(`${FIRESTORE_BASE}/documents`, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
