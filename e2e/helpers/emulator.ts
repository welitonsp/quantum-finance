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

/**
 * Descobre o uid e o projeto ativo do usuário anônimo logado no Auth Emulator.
 * Varre os projetos candidatos (CI usa `demo-quantum-finance`; local usa o real).
 *
 * Usa o endpoint Identity Toolkit `accounts:query` (POST + `Bearer owner`) — o
 * `GET /emulator/.../accounts` retorna 405. Faz retry leve porque o registro do
 * usuário anônimo pode propagar logo após o `signInAnonymously` do app.
 */
export async function getAnonUser(): Promise<{ project: string; uid: string } | null> {
  const users = await getAnonUsers();
  return users[0] ?? null;
}

/**
 * Lista todos os usuários anônimos encontrados nos projetos candidatos do emulador.
 * Em execuções locais o app pode usar `quantum-finance-39235`; no CI, `demo-quantum-finance`.
 * Alguns emuladores também disparam eventos no projeto demo, então os seeds precisam cobrir
 * todos os candidatos encontrados para manter os testes determinísticos.
 */
export async function getAnonUsers(): Promise<Array<{ project: string; uid: string }>> {
  const users: Array<{ project: string; uid: string }> = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const p of PROJECTS) {
      try {
        const res = await fetch(
          `${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${p}/accounts:query`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
            body: JSON.stringify({}),
          },
        );
        if (!res.ok) continue;
        const data = (await res.json()) as { userInfo?: Array<{ localId?: string }> };
        for (const u of data.userInfo ?? []) {
          if (u.localId && !users.some((known) => known.project === p && known.uid === u.localId)) {
            users.push({ project: p, uid: u.localId });
          }
        }
      } catch {
        /* ignora projeto inacessível */
      }
    }
    if (users.length > 0) return users;
    await new Promise((r) => setTimeout(r, 400));
  }
  return users;
}

export interface SeedAccount {
  id: string;
  name: string;
  type?: string;
}

/**
 * Cria contas em `users/{uid}/accounts/{id}` para o usuário anônimo ativo, usando a
 * REST do Firestore Emulator com `Bearer owner` (bypassa rules no emulador, sem afetar
 * produção). Necessário para o E2E de transferência: o executor server valida que ambas
 * as contas existem, e a guarda determinística resolve nome → ID a partir delas.
 * Campos espelham `useAccounts` (schemaVersion 2, balance em centavos inteiros).
 */
export async function seedAccounts(accounts: SeedAccount[]): Promise<void> {
  const users = await getAnonUsers();
  if (users.length === 0) throw new Error('[seedAccounts] usuário anônimo não encontrado no Auth Emulator.');
  const uids = Array.from(new Set(users.map((u) => u.uid)));

  for (const project of PROJECTS) {
    for (const uid of uids) {
      for (const a of accounts) {
        const url = `${FS_HOST}/v1/projects/${project}/databases/(default)/documents/users/${uid}/accounts/${a.id}`;
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
          body: JSON.stringify({
            fields: {
              name:          { stringValue: a.name },
              type:          { stringValue: a.type ?? 'corrente' },
              balance:       { integerValue: '0' },
              schemaVersion: { integerValue: '2' },
            },
          }),
        });
        if (!res.ok) {
          throw new Error(`[seedAccounts] falha ao criar conta ${a.id}: HTTP ${res.status}`);
        }
      }
    }
  }
}

/**
 * Concede o consentimento de IA (`users/{uid}/consents/current.ai = true`) para o
 * usuário anônimo ativo. Necessário desde o UI mirror do F-01: sem consentimento o
 * `AiConsentGate` substitui o chat/telas de IA pelo aviso LGPD (o gate server-side
 * `assertAiConsent` já era fail-closed; o E2E do Agente usa o caminho determinístico,
 * mas a UI do chat agora exige o espelho do consentimento).
 */
export async function seedAiConsent(): Promise<void> {
  const users = await getAnonUsers();
  if (users.length === 0) throw new Error('[seedAiConsent] usuário anônimo não encontrado no Auth Emulator.');
  const uids = Array.from(new Set(users.map((u) => u.uid)));

  for (const project of PROJECTS) {
    for (const uid of uids) {
      const url = `${FS_HOST}/v1/projects/${project}/databases/(default)/documents/users/${uid}/consents/current`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({
          fields: {
            ai:        { booleanValue: true },
            analytics: { booleanValue: false },
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`[seedAiConsent] falha ao gravar consentimento: HTTP ${res.status}`);
      }
    }
  }
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
