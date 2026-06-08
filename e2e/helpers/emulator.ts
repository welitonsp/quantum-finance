/** Helpers para interagir com o Firebase Emulator via REST durante testes E2E. */

const FIRESTORE_BASE = 'http://127.0.0.1:8080/v1/projects/demo-quantum-finance/databases/(default)';

/** Apaga todos os documentos de uma coleção no Emulator. */
export async function clearFirestoreCollection(path: string): Promise<void> {
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/demo-quantum-finance/databases/(default)/documents`,
    { method: 'DELETE' },
  ).catch(() => {}); // ignora se emulator não está rodando
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
