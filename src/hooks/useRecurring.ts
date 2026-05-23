import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import { generateSafeOperationId } from '../shared/lib/operationTrace';
import { toCentavos, fromCentavos } from '../shared/schemas/financialSchemas';
import { FirestoreService } from '../shared/services/FirestoreService';
import { AuditService, type AuditChange } from '../shared/services/AuditService';
import type { RecurringTask } from '../shared/types/transaction';

interface UseRecurringReturn {
  recurringTasks: RecurringTask[];
  loading: boolean;
  error: string | null;
  addRecurring: (data: Omit<RecurringTask, 'id'>) => Promise<string | undefined>;
  updateRecurring: (id: string, data: Partial<RecurringTask>) => Promise<void>;
  removeRecurring: (id: string) => Promise<void>;
}

type RecurringHistoryAction = 'CREATE' | 'UPDATE' | 'DELETE';

const RECURRING_HISTORY_FIELDS = [
  'description',
  'value_cents',
  'type',
  'category',
  'dueDay',
  'active',
  'frequency',
  'schemaVersion',
  'createdAt',
  'updatedAt',
] as const;

type RecurringHistoryField = typeof RECURRING_HISTORY_FIELDS[number];

const RECURRING_HISTORY_CHANGED_FIELDS: RecurringHistoryField[] = [
  'description',
  'value_cents',
  'type',
  'category',
  'dueDay',
  'active',
  'frequency',
  'schemaVersion',
];

export function useRecurring(uid: string): UseRecurringReturn {
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const recurringTasksRef                   = useRef<RecurringTask[]>([]);

  useEffect(() => {
    if (!uid) { setRecurringTasks([]); setLoading(false); return; }

    setLoading(true);
    const colRef = FirestoreService.getRecurringCollection(uid);

    const unsubscribe = onSnapshot(colRef,
      (snapshot) => {
        const data: RecurringTask[] = snapshot.docs.map(docSnap => ({
          ...(docSnap.data() as Omit<RecurringTask, 'id' | 'value'>),
          value: docSnap.data()['value'] !== undefined ? fromCentavos(docSnap.data()['value'] as number) : 0,
          id: docSnap.id
        }));
        recurringTasksRef.current = data;
        setRecurringTasks(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logSanitizedFirebaseError('recurring_load', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const addRecurring = useCallback(async (data: Omit<RecurringTask, 'id'>) => {
    if (!uid) return;
    const colRef = FirestoreService.getRecurringCollection(uid);
    const taskRef = doc(colRef);
    const timestamp = serverTimestamp();
    const correlationId = generateSafeOperationId('op');
    const finalData = {
      ...data,
      value:         toCentavos(data.value),
      schemaVersion: 2,
      createdAt:     timestamp,
      updatedAt:     timestamp,
    };
    const after = sanitizeRecurringForHistory(finalData);
    const batch = writeBatch(db);

    batch.set(taskRef, finalData);
    batch.set(doc(db, 'users', uid, 'recurringTasks', taskRef.id, 'history', 'create'), {
      ...buildRecurringHistory('CREATE', taskRef.id, correlationId),
      after,
      changedFields: computeRecurringChangedFields({}, after),
    });
    await batch.commit();

    void AuditService.logAction({
      userId: uid,
      action: 'ADD_RECURRING',
      entity: 'RECURRING_TASK',
      details: typeof data.description === 'string' ? String(data.description).slice(0, 160) : 'Nova tarefa recorrente',
    });
    return taskRef.id;
  }, [uid]);

  const updateRecurring = useCallback(async (id: string, data: Partial<RecurringTask>): Promise<void> => {
    if (!uid || !id) return;
    const finalData: Record<string, unknown> = { ...data };
    if (data.value !== undefined) finalData['value'] = toCentavos(data.value);
    finalData['updatedAt'] = serverTimestamp();
    const correlationId = generateSafeOperationId('op');
    finalData['_lastOpId'] = correlationId;
    delete finalData['id'];
    delete finalData['uid'];
    const taskRef = doc(db, 'users', uid, 'recurringTasks', id);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) return;
    const before = sanitizeRecurringForHistory(snap.data());
    const after = sanitizeRecurringForHistory({ ...snap.data(), ...finalData });
    const batch = writeBatch(db);

    batch.update(taskRef, finalData);
    batch.set(doc(db, 'users', uid, 'recurringTasks', id, 'history', correlationId), {
      ...buildRecurringHistory('UPDATE', id, correlationId),
      before,
      after,
      changedFields: computeRecurringChangedFields(before, after),
    });
    await batch.commit();

    const current  = recurringTasksRef.current.find(t => t.id === id);
    const changes: AuditChange[] = Object.keys(data)
      .filter(k => k !== 'id')
      .map(k => ({
        id:   k,
        from: String(current?.[k as keyof RecurringTask] ?? '').slice(0, 200),
        to:   String(data[k as keyof Partial<RecurringTask>] ?? '').slice(0, 200),
      }));
    const changedKeys = Object.keys(data).join(',').slice(0, 200);
    void AuditService.logAction({
      userId: uid,
      action: 'UPDATE_RECURRING',
      entity: 'RECURRING_TASK',
      details: `id:${id.slice(0, 80)} fields:${changedKeys}`.slice(0, 500),
      ...(changes.length > 0 ? { metadata: { count: changes.length, changes } } : {}),
    });
  }, [uid]);

  const removeRecurring = useCallback(async (id: string) => {
    if (!uid || !id) return;
    const taskRef = doc(db, 'users', uid, 'recurringTasks', id);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) return;
    const correlationId = generateSafeOperationId('op');
    const before = sanitizeRecurringForHistory(snap.data());
    const batch = writeBatch(db);

    batch.set(doc(db, 'users', uid, 'recurringTasks', id, 'history', 'delete'), {
      ...buildRecurringHistory('DELETE', id, correlationId),
      before,
      changedFields: RECURRING_HISTORY_CHANGED_FIELDS.filter(field => field in before),
    });
    batch.delete(taskRef);
    await batch.commit();

    void AuditService.logAction({
      userId: uid,
      action: 'DELETE_RECURRING',
      entity: 'RECURRING_TASK',
      details: id.slice(0, 160),
    });
  }, [uid]);

  return { recurringTasks, loading, error, addRecurring, updateRecurring, removeRecurring };
}

function buildRecurringHistory(
  action: RecurringHistoryAction,
  recurringTaskId: string,
  correlationId: string,
): Record<string, unknown> {
  return {
    action,
    recurringTaskId,
    origin:        'manual',
    correlationId,
    createdAt:     serverTimestamp(),
    schemaVersion: 1,
  };
}

export function sanitizeRecurringForHistory(task: Record<string, unknown>): Record<string, unknown> {
  const source = { ...task };
  if (source['value_cents'] === undefined && typeof source['value'] === 'number') {
    source['value_cents'] = source['value'];
  }

  return RECURRING_HISTORY_FIELDS.reduce<Record<string, unknown>>((snapshot, field) => {
    if (source[field] !== undefined) snapshot[field] = source[field];
    return snapshot;
  }, {});
}

export function computeRecurringChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): RecurringHistoryField[] {
  return RECURRING_HISTORY_CHANGED_FIELDS.filter(field => {
    const beforeValue = before[field];
    const afterValue = after[field];
    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
  });
}
