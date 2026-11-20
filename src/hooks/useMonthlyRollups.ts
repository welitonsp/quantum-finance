import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../shared/api/firebase';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import {
  EMPTY_ROLLUP_STATE,
  ROLLUP_META_DOC_ID,
  anyNeedsRebuild,
  parseMonthRollup,
  type MonthRollup,
  type RollupState,
} from '../lib/monthlyRollups';

// Uma reconstrução automática por uid por carga da página: o servidor limita a
// 10/dia; aqui evitamos que re-renders ou snapshots repetidos gastem a cota.
const rebuildAttempted = new Set<string>();

/** Só para testes. */
export function __resetRollupRebuildGuard(): void {
  rebuildAttempted.clear();
}

/**
 * Assina users/{uid}/rollups (P-01). Dispara rebuildMonthlyRollups uma vez
 * quando o histórico ainda não foi reconstruído (_meta ausente e há
 * transações) ou quando algum mês está com needsRebuild.
 */
export function useMonthlyRollups(uid: string | null | undefined, hasTransactions: boolean): RollupState {
  const [state, setState] = useState<RollupState>(EMPTY_ROLLUP_STATE);
  const [hasMeta, setHasMeta] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setState(EMPTY_ROLLUP_STATE);
    setHasMeta(false);
    setLoaded(false);
    if (!uid) return undefined;

    return onSnapshot(
      collection(db, 'users', uid, 'rollups'),
      (snap) => {
        const months: Record<string, MonthRollup> = {};
        let meta = false;
        snap.forEach((docSnap) => {
          if (docSnap.id === ROLLUP_META_DOC_ID) {
            meta = true;
            return;
          }
          const parsed = parseMonthRollup(docSnap.id, docSnap.data());
          if (parsed) months[parsed.month] = parsed;
        });
        setHasMeta(meta);
        setLoaded(true);
        setState({ ready: meta, months });
      },
      (error) => {
        // Sem rollups o app segue no cálculo legado (fallback), sem bloquear a UI.
        logSanitizedFirebaseError('financial_metrics_compute', error);
        setState(EMPTY_ROLLUP_STATE);
      },
    );
  }, [uid]);

  useEffect(() => {
    if (!uid || !loaded) return;
    const needsBackfill = (!hasMeta && hasTransactions) || anyNeedsRebuild(state);
    if (!needsBackfill || rebuildAttempted.has(uid)) return;
    rebuildAttempted.add(uid);
    const rebuild = httpsCallable(functions, 'rebuildMonthlyRollups', { timeout: 300_000 });
    // O resultado chega pelo próprio onSnapshot; falha mantém o fallback legado.
    rebuild({}).catch((error: unknown) => logSanitizedFirebaseError('financial_metrics_compute', error));
  }, [uid, loaded, hasMeta, hasTransactions, state]);

  return state;
}
