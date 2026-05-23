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
  deleteField,
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
const SAFE_CORRELATION_ID = 'op_safe_trace_0001';
const SAFE_BULK_CORRELATION_ID = 'bulk_safe_trace_0001';

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
        correlationId: SAFE_BULK_CORRELATION_ID,
        before: { category: 'Outros' },
        after:  { category: 'Mercado' },
        changedFields: ['category'],
      }));
    });

    it('A14 — correlationId seguro no root de history deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertSucceeds(addDoc(ref, {
        ...validHistoryPayload(),
        correlationId: SAFE_CORRELATION_ID,
      }));
    });

    it.each([
      ['vazio', ''],
      ['muito longo', 'x'.repeat(81)],
      ['objeto', { id: SAFE_CORRELATION_ID }],
      ['número', 12345],
      ['caracteres inseguros', 'op-safe/trace-0001'],
    ])('A15 — correlationId inválido (%s) deve falhar', async (_label, correlationId) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertFails(addDoc(ref, {
        ...validHistoryPayload(),
        correlationId,
      } as never));
    });

    it('A16 — correlationId em before/after deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL, 'history');
      await assertFails(addDoc(ref, {
        ...validHistoryPayload(),
        before: { correlationId: SAFE_CORRELATION_ID, category: 'Outros' },
      }));
      await assertFails(addDoc(ref, {
        ...validHistoryPayload(),
        after: { correlationId: SAFE_CORRELATION_ID, category: 'Alimentação' },
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

    // B9b: negativo — payload com importHash (FASE 9E-2 Hardening) deve falhar
    it('B9b — payload com importHash deve falhar (9E-2)', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'audit_logs');
      await assertFails(addDoc(ref, {
        ...validAuditPayload(),
        importHash: IMPORT_HASH_A,
      } as never));
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

  // ── F. _lastOpId UPDATE enforcement — Modelo A (8B-5) ───────────────────────

  describe('F. _lastOpId UPDATE enforcement — Modelo A (8B-5)', () => {
    const baseUpdatePayload = () => ({
      description: 'Test com _lastOpId enforcement',
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

    const commitUpdateWithHistoryBatch = async (
      txId: string,
      opId: string,
      txOverrides: Record<string, unknown> = {},
      historyOverrides: Record<string, unknown> = {},
    ) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', txId), {
        ...baseUpdatePayload(),
        _lastOpId: opId,
        ...txOverrides,
      });
      batch.set(doc(db, 'users', UID_A, 'transactions', txId, 'history', opId), {
        action: 'UPDATE',
        txId,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        ...historyOverrides,
      });
      return batch.commit();
    };

    const seedLegacyTransaction = async (
      txId: string,
      overrides: Record<string, unknown>,
    ) => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'transactions', txId), {
          ...baseUpdatePayload(),
          updatedAt: FIXED_TS,
          ...overrides,
        });
      });
    };

    const commitPatchUpdateWithHistoryBatch = async (
      txId: string,
      opId: string,
      txPatch: Record<string, unknown> = {},
      historyOverrides: Record<string, unknown> = {},
    ) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', UID_A, 'transactions', txId), {
        ...txPatch,
        updatedAt: serverTimestamp(),
        _lastOpId: opId,
      });
      batch.set(doc(db, 'users', UID_A, 'transactions', txId, 'history', opId), {
        action: 'UPDATE',
        txId,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        ...historyOverrides,
      });
      return batch.commit();
    };

    it('F1 — UPDATE manual com _lastOpId e history pareado deve passar', async () => {
      await assertSucceeds(commitUpdateWithHistoryBatch(TX_REAL, 'op-f1-manual'));
    });

    it('F2 — UPDATE ai com _lastOpId e history pareado deve passar', async () => {
      await assertSucceeds(commitUpdateWithHistoryBatch(TX_REAL, 'op-f2-ai', {}, { origin: 'ai' }));
    });

    it('F3 — Modelo A: UPDATE sem _lastOpId é rejeitado', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, baseUpdatePayload()));
    });

    it('F4 — UPDATE com _lastOpId sem history pareado deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, { ...baseUpdatePayload(), _lastOpId: 'op-f4-no-history' }));
    });

    it('F5 — UPDATE com _lastOpId apontando para history pré-existente deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        _lastOpId: EXISTING_HISTORY_ID,
      }));
    });

    it('F6 — UPDATE com history txId divergente deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-f6-txid', {}, { txId: 'tx-outro' }),
      );
    });

    it('F7 — SOFT_DELETE com origin manual e _lastOpId pareado deve passar', async () => {
      await assertSucceeds(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-f7-soft-delete', {}, { action: 'SOFT_DELETE' }),
      );
    });

    it('F8 — UPDATE action com origin bulk deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-f8-origin', {}, { origin: 'bulk' }),
      );
    });

    it('F9 — UPDATE com history before contendo importHash deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-f9-before', {}, {
          before: { importHash: IMPORT_HASH_A },
        }),
      );
    });

    it('F10 — UPDATE alterando importHash da transaction continua falhando', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, { ...baseUpdatePayload(), importHash: IMPORT_HASH_B }));
    });

    it('F11 — UPDATE com value legado continua falhando', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, { ...baseUpdatePayload(), value: 100 }));
    });

    it('F12 — BULK_UPDATE com origin bulk e _lastOpId pareado deve passar', async () => {
      await assertSucceeds(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-f12-bulk', {}, { action: 'BULK_UPDATE', origin: 'bulk' }),
      );
    });

    it('F12b — BULK_UPDATE preserva correlationId de lote diferente de _lastOpId', async () => {
      await assertSucceeds(
        commitUpdateWithHistoryBatch(TX_REAL, 'op_f12_bulk_corr_001', {}, {
          action: 'BULK_UPDATE',
          origin: 'bulk',
          correlationId: SAFE_BULK_CORRELATION_ID,
        }),
      );
    });

    it('F13 — UNDO_BULK_UPDATE com origin bulk e _lastOpId pareado deve passar', async () => {
      await assertSucceeds(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-f13-undo', {}, { action: 'UNDO_BULK_UPDATE', origin: 'bulk' }),
      );
    });

    it('F13b — UNDO_BULK_UPDATE preserva correlationId de lote diferente de _lastOpId', async () => {
      await assertSucceeds(
        commitUpdateWithHistoryBatch(TX_REAL, 'op_f13_undo_corr_001', {}, {
          action: 'UNDO_BULK_UPDATE',
          origin: 'bulk',
          correlationId: SAFE_BULK_CORRELATION_ID,
        }),
      );
    });

    it('F14 — UPDATE com origin reconcile e _lastOpId pareado deve passar', async () => {
      await assertSucceeds(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-f14-reconcile', {}, { origin: 'reconcile' }),
      );
    });

    it('F14b — UPDATE com correlationId igual ao _lastOpId deve passar', async () => {
      const opId = 'op_safe_update_001';
      await assertSucceeds(
        commitUpdateWithHistoryBatch(TX_REAL, opId, {}, { correlationId: opId }),
      );
    });

    it('F14c — UPDATE com correlationId diferente do _lastOpId deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op_safe_update_002', {}, {
          correlationId: SAFE_CORRELATION_ID,
        }),
      );
    });

    it('F14d — transaction root não aceita correlationId mesmo com history pareado', async () => {
      const opId = 'op_safe_update_003';
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, opId, {
          correlationId: SAFE_CORRELATION_ID,
        }, {
          correlationId: opId,
        }),
      );
    });

    it('F15 — SOFT_DELETE com origin bulk deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-f15-cross', {}, { action: 'SOFT_DELETE', origin: 'bulk' }),
      );
    });

    it('F16 — BULK_UPDATE com origin manual deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-f16-cross', {}, { action: 'BULK_UPDATE', origin: 'manual' }),
      );
    });

    it('F17 — UPDATE de category preservando type legado deve falhar mesmo com Modelo A correto', async () => {
      const txId = 'tx-f17-legacy-type-raw';
      await seedLegacyTransaction(txId, { type: 'despesa' });

      await assertFails(
        commitUpdateWithHistoryBatch(txId, 'op-f17-legacy-type-raw', {
          type: 'despesa',
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação', type: 'despesa' },
          after: { category: 'Transporte', type: 'despesa' },
          changedFields: ['category'],
        }),
      );
    });

    it('F18 — UPDATE de category reparando type legado para canonical passa com Modelo A correto', async () => {
      const txId = 'tx-f18-legacy-type-repaired';
      await seedLegacyTransaction(txId, { type: 'despesa' });

      await assertSucceeds(
        commitUpdateWithHistoryBatch(txId, 'op-f18-legacy-type-repaired', {
          type: 'saida',
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação', type: 'despesa' },
          after: { category: 'Transporte', type: 'saida' },
          changedFields: ['category', 'type'],
        }),
      );
    });

    it('F19 — UPDATE com campo extra legado fora da whitelist falha mesmo com Modelo A correto', async () => {
      const txId = 'tx-f19-extra-field-raw';
      await seedLegacyTransaction(txId, { metadata: 'trash' });

      await assertFails(
        commitUpdateWithHistoryBatch(txId, 'op-f19-extra-field-raw', {
          metadata: 'trash',
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação' },
          after: { category: 'Transporte' },
          changedFields: ['category'],
        }),
      );
    });

    it('F20 — UPDATE removendo campo extra legado via deleteField passa com Modelo A correto', async () => {
      const txId = 'tx-f20-extra-field-repaired';
      await seedLegacyTransaction(txId, { metadata: 'trash' });

      await assertSucceeds(
        commitPatchUpdateWithHistoryBatch(txId, 'op-f20-extra-field-repaired', {
          metadata: deleteField(),
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação' },
          after: { category: 'Transporte' },
          changedFields: ['category'],
        }),
      );
    });

    it('F21 — UPDATE preservando source CSV em maiúsculas falha', async () => {
      const txId = 'tx-f21-source-uppercase-raw';
      await seedLegacyTransaction(txId, { source: 'CSV' });

      await assertFails(
        commitUpdateWithHistoryBatch(txId, 'op-f21-source-uppercase-raw', {
          source: 'CSV',
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação', source: 'CSV' },
          after: { category: 'Transporte', source: 'CSV' },
          changedFields: ['category'],
        }),
      );
    });

    it('F22 — UPDATE normalizando source CSV para csv passa', async () => {
      const txId = 'tx-f22-source-uppercase-repaired';
      await seedLegacyTransaction(txId, { source: 'CSV' });

      await assertSucceeds(
        commitPatchUpdateWithHistoryBatch(txId, 'op-f22-source-uppercase-repaired', {
          source: 'csv',
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação', source: 'CSV' },
          after: { category: 'Transporte', source: 'csv' },
          changedFields: ['category', 'source'],
        }),
      );
    });

    it('F23 — UPDATE com reconciledAt string ou number falha sem repair e passa removendo o campo', async () => {
      const cases: Array<[string, string | number]> = [
        ['tx-f23-reconciled-at-string', '2026-01-01T00:00:00.000Z'],
        ['tx-f23-reconciled-at-number', 1767225600000],
      ];

      for (const [txId, reconciledAt] of cases) {
        await seedLegacyTransaction(txId, { reconciledAt });

        await assertFails(
          commitUpdateWithHistoryBatch(txId, `${txId}-raw`, {
            reconciledAt,
            category: 'Transporte',
          }, {
            before: { category: 'Alimentação' },
            after: { category: 'Transporte' },
            changedFields: ['category'],
          }),
        );

        await assertSucceeds(
          commitPatchUpdateWithHistoryBatch(txId, `${txId}-repaired`, {
            reconciledAt: deleteField(),
            category: 'Transporte',
          }, {
            before: { category: 'Alimentação' },
            after: { category: 'Transporte' },
            changedFields: ['category'],
          }),
        );
      }
    });

    it('F24 — UPDATE com reconciliationStatus/reconciliationSource inválidos passa após remoção', async () => {
      const txId = 'tx-f24-reconciliation-fields';
      await seedLegacyTransaction(txId, {
        reconciliationStatus: 'pending',
        reconciliationSource: 'manual',
      });

      await assertFails(
        commitUpdateWithHistoryBatch(txId, 'op-f24-reconciliation-fields-raw', {
          reconciliationStatus: 'pending',
          reconciliationSource: 'manual',
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação' },
          after: { category: 'Transporte' },
          changedFields: ['category'],
        }),
      );

      await assertSucceeds(
        commitPatchUpdateWithHistoryBatch(txId, 'op-f24-reconciliation-fields-repaired', {
          reconciliationStatus: deleteField(),
          reconciliationSource: deleteField(),
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação' },
          after: { category: 'Transporte' },
          changedFields: ['category'],
        }),
      );
    });

    it('F25 — UPDATE sem _lastOpId continua falhando', async () => {
      const txId = 'tx-f25-no-last-op-id';
      await seedLegacyTransaction(txId, {});

      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', txId);
      await assertFails(updateDoc(txDocRef, {
        category: 'Transporte',
        updatedAt: serverTimestamp(),
      }));
    });

    it('F26 — UPDATE com _lastOpId sem history pareado continua falhando', async () => {
      const txId = 'tx-f26-no-paired-history';
      await seedLegacyTransaction(txId, {});

      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', txId);
      await assertFails(updateDoc(txDocRef, {
        category: 'Transporte',
        updatedAt: serverTimestamp(),
        _lastOpId: 'op-f26-no-paired-history',
      }));
    });

    it('F27 — UPDATE tentando alterar importHash continua falhando em batch pareado', async () => {
      const txId = 'tx-f27-importhash-change';
      await seedLegacyTransaction(txId, {});

      await assertFails(
        commitPatchUpdateWithHistoryBatch(txId, 'op-f27-importhash-change', {
          importHash: IMPORT_HASH_B,
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação' },
          after: { category: 'Transporte' },
          changedFields: ['category'],
        }),
      );
    });

    it('F28 — UPDATE removendo value legado passa e value não permanece no documento final', async () => {
      const txId = 'tx-f28-value-legacy-repaired';
      await seedLegacyTransaction(txId, { value: 100 });

      await assertSucceeds(
        commitPatchUpdateWithHistoryBatch(txId, 'op-f28-value-legacy-repaired', {
          value: deleteField(),
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação' },
          after: { category: 'Transporte' },
          changedFields: ['category'],
        }),
      );
    });

    it('F29 — UPDATE mantendo importHash sem alteração passa com history pareado', async () => {
      const txId = 'tx-f29-importhash-preserved';
      await seedLegacyTransaction(txId, {});

      await assertSucceeds(
        commitPatchUpdateWithHistoryBatch(txId, 'op-f29-importhash-preserved', {
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação' },
          after: { category: 'Transporte' },
          changedFields: ['category'],
        }),
      );
    });

    it('F30 — documento sem createdAt não é corrigível pelo client sem relaxar a rule', async () => {
      const txId = 'tx-f30-missing-created-at';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const data = baseUpdatePayload() as Record<string, unknown>;
        delete data['createdAt'];
        data['updatedAt'] = FIXED_TS;
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'transactions', txId), data);
      });

      await assertFails(
        commitPatchUpdateWithHistoryBatch(txId, 'op-f30-missing-created-at-no-repair', {
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação' },
          after: { category: 'Transporte' },
          changedFields: ['category'],
        }),
      );

      await assertFails(
        commitPatchUpdateWithHistoryBatch(txId, 'op-f30-missing-created-at-attempted-repair', {
          createdAt: serverTimestamp(),
          category: 'Transporte',
        }, {
          before: { category: 'Alimentação' },
          after: { category: 'Transporte' },
          changedFields: ['category'],
        }),
      );
    });

    it('F31 — UPDATE de categoria em transação nova com history pareado e sanitizado passa', async () => {
      const txId = 'tx-f31-new-canonical-update';
      // Setup: cria transação nova canônica (schemaVersion 2, createdAt/updatedAt válidos)
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'transactions', txId), {
          description: 'Lanche',
          value_cents: 2500,
          schemaVersion: 2,
          type: 'saida',
          category: 'Alimentação',
          date: '2026-05-19',
          source: 'manual',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await assertSucceeds(
        commitPatchUpdateWithHistoryBatch(txId, 'op-f31-category-update', {
          category: 'Lazer',
        }, {
          before: { category: 'Alimentação' },
          after: { category: 'Lazer' },
          changedFields: ['category'],
        }),
      );
    });

    it('F32 — UPDATE simulando payload complexo da UI e FirestoreService deve passar', async () => {
      const txId = 'tx-f32-ui-payload-sim';
      const opId = 'op-f32-random-id';

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'transactions', txId), {
          description: 'Compra Simulação',
          value_cents: 10000,
          schemaVersion: 2,
          type: 'saida',
          category: 'Outros',
          date: '2026-05-19',
          source: 'manual',
          isRecurring: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      const txRef = doc(db, 'users', UID_A, 'transactions', txId);
      const historyRef = doc(db, 'users', UID_A, 'transactions', txId, 'history', opId);

      batch.update(txRef, {
        category: 'Alimentação',
        schemaVersion: 2,
        uid: deleteField(),
        id: deleteField(),
        value: deleteField(),
        updatedAt: serverTimestamp(),
        _lastOpId: opId,
      });

      const before = {
        description: 'Compra Simulação',
        value_cents: 10000,
        schemaVersion: 2,
        type: 'saida',
        category: 'Outros',
        date: '2026-05-19',
        source: 'manual',
        isRecurring: false,
      };

      batch.set(historyRef, {
        action: 'UPDATE',
        txId,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        before,
        after: { ...before, category: 'Alimentação' },
        changedFields: ['category'],
        category: 'Alimentação',
        amount_cents: 10000,
      });

      await assertSucceeds(batch.commit());
    });

    it('F33 — UPDATE em transação v1 (legada) com reparo para v2 e changedFields incompleto', async () => {
      const txId = 'tx-f33-legacy-repair';
      const opId = 'op-f33-random-id';

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'transactions', txId), {
          description: 'Lanche Legado',
          value_cents: 1500,
          type: 'saida',
          category: 'Outros',
          date: '2026-01-01',
          source: 'manual',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      const txRef = doc(db, 'users', UID_A, 'transactions', txId);
      const historyRef = doc(db, 'users', UID_A, 'transactions', txId, 'history', opId);

      batch.update(txRef, {
        category: 'Alimentação',
        schemaVersion: 2,
        updatedAt: serverTimestamp(),
        _lastOpId: opId,
      });

      const before = {
        description: 'Lanche Legado',
        value_cents: 1500,
        type: 'saida',
        category: 'Outros',
        date: '2026-01-01',
        source: 'manual',
      };

      batch.set(historyRef, {
        action: 'UPDATE',
        txId,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        before,
        after: { ...before, category: 'Alimentação', schemaVersion: 2 },
        changedFields: ['category'],
      });

      await assertSucceeds(batch.commit());
    });

    it('F34 — deleteField() em importHash (campo imutável) que não existe no doc causa falha?', async () => {
      const txId = 'tx-f34-no-importhash';
      const opId = 'op-f34-random-id';

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'transactions', txId), {
          description: 'Doc Manual',
          value_cents: 1000,
          schemaVersion: 2,
          type: 'saida',
          category: 'Outros',
          date: '2026-05-19',
          source: 'manual',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);

      batch.update(doc(db, 'users', UID_A, 'transactions', txId), {
        category: 'Alimentação',
        importHash: deleteField(),
        updatedAt: serverTimestamp(),
        _lastOpId: opId,
      });

      batch.set(doc(db, 'users', UID_A, 'transactions', txId, 'history', opId), {
        action: 'UPDATE',
        txId,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        before: { category: 'Outros' },
        after: { category: 'Alimentação' },
        changedFields: ['category'],
      });

      await assertSucceeds(batch.commit());
    });

    it('F35 — SOFT_DELETE de transação nova canônica com history pareado e sanitizado passa', async () => {
      const txId = 'tx-f35-new-canonical-soft-delete';
      const opId = 'op-f35-soft-delete';

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'transactions', txId), {
          description: 'Compra para excluir',
          value_cents: 4200,
          schemaVersion: 2,
          type: 'saida',
          category: 'Alimentação',
          date: '2026-05-19',
          source: 'manual',
          isRecurring: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      const txRef = doc(db, 'users', UID_A, 'transactions', txId);
      const historyRef = doc(db, 'users', UID_A, 'transactions', txId, 'history', opId);

      const before = {
        description: 'Compra para excluir',
        value_cents: 4200,
        schemaVersion: 2,
        type: 'saida',
        category: 'Alimentação',
        date: '2026-05-19',
        source: 'manual',
        isRecurring: false,
      };

      batch.update(txRef, {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        uid: deleteField(),
        id: deleteField(),
        value: deleteField(),
        _lastOpId: opId,
      });

      batch.set(historyRef, {
        action: 'SOFT_DELETE',
        txId,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        before,
        after: {
          ...before,
          isDeleted: true,
          deletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        changedFields: ['isDeleted', 'deletedAt', 'updatedAt'],
      });

      await assertSucceeds(batch.commit());
    });
  });

  // ── G. Hardening _lastOpId — FASE 8B-3F-HARDENING ───────────────────────────

  describe('G. Hardening _lastOpId (8B-3F-HARDENING)', () => {
    const baseUpdatePayload = () => ({
      description: 'Hardening _lastOpId',
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

    const commitUpdateWithHistoryBatch = async (
      txId: string,
      opId: string,
      historyOverrides: Record<string, unknown> = {},
    ) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', txId), {
        ...baseUpdatePayload(),
        _lastOpId: opId,
      });
      batch.set(doc(db, 'users', UID_A, 'transactions', txId, 'history', opId), {
        action: 'UPDATE',
        txId,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        ...historyOverrides,
      });
      return batch.commit();
    };

    it('G1 — UPDATE com _lastOpId vazio deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, { ...baseUpdatePayload(), _lastOpId: '' }));
    });

    it('G2 — UPDATE com _lastOpId null deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, { ...baseUpdatePayload(), _lastOpId: null as never }));
    });

    it('G3 — UPDATE com _lastOpId numérico deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, { ...baseUpdatePayload(), _lastOpId: 42 as never }));
    });

    it('G4 — UPDATE com _lastOpId objeto deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, { ...baseUpdatePayload(), _lastOpId: { id: 'forged' } as never }));
    });

    it('G5 — UPDATE com _lastOpId acima de 128 chars deve falhar', async () => {
      const longOpId = 'x'.repeat(129);
      await assertFails(commitUpdateWithHistoryBatch(TX_REAL, longOpId));
    });

    it('G6 — UPDATE com history origin reconcile deve passar (FASE 8B-4)', async () => {
      await assertSucceeds(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-g6-reconcile', { origin: 'reconcile' }),
      );
    });

    it('G7 — UPDATE com history origin import deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-g7-import', { origin: 'import' }),
      );
    });

    it('G8 — UPDATE com history origin system deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-g8-system', { origin: 'system' }),
      );
    });

    it('G9 — UPDATE com history action BULK_UPDATE deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-g9-bulk', { action: 'BULK_UPDATE' }),
      );
    });

    it('G10 — UPDATE com history action UNDO_BULK_UPDATE deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-g10-undo', { action: 'UNDO_BULK_UPDATE' }),
      );
    });

    it('G11 — UPDATE com history action CREATE deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-g11-create', { action: 'CREATE' }),
      );
    });

    it('G12 — UPDATE com history schemaVersion 0 deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-g12-schema', { schemaVersion: 0 as never }),
      );
    });

    it('G13 — UPDATE com history changedFields contendo importHash deve falhar', async () => {
      await assertFails(
        commitUpdateWithHistoryBatch(TX_REAL, 'op-g13-changedfields', {
          changedFields: ['importHash'],
        }),
      );
    });
  });

  // ── E. _lastOpId — FASE 8B-5 Modelo A obrigatório ──────────────────────────

  describe('E. _lastOpId — Modelo A obrigatório (8B-5)', () => {
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

    it('E1 — UPDATE com _lastOpId sem history pareado deve falhar (Modelo B enforcement)', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, { ...baseUpdatePayload(), _lastOpId: 'abc123' }));
    });

    it('E2 — Modelo A: UPDATE sem _lastOpId é rejeitado', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, baseUpdatePayload()));
    });

    it('E4 — UPDATE de category com _lastOpId sem history deve falhar (Modelo B enforcement)', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        category: 'Transporte',
        _lastOpId: 'op-cat-update',
      }));
    });

    it('E5 — UPDATE marcando isDeleted com _lastOpId sem history deve falhar (Modelo B enforcement)', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        isDeleted: true,
        deletedAt: serverTimestamp(),
        _lastOpId: 'op-delete',
      }));
    });

    it('E6 — UPDATE com _lastOpId sem history deve falhar; campos proibidos ausentes são verificados', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      const payload = { ...baseUpdatePayload(), _lastOpId: 'op-safe' };
      const hasValue = 'value' in payload;
      const hasUid = 'uid' in payload;
      const hasId = 'id' in payload;
      if (hasValue || hasUid || hasId) throw new Error('payload contém campo proibido');
      await assertFails(setDoc(txDocRef, payload));
    });

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

    it('E11 — UPDATE com _lastOpId apontando para history inexistente deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        _lastOpId: 'op-history-inexistente',
      }));
    });

    it('E12 — UPDATE com _lastOpId arbitrário sem history deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        _lastOpId: '00000000-0000-0000-0000-000000000000',
      }));
    });

    it('E13 — Modelo A: UPDATE sem _lastOpId é rejeitado', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txDocRef = doc(alice.firestore(), 'users', UID_A, 'transactions', TX_REAL);
      await assertFails(setDoc(txDocRef, {
        ...baseUpdatePayload(),
        description: 'Atualização sem history pareado — deve falhar no Modelo A',
      }));
    });
  });
});
