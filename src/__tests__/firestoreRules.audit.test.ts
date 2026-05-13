// @vitest-environment node
/// <reference types="node" />
//
// Testes automatizados de Firestore Security Rules — FASE 5A-2B
//
// Cobrem payloads válidos e inválidos para:
//   - users/{uid}/transactions/{txId}/history
//   - users/{uid}/audit_logs
//   - proteção de importHash em transactions
//
// Requerem Firebase Emulator (Firestore) em execução.
// Executar via: npm run test:rules
//
// Quando FIRESTORE_EMULATOR_HOST não está definido, todos os testes são pulados
// e a suíte regular (npm run test -- --run) permanece inalterada.

import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

// ─── Configuração do emulador ─────────────────────────────────────────────────

const EMULATOR_HOST = process.env['FIRESTORE_EMULATOR_HOST'];

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const UID_A = 'user-alice';
const UID_B = 'user-bob';
const TX_REAL = 'tx-real-001';
const EXISTING_HISTORY_ID = 'existing-history-001';
const EXISTING_AUDIT_ID = 'existing-audit-001';
const FIXED_TS = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
const IMPORT_HASH_A = 'a'.repeat(64);
const IMPORT_HASH_B = 'b'.repeat(64);

const validHistoryPayload = () => ({
  action: 'UPDATE' as const,
  txId: TX_REAL,
  createdAt: serverTimestamp(),
  schemaVersion: 1,
  origin: 'manual',
  amount_cents: 10000,
  category: 'Alimentação',
});

const validAuditPayload = () => ({
  action: 'IMPORT_TRANSACTION' as const,
  entity: 'TRANSACTION' as const,
  createdAt: serverTimestamp(),
  schemaVersion: 2,
  source: 'csv',
  amount_cents: 50000,
  details: 'Imported 5 transactions',
});

// ─── Suíte principal ──────────────────────────────────────────────────────────

describe.skipIf(!EMULATOR_HOST)('Firestore Security Rules', () => {
  let testEnv!: RulesTestEnvironment;

  beforeAll(async () => {
    const parts = EMULATOR_HOST!.split(':');
    const host = parts[0] ?? 'localhost';
    const port = parseInt(parts[1] ?? '8080', 10);
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: 'demo-quantum-finance',
      firestore: { rules, host, port },
    });

    await testEnv.clearFirestore();

    // Pré-cria documentos necessários para os testes de update/delete (regras bloqueadas).
    // withSecurityRulesDisabled contorna as rules para setup de dados de teste.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();

      // history doc para testes A6 (update) e A7 (delete)
      await setDoc(
        doc(db, 'users', UID_A, 'transactions', TX_REAL, 'history', EXISTING_HISTORY_ID),
        { action: 'CREATE', txId: TX_REAL, schemaVersion: 1, createdAt: FIXED_TS },
      );

      // audit_log doc para testes B12 (update) e B13 (delete)
      await setDoc(
        doc(db, 'users', UID_A, 'audit_logs', EXISTING_AUDIT_ID),
        { action: 'IMPORT_TRANSACTION', entity: 'TRANSACTION', schemaVersion: 2, createdAt: FIXED_TS },
      );

      // transaction com importHash para teste C15 (proteção de importHash)
      await setDoc(
        doc(db, 'users', UID_A, 'transactions', TX_REAL),
        {
          description: 'Test transaction',
          value_cents: 10000,
          schemaVersion: 2,
          type: 'saida',
          category: 'Alimentação',
          date: '2026-01-01',
          source: 'csv',
          importHash: IMPORT_HASH_A,
          createdAt: FIXED_TS,
          updatedAt: FIXED_TS,
        },
      );
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  // ── A. transactions/{txId}/history ──────────────────────────────────────────

  describe('A. transactions/{txId}/history', () => {
    // A1: baseline UPDATE + origin='manual' continua aceito (FASE 5D mantém UPDATE/manual)
    it('A1 — UPDATE + manual baseline pelo owner deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertSucceeds(addDoc(ref, validHistoryPayload()));
    });

    // A2: txId do payload difere do txId do path → isValidTransactionHistory(data, txId) falha
    it('A2 — txId divergente deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertFails(addDoc(ref, { ...validHistoryPayload(), txId: 'tx-falso' }));
    });

    // A3: action fora da whitelist → isValidHistoryAction falha
    it('A3 — action inválida deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertFails(addDoc(ref, { ...validHistoryPayload(), action: 'HACK' as never }));
    });

    // A4: origin fora da whitelist → isValidHistoryOrigin falha
    it('A4 — origin inválida deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertFails(addDoc(ref, { ...validHistoryPayload(), origin: 'forged' }));
    });

    // A5a: before com campo proibido 'id' → isValidHistorySnapshot falha
    it('A5a — before com campo proibido (id) deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertFails(addDoc(ref, {
        ...validHistoryPayload(),
        before: { id: 'forbidden-id', description: 'Test' },
      }));
    });

    // A5b: after com campo proibido 'uid' → isValidHistorySnapshot falha
    it('A5b — after com campo proibido (uid) deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertFails(addDoc(ref, {
        ...validHistoryPayload(),
        after: { uid: 'user-abc', description: 'Test' },
      }));
    });

    // A5c: after com campo proibido 'value' → isValidHistorySnapshot falha
    it('A5c — after com campo proibido (value) deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertFails(addDoc(ref, {
        ...validHistoryPayload(),
        after: { value: 123.45, description: 'Test' },
      }));
    });

    // A5d: after com campo proibido 'importHash' → isValidHistorySnapshot falha
    it('A5d — after com campo proibido (importHash) deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertFails(addDoc(ref, {
        ...validHistoryPayload(),
        after: { importHash: IMPORT_HASH_A, description: 'Test' },
      }));
    });

    // A6: allow update: if false → sempre bloqueado
    it('A6 — UPDATE em history deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const histDocRef = doc(
        alice.firestore(),
        'users', UID_A, 'transactions', TX_REAL, 'history', EXISTING_HISTORY_ID,
      );
      await assertFails(updateDoc(histDocRef, { action: 'UPDATE' }));
    });

    // A7: allow delete: if false → sempre bloqueado
    it('A7 — DELETE em history deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const histDocRef = doc(
        alice.firestore(),
        'users', UID_A, 'transactions', TX_REAL, 'history', EXISTING_HISTORY_ID,
      );
      await assertFails(deleteDoc(histDocRef));
    });

    // A8: isOwner(UID_B) → request.auth.uid (UID_A) != UID_B → falha
    it('A8 — usuário A não pode criar history no path do usuário B', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const bobRef = collection(
        alice.firestore(),
        'users', UID_B, 'transactions', TX_REAL, 'history',
      );
      await assertFails(addDoc(bobRef, validHistoryPayload()));
    });

    // A8b: origin='ai' (autocategorização) deve ser aceita pelo owner
    it('A8b — origin ai deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertSucceeds(addDoc(ref, {
        ...validHistoryPayload(),
        action: 'UPDATE' as const,
        origin: 'ai',
        before: { category: 'Outros' },
        after:  { category: 'Alimentação' },
        changedFields: ['category'],
      }));
    });

    // A9: transação pai não existe → exists() falha
    it('A9 — history para transação inexistente deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(
        alice.firestore(),
        'users', UID_A, 'transactions', 'tx-does-not-exist-999', 'history',
      );
      await assertFails(addDoc(ref, {
        ...validHistoryPayload(),
        txId: 'tx-does-not-exist-999',
      }));
    });

    // A10: CREATE + origin='manual' isolado deve falhar.
    // Criação manual Spark exige transaction + history/create no mesmo writeBatch.
    it('A10 — CREATE + manual isolado deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertFails(addDoc(ref, {
        action: 'CREATE' as const,
        txId: TX_REAL,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        amount_cents: 10000,
        category: 'Alimentação',
      }));
    });

    // A11 (FASE 5D): UPDATE + origin='reconcile' (fluxo de conciliação no import) deve passar.
    it('A11 — UPDATE + reconcile deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertSucceeds(addDoc(ref, {
        ...validHistoryPayload(),
        action: 'UPDATE' as const,
        origin: 'reconcile',
        before: { category: 'Outros' },
        after:  { category: 'Mercado' },
        changedFields: ['category'],
      }));
    });

    // A12 (FASE 5D): SOFT_DELETE + origin='manual' (delete/batch delete manual) deve passar.
    it('A12 — SOFT_DELETE + manual deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertSucceeds(addDoc(ref, {
        ...validHistoryPayload(),
        action: 'SOFT_DELETE' as const,
        origin: 'manual',
        before: { description: 'Alimento', value_cents: 10000 },
      }));
    });

    // A13 (FASE 5D): BULK_UPDATE + origin='bulk' (bulk de categoria) deve passar.
    it('A13 — BULK_UPDATE + bulk deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertSucceeds(addDoc(ref, {
        ...validHistoryPayload(),
        action: 'BULK_UPDATE' as const,
        origin: 'bulk',
        correlationId: 'batch-001',
        before: { category: 'Outros' },
        after:  { category: 'Mercado' },
        changedFields: ['category'],
      }));
    });
  });

  // ── B. users/{uid}/audit_logs ────────────────────────────────────────────────

  describe('B. users/{uid}/audit_logs', () => {
    // B9: payload IMPORT_TRANSACTION mínimo válido
    it('B9 — IMPORT_TRANSACTION válido pelo owner deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertSucceeds(addDoc(ref, validAuditPayload()));
    });

    // B10: payload BULK_UPDATE com details e metadata válidos
    it('B10 — BULK_UPDATE válido deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertSucceeds(addDoc(ref, {
        action: 'BULK_UPDATE' as const,
        entity: 'TRANSACTION' as const,
        createdAt: serverTimestamp(),
        schemaVersion: 2,
        details: 'Updated 3 categories',
        metadata: { count: 3, changes: [] as never[] },
      }));
    });

    // B11: action fora da whitelist → isValidAuditAction falha
    it('B11 — action inválida deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertFails(addDoc(ref, { ...validAuditPayload(), action: 'HACK' as never }));
    });

    // B12: allow update: if false → sempre bloqueado
    it('B12 — UPDATE em audit_logs deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const auditDocRef = doc(alice.firestore(), 'users', UID_A, 'audit_logs', EXISTING_AUDIT_ID);
      await assertFails(updateDoc(auditDocRef, { action: 'HACK' }));
    });

    // B13: allow delete: if false → sempre bloqueado
    it('B13 — DELETE em audit_logs deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const auditDocRef = doc(alice.firestore(), 'users', UID_A, 'audit_logs', EXISTING_AUDIT_ID);
      await assertFails(deleteDoc(auditDocRef));
    });

    // B14: isOwner(UID_B) → request.auth.uid (UID_A) != UID_B → falha
    it('B14 — usuário A não pode criar audit_log no path do usuário B', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const bobRef = collection(alice.firestore(), 'users', UID_B, 'audit_logs');
      await assertFails(addDoc(bobRef, validAuditPayload()));
    });

    // B15: nova action ADD_RECURRING com entity RECURRING_TASK deve passar
    it('B15 — ADD_RECURRING válido deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertSucceeds(addDoc(ref, {
        action: 'ADD_RECURRING' as const,
        entity: 'RECURRING_TASK' as const,
        createdAt: serverTimestamp(),
        schemaVersion: 2,
        details: 'Aluguel mensal',
      }));
    });

    // B16: entity lowercase ('transaction') antes aceita (variante morta), agora recusada
    it('B16 — entity lowercase (antes aceita, agora recusada) deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertFails(addDoc(ref, {
        action: 'BULK_UPDATE' as const,
        entity: 'transaction' as never,
        createdAt: serverTimestamp(),
        schemaVersion: 2,
      }));
    });

    // B17: UPDATE_RECURRING com entity RECURRING_TASK deve passar
    it('B17 — UPDATE_RECURRING válido deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertSucceeds(addDoc(ref, {
        action: 'UPDATE_RECURRING' as const,
        entity: 'RECURRING_TASK' as const,
        createdAt: serverTimestamp(),
        schemaVersion: 2,
        details: 'id:task-123 fields:description,value',
      }));
    });

    // B18: DELETE_RECURRING com entity RECURRING_TASK deve passar
    it('B18 — DELETE_RECURRING válido deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertSucceeds(addDoc(ref, {
        action: 'DELETE_RECURRING' as const,
        entity: 'RECURRING_TASK' as const,
        createdAt: serverTimestamp(),
        schemaVersion: 2,
        details: 'id:task-456',
      }));
    });

    // B19a (FASE 6C-1): entity fora da whitelist deve falhar (isValidAuditEntity).
    it('B19a — ADD_RECURRING com entity inválida deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertFails(addDoc(ref, {
        action: 'ADD_RECURRING' as const,
        entity: 'OTHER' as never,
        createdAt: serverTimestamp(),
        schemaVersion: 2,
        details: 'forjado',
      }));
    });

    // B19b (FASE 6C-1): cross-uid em recorrentes — alice tentando logar no path de bob.
    it('B19b — UPDATE_RECURRING no path de outro uid deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const bobRef = collection(alice.firestore(), 'users', UID_B, 'audit_logs');
      await assertFails(addDoc(bobRef, {
        action: 'UPDATE_RECURRING' as const,
        entity: 'RECURRING_TASK' as const,
        createdAt: serverTimestamp(),
        schemaVersion: 2,
        details: 'id:task-bob fields:value',
      }));
    });

    // B19c (FASE 6C-1): schemaVersion incorreta deve falhar (audit_logs exige 2).
    it('B19c — DELETE_RECURRING com schemaVersion 1 deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertFails(addDoc(ref, {
        action: 'DELETE_RECURRING' as const,
        entity: 'RECURRING_TASK' as const,
        createdAt: serverTimestamp(),
        schemaVersion: 1 as never,
        details: 'id:task-789',
      }));
    });

    // B19d (FASE 6C-1): chave fora da whitelist (hasOnly) deve falhar.
    it('B19d — ADD_RECURRING com chave extra (userId) deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertFails(addDoc(ref, {
        action: 'ADD_RECURRING' as const,
        entity: 'RECURRING_TASK' as const,
        createdAt: serverTimestamp(),
        schemaVersion: 2,
        details: 'task ABC',
        userId: UID_A,
      } as never));
    });

    // B19e (FASE 6C-1): details > 500 chars deve falhar (isStringSized 1..500).
    it('B19e — ADD_RECURRING com details acima do limite deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertFails(addDoc(ref, {
        action: 'ADD_RECURRING' as const,
        entity: 'RECURRING_TASK' as const,
        createdAt: serverTimestamp(),
        schemaVersion: 2,
        details: 'x'.repeat(501),
      }));
    });
  });

  // ── C. transaction protection ────────────────────────────────────────────────

  describe('C. transaction protection', () => {
    // C15: isValidTransactionUpdate exige !changed.hasAny(['importHash'])
    // Alterar importHash de IMPORT_HASH_A para IMPORT_HASH_B deve ser bloqueado.
    it('C15 — update tentando alterar importHash deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        description: 'Test transaction',
        value_cents: 10000,
        schemaVersion: 2,
        type: 'saida',
        category: 'Alimentação',
        date: '2026-01-01',
        source: 'csv',
        importHash: IMPORT_HASH_B, // alterado de IMPORT_HASH_A → bloqueado pela rule
        createdAt: FIXED_TS,       // preservado (data.createdAt == resource.data.createdAt)
        updatedAt: serverTimestamp(),
      }));
    });
  });

  // ── D. transactions CREATE — FASE 5D ─────────────────────────────────────────

  describe('D. transactions create — modo Spark', () => {
    const baseCreatePayload = (source: 'manual' | 'csv' | 'ofx' | 'pdf') => ({
      description: 'New transaction',
      value_cents: 25000,
      schemaVersion: 2,
      type: 'saida' as const,
      category: 'Mercado',
      date: '2026-02-01',
      source,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const manualAfterPayload = (overrides: Record<string, unknown> = {}) => ({
      description: 'New transaction',
      value_cents: 25000,
      schemaVersion: 2,
      type: 'saida' as const,
      category: 'Mercado',
      date: '2026-02-01',
      source: 'manual' as const,
      isRecurring: false,
      ...overrides,
    });

    const manualHistoryPayload = (
      txId: string,
      overrides: Record<string, unknown> = {},
    ) => {
      const afterOverrides = (
        typeof overrides['after'] === 'object'
        && overrides['after'] !== null
        && !Array.isArray(overrides['after'])
      )
        ? overrides['after'] as Record<string, unknown>
        : undefined;
      const { after: _after, ...restOverrides } = overrides;
      void _after;
      return {
        action: 'CREATE' as const,
        txId,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        amount_cents: 25000,
        category: 'Mercado',
        changedFields: [
          'description',
          'value_cents',
          'schemaVersion',
          'type',
          'category',
          'date',
          'source',
          'isRecurring',
        ],
        ...restOverrides,
        after: manualAfterPayload(afterOverrides),
      };
    };

    const commitManualCreateBatch = async (
      txId: string,
      txOverrides: Record<string, unknown> = {},
      historyOverrides: Record<string, unknown> = {},
    ) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', txId), {
        ...baseCreatePayload('manual'),
        isRecurring: false,
        ...txOverrides,
      });
      batch.set(
        doc(db, 'users', UID_A, 'transactions', txId, 'history', 'create'),
        manualHistoryPayload(txId, historyOverrides),
      );
      return batch.commit();
    };

    it('D1 — CREATE direto com source=manual sem history deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions');
      await assertFails(addDoc(ref, baseCreatePayload('manual')));
    });

    it('D2 — CREATE manual com history válido no mesmo batch deve passar', async () => {
      await assertSucceeds(commitManualCreateBatch('tx-manual-batch-ok'));
    });

    it('D3 — CREATE manual com history ausente deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txRef = doc(alice.firestore(), 'users', UID_A, 'transactions', 'tx-manual-no-history');
      await assertFails(setDoc(txRef, {
        ...baseCreatePayload('manual'),
        isRecurring: false,
      }));
    });

    it('D4 — CREATE manual com amount_cents divergente no history deve falhar', async () => {
      await assertFails(commitManualCreateBatch(
        'tx-manual-amount-mismatch',
        {},
        { amount_cents: 26000 },
      ));
    });

    it('D5 — CREATE manual com after.value_cents divergente deve falhar', async () => {
      await assertFails(commitManualCreateBatch(
        'tx-manual-after-value-mismatch',
        {},
        { after: { value_cents: 26000 } },
      ));
    });

    it('D6 — CREATE manual com campos proibidos deve falhar', async () => {
      await assertFails(commitManualCreateBatch('tx-manual-forbidden-fields', {
        importHash: IMPORT_HASH_A,
        id: 'forged-id',
        uid: UID_A,
        value: 250,
      }));
    });

    it('D7 — history CREATE/manual isolado deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const historyRef = doc(
        alice.firestore(),
        'users', UID_A, 'transactions', TX_REAL, 'history', 'create',
      );
      await assertFails(setDoc(historyRef, manualHistoryPayload(TX_REAL, {
        amount_cents: 10000,
        category: 'Alimentação',
        after: {
          description: 'Test transaction',
          value_cents: 10000,
          category: 'Alimentação',
          date: '2026-01-01',
        },
      })));
    });

    it('D8 — CREATE de importação csv/ofx/pdf continua passando', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions');
      await assertSucceeds(addDoc(ref, baseCreatePayload('csv')));
      await assertSucceeds(addDoc(ref, baseCreatePayload('ofx')));
      await assertSucceeds(addDoc(ref, baseCreatePayload('pdf')));
    });

    it('D9 — CREATE manual em batch com historyId diferente de "create" deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const txId = 'tx-manual-wrong-history-id';
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', txId), {
        ...baseCreatePayload('manual'),
        isRecurring: false,
      });
      batch.set(
        doc(db, 'users', UID_A, 'transactions', txId, 'history', 'outro-id'),
        manualHistoryPayload(txId),
      );
      await assertFails(batch.commit());
    });
  });

  // ── E. _lastOpId — FASE 8B-3E compatibilidade e ausência de enforcement ──────

  describe('E. _lastOpId — compatibilidade de schema (8B-3E)', () => {
    const baseUpdatePayload = () => ({
      description: 'Test com _lastOpId',
      value_cents: 10000,
      schemaVersion: 2,
      type: 'saida' as const,
      category: 'Alimentação',
      date: '2026-01-01',
      source: 'csv',
      importHash: IMPORT_HASH_A,
      createdAt: FIXED_TS,
      updatedAt: serverTimestamp(),
    });

    // ── Tarefa 1: positivos de compatibilidade ──────────────────────────────

    it('E1 — UPDATE válido com _lastOpId deve ser permitido', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertSucceeds(setDoc(txDocRef, { ...baseUpdatePayload(), _lastOpId: 'abc123' }));
    });

    it('E2 — UPDATE válido sem _lastOpId continua permitido nesta fase', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertSucceeds(setDoc(txDocRef, baseUpdatePayload()));
    });

    it('E4 — UPDATE de category com _lastOpId deve ser permitido', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertSucceeds(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        category: 'Transporte',
        _lastOpId: 'op-cat-update',
      }));
    });

    it('E5 — UPDATE marcando isDeleted com _lastOpId deve ser permitido', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertSucceeds(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        isDeleted: true,
        deletedAt: serverTimestamp(),
        _lastOpId: 'op-delete',
      }));
    });

    it('E6 — UPDATE com _lastOpId preserva createdAt e importHash sem value legado', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      const payload = { ...baseUpdatePayload(), _lastOpId: 'op-safe' };
      // garante ausência de campos proibidos no payload
      const hasValue = 'value' in payload;
      const hasUid = 'uid' in payload;
      const hasId = 'id' in payload;
      if (hasValue || hasUid || hasId) throw new Error('payload contém campo proibido');
      await assertSucceeds(setDoc(txDocRef, payload));
    });

    // ── Tarefa 2: negativos — proteções existentes permanecem com _lastOpId ──

    it('E3 — UPDATE tentando alterar importHash continua bloqueado mesmo com _lastOpId', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        importHash: IMPORT_HASH_B,
        _lastOpId: 'abc123',
      }));
    });

    it('E7 — UPDATE com _lastOpId tentando incluir value legado continua bloqueado', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        value: 100,
        _lastOpId: 'op-value-legado',
      }));
    });

    it('E8 — UPDATE com _lastOpId tentando incluir uid continua bloqueado', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        uid: UID_A,
        _lastOpId: 'op-uid-forge',
      }));
    });

    it('E9 — UPDATE com _lastOpId tentando incluir id continua bloqueado', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        id: TX_REAL,
        _lastOpId: 'op-id-forge',
      }));
    });

    it('E10 — UPDATE com _lastOpId alterando createdAt continua bloqueado', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      const otherTs = Timestamp.fromDate(new Date('2025-01-01T00:00:00Z'));
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        createdAt: otherTs,
        _lastOpId: 'op-creat-tamper',
      }));
    });

    // ── Tarefa 3: documentação técnica — ausência de enforcement (fase futura) ─
    // Documentação técnica: nesta fase NÃO há getAfter() exigindo history pareado.
    // Os assertSucceeds abaixo (E11–E13) quebrarão de propósito quando enforcement
    // for ativado em fase futura. O prefixo "sem enforcement ainda" facilita o grep.

    it('E11 — sem enforcement ainda — UPDATE com _lastOpId apontando para history inexistente é permitido', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertSucceeds(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        _lastOpId: 'op-history-inexistente',
      }));
    });

    it('E12 — sem enforcement ainda — UPDATE com _lastOpId arbitrário é permitido (compatibilidade temporária)', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertSucceeds(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        _lastOpId: '00000000-0000-0000-0000-000000000000',
      }));
    });

    it('E13 — sem enforcement ainda — UPDATE sem history pareado é permitido (preparação para fase futura)', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      // Sem _lastOpId e sem history escrito — deve continuar passando até enforcement entrar.
      await assertSucceeds(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        description: 'Atualização sem history pareado — sem enforcement ainda',
      }));
    });
  });
});
