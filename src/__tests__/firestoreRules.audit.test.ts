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
  getDoc,
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
const ACCOUNT_REAL = 'account-real-001';
const LEGACY_ACCOUNT = 'account-legacy-001';
const RECURRING_REAL = 'recurring-real-001';
const LEGACY_RECURRING = 'recurring-legacy-001';

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

const validAccountPayload = (overrides: Record<string, unknown> = {}) => ({
  name:          'Conta Principal',
  type:          'corrente' as const,
  balance:       150050,
  schemaVersion: 2,
  createdAt:     serverTimestamp(),
  updatedAt:     serverTimestamp(),
  ...overrides,
});

const fixedAccountPayload = (overrides: Record<string, unknown> = {}) => ({
  name:          'Conta Principal',
  type:          'corrente' as const,
  balance:       150050,
  schemaVersion: 2,
  createdAt:     FIXED_TS,
  updatedAt:     FIXED_TS,
  ...overrides,
});

const accountHistorySnapshot = (overrides: Record<string, unknown> = {}) => ({
  name:          'Conta Principal',
  type:          'corrente' as const,
  balance:       150050,
  schemaVersion: 2,
  createdAt:     FIXED_TS,
  updatedAt:     FIXED_TS,
  ...overrides,
});

const validAccountHistoryPayload = (
  accountId: string,
  overrides: Record<string, unknown> = {},
) => ({
  action:        'UPDATE' as const,
  accountId,
  createdAt:     serverTimestamp(),
  schemaVersion: 1,
  origin:        'manual' as const,
  correlationId: SAFE_CORRELATION_ID,
  before:        accountHistorySnapshot(),
  after:         accountHistorySnapshot({ name: 'Conta Atualizada', updatedAt: serverTimestamp() }),
  changedFields: ['name'],
  ...overrides,
});

const validRecurringPayload = (overrides: Record<string, unknown> = {}) => ({
  description:   'Aluguel',
  value:         120050,
  category:      'Moradia',
  dueDay:        1,
  active:        true,
  frequency:     'mensal' as const,
  schemaVersion: 2,
  createdAt:     serverTimestamp(),
  updatedAt:     serverTimestamp(),
  ...overrides,
});

const fixedRecurringPayload = (overrides: Record<string, unknown> = {}) => ({
  description:   'Aluguel',
  value:         120050,
  category:      'Moradia',
  dueDay:        1,
  active:        true,
  frequency:     'mensal' as const,
  schemaVersion: 2,
  createdAt:     FIXED_TS,
  updatedAt:     FIXED_TS,
  ...overrides,
});

const recurringHistorySnapshot = (overrides: Record<string, unknown> = {}) => ({
  description:   'Aluguel',
  value_cents:   120050,
  category:      'Moradia',
  dueDay:        1,
  active:        true,
  frequency:     'mensal' as const,
  schemaVersion: 2,
  createdAt:     FIXED_TS,
  updatedAt:     FIXED_TS,
  ...overrides,
});

const validRecurringHistoryPayload = (
  recurringTaskId: string,
  overrides: Record<string, unknown> = {},
) => ({
  action:          'UPDATE' as const,
  recurringTaskId,
  createdAt:       serverTimestamp(),
  schemaVersion:   1,
  origin:          'manual' as const,
  correlationId:   SAFE_CORRELATION_ID,
  before:          recurringHistorySnapshot(),
  after:           recurringHistorySnapshot({ category: 'Assinaturas', updatedAt: serverTimestamp() }),
  changedFields:   ['category'],
  ...overrides,
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

      await setDoc(
        doc(db, 'users', UID_A, 'accounts', ACCOUNT_REAL),
        fixedAccountPayload(),
      );

      await setDoc(
        doc(db, 'users', UID_A, 'accounts', LEGACY_ACCOUNT),
        {
          name:      'Conta Legada',
          type:      'corrente',
          balance:   1500.50,
          createdAt: FIXED_TS,
          updatedAt: FIXED_TS,
        },
      );

      await setDoc(
        doc(db, 'users', UID_A, 'recurringTasks', RECURRING_REAL),
        fixedRecurringPayload(),
      );

      await setDoc(
        doc(db, 'users', UID_A, 'recurringTasks', LEGACY_RECURRING),
        {
          description: 'Recorrente legado',
          value:       25000,
          category:    'Assinaturas',
          dueDay:      10,
          active:      true,
          frequency:   'mensal',
          createdAt:   FIXED_TS,
          updatedAt:   FIXED_TS,
        },
      );
    });
    // Timeout estendido: o cold start do emulador Java + loadRuleset + seed pode
    // exceder os 10s default do vitest em máquinas locais (o hook estourava e a
    // suíte inteira aparecia como "190 skipped" com TypeError em cleanup).
  }, 90_000);

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

    const importAfterPayload = (
      source: 'csv' | 'ofx' | 'pdf',
      overrides: Record<string, unknown> = {},
    ) => ({
      description: 'New transaction',
      value_cents: 25000,
      schemaVersion: 2,
      type: 'saida' as const,
      category: 'Mercado',
      date: '2026-02-01',
      source,
      fitId: null,
      tags: [],
      isRecurring: false,
      ...overrides,
    });

    const importCreatePayload = (
      txId: string,
      source: 'csv' | 'ofx' | 'pdf',
      overrides: Record<string, unknown> = {},
    ) => ({
      ...baseCreatePayload(source),
      importHash: txId,
      fitId: null,
      tags: [],
      isRecurring: false,
      ...overrides,
    });

    const importHistoryPayload = (
      txId: string,
      source: 'csv' | 'ofx' | 'pdf',
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
        origin: 'import',
        correlationId: SAFE_BULK_CORRELATION_ID,
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
          'fitId',
          'tags',
          'isRecurring',
        ],
        ...restOverrides,
        after: importAfterPayload(source, afterOverrides),
      };
    };

    const importTxId = (seed: string) => seed.repeat(64).slice(0, 64);
    const forbiddenAfterSeed: Record<string, string> = {
      importHash: 'g',
      correlationId: 'h',
      uid: 'i',
      id: 'j',
      value: 'k',
      _lastOpId: 'l',
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

    const commitImportCreateBatch = async (
      txId: string,
      source: 'csv' | 'ofx' | 'pdf' = 'csv',
      txOverrides: Record<string, unknown> = {},
      historyOverrides: Record<string, unknown> = {},
    ) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', txId), importCreatePayload(txId, source, txOverrides));
      batch.set(
        doc(db, 'users', UID_A, 'transactions', txId, 'history', 'create'),
        importHistoryPayload(txId, source, historyOverrides),
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

    it('D8 — CREATE de importação csv/ofx/pdf com history pareado passa', async () => {
      await assertSucceeds(commitImportCreateBatch(importTxId('c'), 'csv'));
      await assertSucceeds(commitImportCreateBatch(importTxId('d'), 'ofx'));
      await assertSucceeds(commitImportCreateBatch(importTxId('e'), 'pdf'));
    });

    it('D8b — CREATE de importação sem history pareado deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txId = importTxId('f');
      await assertFails(setDoc(
        doc(alice.firestore(), 'users', UID_A, 'transactions', txId),
        importCreatePayload(txId, 'csv'),
      ));
    });

    it('D8c — CREATE de importação com importHash divergente do doc id deve falhar', async () => {
      await assertFails(commitImportCreateBatch(
        importTxId('0'),
        'csv',
        { importHash: importTxId('1') },
      ));
    });

    it('D8d — history CREATE/import com correlationId inválido deve falhar', async () => {
      await assertFails(commitImportCreateBatch(
        importTxId('2'),
        'csv',
        {},
        { correlationId: 'bad/id' },
      ));
    });

    it.each(['importHash', 'correlationId', 'uid', 'id', 'value', '_lastOpId'])(
      'D8e — history CREATE/import after com campo proibido %s deve falhar',
      async (field) => {
        await assertFails(commitImportCreateBatch(
          importTxId(forbiddenAfterSeed[field] ?? 'm'),
          'csv',
          {},
          { after: { [field]: field === 'value' ? 250 : 'forbidden' } },
        ));
      },
    );

    it('D8f — history CREATE/import isolado deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const txId = importTxId('9');
      await assertFails(setDoc(
        doc(alice.firestore(), 'users', UID_A, 'transactions', txId, 'history', 'create'),
        importHistoryPayload(txId, 'csv'),
      ));
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

  // ── H. accounts/{accountId}/history — FASE 10F-3B ─────────────────────────

  describe('H. accounts/{accountId}/history — Modelo A leve', () => {
    const seedAccount = async (accountId: string, overrides: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'users', UID_A, 'accounts', accountId),
          fixedAccountPayload(overrides),
        );
      });
    };

    const commitCreateAccountWithHistory = async (
      accountId: string,
      accountOverrides: Record<string, unknown> = {},
      historyOverrides: Record<string, unknown> = {},
    ) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      const accountRef = doc(db, 'users', UID_A, 'accounts', accountId);
      const accountPayload = validAccountPayload(accountOverrides);

      batch.set(accountRef, accountPayload);
      batch.set(doc(db, 'users', UID_A, 'accounts', accountId, 'history', 'create'), {
        action:        'CREATE',
        accountId,
        createdAt:     serverTimestamp(),
        schemaVersion: 1,
        origin:        'manual',
        correlationId: SAFE_CORRELATION_ID,
        after: {
          name:          accountPayload.name,
          type:          accountPayload.type,
          balance:       accountPayload.balance,
          schemaVersion: accountPayload.schemaVersion,
          createdAt:     accountPayload.createdAt,
          updatedAt:     accountPayload.updatedAt,
        },
        changedFields: ['name', 'type', 'balance', 'schemaVersion'],
        ...historyOverrides,
      });

      return batch.commit();
    };

    const commitUpdateAccountWithHistory = async (
      accountId: string,
      opId: string,
      updateOverrides: Record<string, unknown> = {},
      historyOverrides: Record<string, unknown> = {},
    ) => {
      await seedAccount(accountId);

      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      const updatePayload = {
        name:      'Conta Atualizada',
        updatedAt: serverTimestamp(),
        _lastOpId: opId,
        ...updateOverrides,
      };

      batch.update(doc(db, 'users', UID_A, 'accounts', accountId), updatePayload);
      batch.set(doc(db, 'users', UID_A, 'accounts', accountId, 'history', opId), {
        ...validAccountHistoryPayload(accountId, {
          correlationId: opId,
          after: accountHistorySnapshot({
            name:      updatePayload.name,
            updatedAt: updatePayload.updatedAt,
          }),
        }),
        ...historyOverrides,
      });

      return batch.commit();
    };

    it('H1 — CREATE de account com history pareado deve passar', async () => {
      await assertSucceeds(commitCreateAccountWithHistory('account-h1-create'));
    });

    it('H2 — CREATE de account sem history pareado deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(setDoc(
        doc(alice.firestore(), 'users', UID_A, 'accounts', 'account-h2-no-history'),
        validAccountPayload(),
      ));
    });

    it('H3 — UPDATE de account com history pareado deve passar', async () => {
      await assertSucceeds(commitUpdateAccountWithHistory(
        'account-h3-update',
        'op_account_update_0001',
      ));
    });

    it('H4 — UPDATE de account sem history pareado deve falhar', async () => {
      const accountId = 'account-h4-no-history';
      await seedAccount(accountId);

      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(updateDoc(doc(alice.firestore(), 'users', UID_A, 'accounts', accountId), {
        name:      'Sem History',
        updatedAt: serverTimestamp(),
        _lastOpId: 'op_account_no_history',
      }));
    });

    it('H5 — DELETE de account com history pareado deve passar', async () => {
      const accountId = 'account-h5-delete';
      await seedAccount(accountId);

      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'accounts', accountId, 'history', 'delete'), {
        action:        'DELETE',
        accountId,
        createdAt:     serverTimestamp(),
        schemaVersion: 1,
        origin:        'manual',
        correlationId: 'op_account_delete_0001',
        before:        accountHistorySnapshot(),
        changedFields: ['name', 'type', 'balance', 'schemaVersion'],
      });
      batch.delete(doc(db, 'users', UID_A, 'accounts', accountId));

      await assertSucceeds(batch.commit());
    });

    it('H6 — history de account com correlationId inválido deve falhar', async () => {
      await assertFails(commitUpdateAccountWithHistory(
        'account-h6-bad-correlation',
        'op_account_update_0002',
        {},
        { correlationId: 'unsafe correlation id!' },
      ));
    });

    it('H7 — before/after com correlationId deve falhar', async () => {
      await assertFails(commitUpdateAccountWithHistory(
        'account-h7-snapshot-correlation',
        'op_account_update_0003',
        {},
        { before: accountHistorySnapshot({ correlationId: 'op_account_update_0003' }) },
      ));
    });

    it.each(['uid', 'id', 'path'])('H8 — before/after com campo proibido %s deve falhar', async (field) => {
      await assertFails(commitUpdateAccountWithHistory(
        `account-h8-${field}`,
        `op_account_${field}_0004`,
        {},
        {
          after: accountHistorySnapshot({
            name:      'Conta Atualizada',
            updatedAt: serverTimestamp(),
            [field]:   `forbidden-${field}`,
          }),
        },
      ));
    });

    it('H9 — campos monetários inválidos em account são rejeitados', async () => {
      await assertFails(commitCreateAccountWithHistory(
        'account-h9-invalid-money',
        { balance: 12.5 },
        { after: { ...accountHistorySnapshot(), balance: 12.5 } },
      ));
    });

    it('H10 — contas legadas continuam legíveis', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      await assertSucceeds(getDoc(doc(alice.firestore(), 'users', UID_A, 'accounts', LEGACY_ACCOUNT)));
    });
  });

  // ── I. recurringTasks/{taskId}/history — FASE 10F-3C ───────────────────────

  describe('I. recurringTasks/{taskId}/history — Modelo A leve', () => {
    const seedRecurring = async (taskId: string, overrides: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'users', UID_A, 'recurringTasks', taskId),
          fixedRecurringPayload(overrides),
        );
      });
    };

    const commitCreateRecurringWithHistory = async (
      taskId: string,
      taskOverrides: Record<string, unknown> = {},
      historyOverrides: Record<string, unknown> = {},
    ) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      const taskRef = doc(db, 'users', UID_A, 'recurringTasks', taskId);
      const taskPayload = validRecurringPayload(taskOverrides);

      batch.set(taskRef, taskPayload);
      batch.set(doc(db, 'users', UID_A, 'recurringTasks', taskId, 'history', 'create'), {
        action:          'CREATE',
        recurringTaskId: taskId,
        createdAt:       serverTimestamp(),
        schemaVersion:   1,
        origin:          'manual',
        correlationId:   SAFE_CORRELATION_ID,
        after: {
          description:   taskPayload.description,
          value_cents:   taskPayload.value,
          category:      taskPayload.category,
          dueDay:        taskPayload.dueDay,
          active:        taskPayload.active,
          frequency:     taskPayload.frequency,
          schemaVersion: taskPayload.schemaVersion,
          createdAt:     taskPayload.createdAt,
          updatedAt:     taskPayload.updatedAt,
        },
        changedFields: [
          'description', 'value_cents', 'category', 'dueDay',
          'active', 'frequency', 'schemaVersion',
        ],
        ...historyOverrides,
      });

      return batch.commit();
    };

    const commitUpdateRecurringWithHistory = async (
      taskId: string,
      opId: string,
      updateOverrides: Record<string, unknown> = {},
      historyOverrides: Record<string, unknown> = {},
    ) => {
      await seedRecurring(taskId);

      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      const updatePayload = {
        category:  'Assinaturas',
        updatedAt: serverTimestamp(),
        _lastOpId: opId,
        ...updateOverrides,
      };

      batch.update(doc(db, 'users', UID_A, 'recurringTasks', taskId), updatePayload);
      batch.set(doc(db, 'users', UID_A, 'recurringTasks', taskId, 'history', opId), {
        ...validRecurringHistoryPayload(taskId, {
          correlationId: opId,
          after: recurringHistorySnapshot({
            category:  updatePayload.category,
            updatedAt: updatePayload.updatedAt,
          }),
        }),
        ...historyOverrides,
      });

      return batch.commit();
    };

    it('I1 — CREATE de recurringTask com history pareado deve passar', async () => {
      await assertSucceeds(commitCreateRecurringWithHistory('recurring-i1-create'));
    });

    it('I2 — CREATE de recurringTask sem history pareado deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(setDoc(
        doc(alice.firestore(), 'users', UID_A, 'recurringTasks', 'recurring-i2-no-history'),
        validRecurringPayload(),
      ));
    });

    it('I3 — UPDATE de recurringTask com history pareado deve passar', async () => {
      await assertSucceeds(commitUpdateRecurringWithHistory(
        'recurring-i3-update',
        'op_recurring_update_0001',
      ));
    });

    it('I4 — UPDATE de recurringTask sem history pareado deve falhar', async () => {
      const taskId = 'recurring-i4-no-history';
      await seedRecurring(taskId);

      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(updateDoc(doc(alice.firestore(), 'users', UID_A, 'recurringTasks', taskId), {
        category:  'Assinaturas',
        updatedAt: serverTimestamp(),
        _lastOpId: 'op_recurring_no_history',
      }));
    });

    it('I5 — DELETE de recurringTask com history pareado deve passar', async () => {
      const taskId = 'recurring-i5-delete';
      await seedRecurring(taskId);

      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'recurringTasks', taskId, 'history', 'delete'), {
        action:          'DELETE',
        recurringTaskId: taskId,
        createdAt:       serverTimestamp(),
        schemaVersion:   1,
        origin:          'manual',
        correlationId:   'op_recurring_delete_0001',
        before:          recurringHistorySnapshot(),
        changedFields: [
          'description', 'value_cents', 'category', 'dueDay',
          'active', 'frequency', 'schemaVersion',
        ],
      });
      batch.delete(doc(db, 'users', UID_A, 'recurringTasks', taskId));

      await assertSucceeds(batch.commit());
    });

    it('I6 — DELETE de recurringTask sem history pareado deve falhar', async () => {
      const taskId = 'recurring-i6-delete-no-history';
      await seedRecurring(taskId);

      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(deleteDoc(doc(alice.firestore(), 'users', UID_A, 'recurringTasks', taskId)));
    });

    it('I7 — history de recurringTask com correlationId inválido deve falhar', async () => {
      await assertFails(commitUpdateRecurringWithHistory(
        'recurring-i7-bad-correlation',
        'op_recurring_update_0002',
        {},
        { correlationId: 'unsafe correlation id!' },
      ));
    });

    it.each(['uid', 'id', 'path', 'correlationId', '_lastOpId', 'value'])(
      'I8 — before/after com campo proibido %s deve falhar',
      async (field) => {
        await assertFails(commitUpdateRecurringWithHistory(
          `recurring-i8-${field.replace('_', '')}`,
          `op_recurring_${field.replace('_', '')}_0003`,
          {},
          {
            after: recurringHistorySnapshot({
              category:  'Assinaturas',
              updatedAt: serverTimestamp(),
              [field]:   `forbidden-${field}`,
            }),
          },
        ));
      },
    );

    it('I9 — campos monetários inválidos em recurringTask são rejeitados', async () => {
      await assertFails(commitCreateRecurringWithHistory(
        'recurring-i9-invalid-money',
        { value: 12.5 },
        { after: { ...recurringHistorySnapshot(), value_cents: 12.5 } },
      ));
    });

    it('I10 — recorrentes legadas continuam legíveis', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      await assertSucceeds(getDoc(doc(alice.firestore(), 'users', UID_A, 'recurringTasks', LEGACY_RECURRING)));
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

  // ── J. Transferências (FASE 11A-3) ──────────────────────────────────────────
  describe('J. Transferências (FASE 11A-3)', () => {
    const TX_TRANSFER = 'tx-transfer-001';
    const TX_TRANSFER_2 = 'tx-transfer-002';

    const validTransferPayload = (overrides: Record<string, unknown> = {}) => ({
      description:   'Transferência',
      value_cents:   50000,
      schemaVersion: 2,
      type:          'transferencia',
      category:      'Outros',
      date:          '2026-06-01',
      source:        'manual',
      fromAccountId: 'acc-corrente',
      toAccountId:   'acc-poupanca',
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
      ...overrides,
    });

    const commitTransferWithHistory = async (
      txId: string,
      txOverrides: Record<string, unknown> = {},
    ) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', txId), {
        ...validTransferPayload(),
        ...txOverrides,
      });
      batch.set(doc(db, 'users', UID_A, 'transactions', txId, 'history', 'create'), {
        action: 'CREATE',
        txId,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        amount_cents: 50000,
        category: 'Outros',
      });
      return batch.commit();
    };

    // Transferências são SERVER-ONLY (correção P1 F-01): a callable `createTransfer`
    // (Admin SDK) grava tx + history + movimenta os saldos das contas atomicamente,
    // bypassando as Rules. O create client-side de type='transferencia' é negado
    // explicitamente pelas Rules — este teste documenta essa negação.
    it('J1 — CREATE client-side de transferência deve falhar (server-only via callable createTransfer)', async () => {
      await assertFails(commitTransferWithHistory(TX_TRANSFER));
    });

    it('J1b — UPDATE client-side de transferência existente deve falhar (server-only)', async () => {
      const existingTransferId = 'tx-transfer-existing-001';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'transactions', existingTransferId), {
          description:   'Transferência',
          value_cents:   50000,
          schemaVersion: 2,
          type:          'transferencia',
          category:      'Transferência',
          date:          '2026-06-01',
          source:        'manual',
          fromAccountId: 'acc-corrente',
          toAccountId:   'acc-poupanca',
          isRecurring:   false,
          createdAt:     FIXED_TS,
          updatedAt:     FIXED_TS,
        });
      });
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      const opId = 'op_transfer_upd_001';
      batch.update(doc(db, 'users', UID_A, 'transactions', existingTransferId), {
        description: 'Transferência editada',
        descriptionLower: 'transferência editada',
        updatedAt: serverTimestamp(),
        _lastOpId: opId,
      });
      batch.set(doc(db, 'users', UID_A, 'transactions', existingTransferId, 'history', opId), {
        action: 'UPDATE', txId: existingTransferId, createdAt: serverTimestamp(),
        schemaVersion: 1, origin: 'manual',
        changedFields: ['description'],
      });
      await assertFails(batch.commit());
    });

    it('J2 — fromAccountId == toAccountId deve falhar', async () => {
      await assertFails(commitTransferWithHistory(TX_TRANSFER_2, {
        fromAccountId: 'acc-a',
        toAccountId:   'acc-a',
      }));
    });

    it('J3 — transferência com cardId deve falhar', async () => {
      await assertFails(commitTransferWithHistory(TX_TRANSFER_2, {
        cardId: 'card-123',
      }));
    });

    it('J4 — transferência sem fromAccountId deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      const payload = validTransferPayload();
      const { fromAccountId: _removed, ...payloadWithoutFrom } = payload as Record<string, unknown>;
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_TRANSFER_2), payloadWithoutFrom);
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_TRANSFER_2, 'history', 'create'), {
        action: 'CREATE', txId: TX_TRANSFER_2, createdAt: serverTimestamp(), schemaVersion: 1, origin: 'manual', amount_cents: 50000, category: 'Outros',
        after: { type: 'transferencia', toAccountId: 'acc-poupanca', value_cents: 50000, date: '2026-06-01' },
        changedFields: ['type', 'toAccountId', 'value_cents', 'date'],
      });
      await assertFails(batch.commit());
    });

    it('J5 — transferência com importHash deve falhar', async () => {
      await assertFails(commitTransferWithHistory(TX_TRANSFER_2, {
        importHash: 'a'.repeat(64),
      }));
    });

    it('J6 — não-transferência com fromAccountId deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_TRANSFER_2), {
        description: 'Despesa com fromAccountId inválido',
        value_cents: 50000,
        schemaVersion: 2,
        type: 'saida',
        category: 'Outros',
        date: '2026-06-01',
        source: 'manual',
        fromAccountId: 'acc-corrente',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_TRANSFER_2, 'history', 'create'), {
        action: 'CREATE', txId: TX_TRANSFER_2, createdAt: serverTimestamp(), schemaVersion: 1, origin: 'manual', amount_cents: 50000, category: 'Outros',
        after: { type: 'saida', value_cents: 50000, date: '2026-06-01' },
        changedFields: ['type', 'value_cents', 'date'],
      });
      await assertFails(batch.commit());
    });
  });

  // ── K. Parcelamentos e descriptionLower — FASE 19A ───────────────────────────

  describe('K. installment fields + descriptionLower (FASE 19A)', () => {
    const TX_INSTALLMENT = 'tx-installment-001';
    const GROUP_ID = 'group-abc-001';

    it('K1 — criação manual com installmentGroupId deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_INSTALLMENT), {
        description: 'Parcela 1/3',
        descriptionLower: 'parcela 1/3',
        value_cents: 10000,
        schemaVersion: 2,
        type: 'saida',
        category: 'Outros',
        date: '2026-06-01',
        source: 'manual',
        isRecurring: false,
        installmentGroupId: GROUP_ID,
        installmentIndex: 1,
        installmentCount: 3,
        installmentTotalCents: 30000,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_INSTALLMENT, 'history', 'create'), {
        action: 'CREATE',
        txId: TX_INSTALLMENT,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        amount_cents: 10000,
        category: 'Outros',
        changedFields: [
          'description', 'descriptionLower', 'value_cents', 'schemaVersion', 'type',
          'category', 'date', 'source', 'isRecurring',
          'installmentGroupId', 'installmentIndex', 'installmentCount', 'installmentTotalCents',
        ],
        after: {
          description: 'Parcela 1/3',
          descriptionLower: 'parcela 1/3',
          value_cents: 10000,
          schemaVersion: 2,
          type: 'saida',
          category: 'Outros',
          date: '2026-06-01',
          source: 'manual',
          isRecurring: false,
          installmentGroupId: GROUP_ID,
          installmentIndex: 1,
          installmentCount: 3,
          installmentTotalCents: 30000,
        },
      });
      await assertSucceeds(batch.commit());
    });

    it('K2 — criação manual com descriptionLower sem parcelamento deve passar', async () => {
      const TX_DESC = 'tx-desc-lower-001';
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_DESC), {
        description: 'Supermercado ABC',
        descriptionLower: 'supermercado abc',
        value_cents: 5000,
        schemaVersion: 2,
        type: 'saida',
        category: 'Alimentação',
        date: '2026-06-01',
        source: 'manual',
        isRecurring: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_DESC, 'history', 'create'), {
        action: 'CREATE',
        txId: TX_DESC,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        amount_cents: 5000,
        category: 'Alimentação',
        changedFields: [
          'description', 'descriptionLower', 'value_cents', 'schemaVersion',
          'type', 'category', 'date', 'source', 'isRecurring',
        ],
        after: {
          description: 'Supermercado ABC',
          descriptionLower: 'supermercado abc',
          value_cents: 5000,
          schemaVersion: 2,
          type: 'saida',
          category: 'Alimentação',
          date: '2026-06-01',
          source: 'manual',
          isRecurring: false,
        },
      });
      await assertSucceeds(batch.commit());
    });

    it('K3 — changedFields com installmentGroupId deve passar na validação', async () => {
      const TX_K3 = 'tx-cf-installment-001';
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_K3), {
        description: 'Parcela 2/3',
        descriptionLower: 'parcela 2/3',
        value_cents: 10000,
        schemaVersion: 2,
        type: 'saida',
        category: 'Outros',
        date: '2026-07-01',
        source: 'manual',
        isRecurring: false,
        installmentGroupId: GROUP_ID,
        installmentIndex: 2,
        installmentCount: 3,
        installmentTotalCents: 30000,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_K3, 'history', 'create'), {
        action: 'CREATE',
        txId: TX_K3,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
        origin: 'manual',
        amount_cents: 10000,
        category: 'Outros',
        changedFields: ['description', 'value_cents', 'schemaVersion', 'type', 'category', 'date', 'source', 'isRecurring', 'installmentGroupId', 'installmentIndex', 'installmentCount', 'installmentTotalCents', 'descriptionLower'],
        after: {
          description: 'Parcela 2/3',
          value_cents: 10000,
          schemaVersion: 2,
          type: 'saida',
          category: 'Outros',
          date: '2026-07-01',
          source: 'manual',
          isRecurring: false,
        },
      });
      await assertSucceeds(batch.commit());
    });

    it('K4 — campo extra proibido (privateField) ainda deve falhar', async () => {
      const TX_K4 = 'tx-bad-field-001';
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_K4), {
        description: 'Transação com campo proibido',
        value_cents: 5000,
        schemaVersion: 2,
        type: 'saida',
        category: 'Outros',
        date: '2026-06-01',
        source: 'manual',
        isRecurring: false,
        privateField: 'should-not-be-here',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', UID_A, 'transactions', TX_K4, 'history', 'create'), {
        action: 'CREATE', txId: TX_K4, createdAt: serverTimestamp(), schemaVersion: 1,
        origin: 'manual', amount_cents: 5000, category: 'Outros',
        after: { type: 'saida', value_cents: 5000, date: '2026-06-01', source: 'manual', isRecurring: false },
        changedFields: ['type', 'value_cents', 'date'],
      });
      await assertFails(batch.commit());
    });
  });

  // ── L. Goals — FASE 19A ──────────────────────────────────────────────────────

  describe('L. goals collection (FASE 19A)', () => {
    it('L1 — criar meta pelo owner deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'goals');
      await assertSucceeds(addDoc(ref, {
        name: 'Reserva de Emergência',
        targetCents: 1000000,
        currentCents: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    });

    it('L2 — criar meta com deadline e emoji deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'goals');
      await assertSucceeds(addDoc(ref, {
        name: 'Viagem',
        targetCents: 500000,
        currentCents: 50000,
        deadline: '2026-12-31',
        emoji: '✈️',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    });

    it('L3 — criar meta com campo extra proibido deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'goals');
      await assertFails(addDoc(ref, {
        name: 'Meta com campo extra',
        targetCents: 100000,
        currentCents: 0,
        secretField: 'should-fail',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    });

    it('L4 — usuário B não pode criar meta no path do usuário A', async () => {
      const bob = testEnv.authenticatedContext(UID_B);
      const ref = collection(bob.firestore(), 'users', UID_A, 'goals');
      await assertFails(addDoc(ref, {
        name: 'Meta invasora',
        targetCents: 100000,
        currentCents: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    });

    it('L5 — deletar meta pelo owner deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const ref = collection(db, 'users', UID_A, 'goals');
      const docRef = await addDoc(ref, {
        name: 'Meta para deletar',
        targetCents: 100000,
        currentCents: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await assertSucceeds(deleteDoc(docRef));
    });
  });

  // ── M. paidInvoiceMonth — pagamento de fatura (PR #251) ─────────────────────
  //
  // Cobre a validação do campo paidInvoiceMonth adicionado ao pipeline de pagamento
  // de fatura de cartão de crédito. O campo é válido apenas em:
  //   - transações do tipo 'saida' com 'source=manual'
  //   - quando 'cardId' está presente
  //   - formato YYYY-MM
  // Qualquer outra combinação deve ser rejeitada pelas Rules.

  describe('M. paidInvoiceMonth — pagamento de fatura', () => {
    const CARD_ID = 'card-m-test-001';
    const INVOICE_MONTH = '2026-06';

    // Payload base reutilizado em todos os testes M.
    // É o mesmo padrão usado por commitManualCreateBatch, mas inline para clareza.
    const paymentTxPayload = (overrides: Record<string, unknown> = {}) => ({
      description: 'Pagamento fatura Cartão M',
      value_cents:  50000,
      schemaVersion: 2,
      type:         'saida' as const,
      category:     'Outros',
      date:         '2026-06-17',
      source:       'manual' as const,
      isRecurring:  false,
      cardId:       CARD_ID,
      paidInvoiceMonth: INVOICE_MONTH,
      createdAt:    serverTimestamp(),
      updatedAt:    serverTimestamp(),
      ...overrides,
    });

    // History/create correspondente ao payload de pagamento.
    const paymentHistoryPayload = (
      txId: string,
      overrides: Record<string, unknown> = {},
    ) => ({
      action:       'CREATE' as const,
      txId,
      createdAt:    serverTimestamp(),
      schemaVersion: 1,
      origin:       'manual',
      amount_cents: 50000,
      category:     'Outros',
      changedFields: [
        'description', 'value_cents', 'schemaVersion', 'type',
        'category', 'date', 'source', 'isRecurring', 'cardId', 'paidInvoiceMonth',
      ],
      after: {
        description:      'Pagamento fatura Cartão M',
        value_cents:       50000,
        schemaVersion:     2,
        type:              'saida' as const,
        category:          'Outros',
        date:              '2026-06-17',
        source:            'manual' as const,
        isRecurring:       false,
        cardId:            CARD_ID,
        paidInvoiceMonth:  INVOICE_MONTH,
      },
      ...overrides,
    });

    const commitPaymentBatch = async (
      txId: string,
      txOverrides: Record<string, unknown> = {},
      historyOverrides: Record<string, unknown> = {},
    ) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', txId), paymentTxPayload(txOverrides));
      batch.set(
        doc(db, 'users', UID_A, 'transactions', txId, 'history', 'create'),
        paymentHistoryPayload(txId, historyOverrides),
      );
      return batch.commit();
    };

    // M1: fluxo completo de pagamento de fatura válido deve passar.
    it('M1 — CREATE pagamento de fatura com paidInvoiceMonth e cardId válidos deve passar', async () => {
      await assertSucceeds(commitPaymentBatch('tx-m1-payment-valid'));
    });

    // M2: paidInvoiceMonth com formato inválido (falta zero à esquerda) deve falhar.
    it('M2 — paidInvoiceMonth com formato inválido deve falhar', async () => {
      await assertFails(commitPaymentBatch('tx-m2-payment-badformat', {
        paidInvoiceMonth: '2026-6', // formato incorreto: falta zero
      }));
    });

    // M3: paidInvoiceMonth em transação do tipo 'transferencia' deve falhar.
    // A rule exige type == 'saida' quando paidInvoiceMonth está presente.
    it('M3 — paidInvoiceMonth em transferência deve falhar', async () => {
      await assertFails(commitPaymentBatch(
        'tx-m3-payment-transfer',
        { type: 'transferencia' },
        // after também tem type=transferencia para não introduzir divergência extra
        { after: {
          description: 'Pagamento fatura Cartão M',
          value_cents: 50000, schemaVersion: 2,
          type: 'transferencia' as const,
          category: 'Outros', date: '2026-06-17',
          source: 'manual' as const, isRecurring: false,
          cardId: CARD_ID, paidInvoiceMonth: INVOICE_MONTH,
        } },
      ));
    });

    // M4: paidInvoiceMonth sem cardId deve falhar.
    // A rule exige ('cardId' in data) quando paidInvoiceMonth está presente.
    it('M4 — paidInvoiceMonth sem cardId deve falhar', async () => {
      const txId = 'tx-m4-payment-nocardid';
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      // Monta manualmente sem cardId
      const txNoCard = paymentTxPayload();
      const { cardId: _c, ...txPayloadWithoutCard } = txNoCard as typeof txNoCard & { cardId: unknown };
      void _c;
      batch.set(doc(db, 'users', UID_A, 'transactions', txId), txPayloadWithoutCard);
      const histNoCard = paymentHistoryPayload(txId);
      const afterNoCard = { ...((histNoCard['after'] as Record<string, unknown>) ?? {}) };
      delete afterNoCard['cardId'];
      batch.set(
        doc(db, 'users', UID_A, 'transactions', txId, 'history', 'create'),
        { ...histNoCard, after: afterNoCard },
      );
      await assertFails(batch.commit());
    });

    // M5: history after.paidInvoiceMonth divergente da transaction deve falhar.
    // optionalHistoryFieldMatches exige tx.paidInvoiceMonth == after.paidInvoiceMonth.
    it('M5 — history after.paidInvoiceMonth divergente da transaction deve falhar', async () => {
      await assertFails(commitPaymentBatch(
        'tx-m5-payment-divergent',
        { paidInvoiceMonth: '2026-06' },
        { after: {
          description: 'Pagamento fatura Cartão M',
          value_cents: 50000, schemaVersion: 2,
          type: 'saida' as const,
          category: 'Outros', date: '2026-06-17',
          source: 'manual' as const, isRecurring: false,
          cardId: CARD_ID,
          paidInvoiceMonth: '2026-07', // divergente — deve falhar
        } },
      ));
    });
  });

  // ── N. decisions — Diário de Decisões do Agente (FASE H / H-0) ──────────────
  //
  // Cobre users/{uid}/decisions: create owner-only com whitelist e enum de intent,
  // update restrito à transição de status, delete bloqueado e isolamento por uid.
  // Ver docs/AI_DECISION_JOURNAL.md.

  describe('N. decisions collection (FASE H)', () => {
    const validDecision = (overrides: Record<string, unknown> = {}) => ({
      userId: UID_A,
      createdAt: serverTimestamp(),
      intent: 'simulate_purchase',
      question: 'Posso comprar um notebook de R$ 4.000?',
      toolsUsed: ['purchaseSimulator'],
      userDecision: 'none',
      outcomeStatus: 'n/a',
      ...overrides,
    });

    it('N1 — criar decisão válida pelo owner deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'decisions');
      await assertSucceeds(addDoc(ref, validDecision()));
    });

    it('N2 — criar com campos opcionais (snapshotRef, simulationResult) deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'decisions');
      await assertSucceeds(addDoc(ref, validDecision({
        snapshotRef: 'snap-abc123',
        simulationResult: { effectiveLimitAfterCents: 120000 },
        proposedAction: { kind: 'register_purchase' },
      })));
    });

    it('N3 — intent fora do enum deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'decisions');
      await assertFails(addDoc(ref, validDecision({ intent: 'hack_the_bank' })));
    });

    it('N4 — userDecision fora do enum deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'decisions');
      await assertFails(addDoc(ref, validDecision({ userDecision: 'maybe' })));
    });

    it('N5 — campo extra fora da whitelist deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'decisions');
      await assertFails(addDoc(ref, validDecision({ rawStatement: 'CPF 123.456.789-00' })));
    });

    it('N6 — userId divergente do path deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = collection(alice.firestore(), 'users', UID_A, 'decisions');
      await assertFails(addDoc(ref, validDecision({ userId: UID_B })));
    });

    it('N7 — usuário B não pode criar no path do usuário A', async () => {
      const bob = testEnv.authenticatedContext(UID_B);
      const ref = collection(bob.firestore(), 'users', UID_A, 'decisions');
      await assertFails(addDoc(ref, validDecision()));
    });

    it('N8 — update apenas de status (userDecision/outcomeStatus) deve passar', async () => {
      const id = 'decision-n8';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'decisions', id), {
          userId: UID_A, createdAt: FIXED_TS, intent: 'simulate_purchase',
          question: 'Posso comprar?', toolsUsed: ['purchaseSimulator'],
          userDecision: 'none', outcomeStatus: 'pending',
        });
      });
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = doc(alice.firestore(), 'users', UID_A, 'decisions', id);
      await assertSucceeds(updateDoc(ref, { userDecision: 'confirmed', outcomeStatus: 'applied' }));
    });

    it('N9 — update tentando alterar intent (imutável) deve falhar', async () => {
      const id = 'decision-n9';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'decisions', id), {
          userId: UID_A, createdAt: FIXED_TS, intent: 'simulate_purchase',
          question: 'Posso comprar?', toolsUsed: ['purchaseSimulator'],
          userDecision: 'none', outcomeStatus: 'pending',
        });
      });
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = doc(alice.firestore(), 'users', UID_A, 'decisions', id);
      await assertFails(updateDoc(ref, { intent: 'get_balances' }));
    });

    it('N10 — delete client-side deve falhar (append-mostly)', async () => {
      const id = 'decision-n10';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'decisions', id), {
          userId: UID_A, createdAt: FIXED_TS, intent: 'simulate_purchase',
          question: 'Posso comprar?', toolsUsed: ['purchaseSimulator'],
          userDecision: 'none', outcomeStatus: 'pending',
        });
      });
      const alice = testEnv.authenticatedContext(UID_A);
      const ref = doc(alice.firestore(), 'users', UID_A, 'decisions', id);
      await assertFails(deleteDoc(ref));
    });
  });

  // ── O. usage/ai_calls — rate limit de IA server-only (correção P1 F-02) ──────
  // A escrita client-side permitia resetar o contador (`count <= 1`) e furar o
  // teto diário de chamadas de IA. Agora só o Admin SDK escreve
  // (checkAndIncrementRateLimit); o owner mantém leitura (export LGPD).

  describe('O. usage/ai_calls server-only (P1 F-02)', () => {
    it('O1 — CREATE client-side pelo owner deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(setDoc(doc(alice.firestore(), 'users', UID_A, 'usage', 'ai_calls'), {
        count: 1,
        lastReset: serverTimestamp(),
      }));
    });

    it('O2 — UPDATE incremental client-side deve falhar', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'usage', 'ai_calls'), {
          count: 10, lastReset: FIXED_TS,
        });
      });
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(updateDoc(doc(alice.firestore(), 'users', UID_A, 'usage', 'ai_calls'), {
        count: 11, lastReset: FIXED_TS,
      }));
    });

    it('O3 — RESET do contador para count=1 deve falhar (caminho do bypass)', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'usage', 'ai_calls'), {
          count: 50, lastReset: FIXED_TS,
        });
      });
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(updateDoc(doc(alice.firestore(), 'users', UID_A, 'usage', 'ai_calls'), {
        count: 1, lastReset: serverTimestamp(),
      }));
    });

    it('O4 — DELETE client-side deve falhar', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'usage', 'ai_calls'), {
          count: 5, lastReset: FIXED_TS,
        });
      });
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(deleteDoc(doc(alice.firestore(), 'users', UID_A, 'usage', 'ai_calls')));
    });

    it('O5 — READ pelo owner deve passar (export LGPD)', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'usage', 'ai_calls'), {
          count: 5, lastReset: FIXED_TS,
        });
      });
      const alice = testEnv.authenticatedContext(UID_A);
      await assertSucceeds(getDoc(doc(alice.firestore(), 'users', UID_A, 'usage', 'ai_calls')));
    });

    it('O6 — READ por outro usuário deve falhar', async () => {
      const bob = testEnv.authenticatedContext(UID_B);
      await assertFails(getDoc(doc(bob.firestore(), 'users', UID_A, 'usage', 'ai_calls')));
    });
  });

  // ── Bloco P — shoppingLists: validação de create/update ──────────────────────
  describe('P — shoppingLists: isValidShoppingListCreate + isValidShoppingListUpdate', () => {
    const LIST_ID = 'list-001';
    const validList = {
      uid:                 UID_A,
      name:                'Mercado',
      estimatedTotalCents: 0,
      status:              'open',
      items:               [],
      schemaVersion:       1,
      createdAt:           serverTimestamp(),
      updatedAt:           serverTimestamp(),
    };

    async function seedList(overrides: Record<string, unknown> = {}) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', UID_A, 'shoppingLists', LIST_ID), {
          ...validList,
          createdAt: FIXED_TS,
          updatedAt: FIXED_TS,
          ...overrides,
        });
      });
    }

    it('P1 — CREATE válido deve passar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      await assertSucceeds(setDoc(doc(alice.firestore(), 'users', UID_A, 'shoppingLists', 'list-p1'), validList));
    });

    it('P2 — CREATE com uid diferente do owner deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(setDoc(doc(alice.firestore(), 'users', UID_A, 'shoppingLists', 'list-p2'), {
        ...validList, uid: UID_B,
      }));
    });

    it('P3 — CREATE com campo extra proibido deve falhar', async () => {
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(setDoc(doc(alice.firestore(), 'users', UID_A, 'shoppingLists', 'list-p3'), {
        ...validList, malicious: 'injection',
      }));
    });

    it('P4 — UPDATE válido (status + updatedAt) deve passar', async () => {
      await seedList();
      const alice = testEnv.authenticatedContext(UID_A);
      await assertSucceeds(updateDoc(doc(alice.firestore(), 'users', UID_A, 'shoppingLists', LIST_ID), {
        status:    'done',
        updatedAt: serverTimestamp(),
      }));
    });

    it('P5 — UPDATE que muda uid deve falhar', async () => {
      await seedList();
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(updateDoc(doc(alice.firestore(), 'users', UID_A, 'shoppingLists', LIST_ID), {
        uid:       UID_B,
        updatedAt: serverTimestamp(),
      }));
    });

    it('P6 — UPDATE com campo extra proibido deve falhar', async () => {
      await seedList();
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(updateDoc(doc(alice.firestore(), 'users', UID_A, 'shoppingLists', LIST_ID), {
        malicious: 'injection',
        updatedAt: serverTimestamp(),
      }));
    });

    it('P7 — UPDATE sem updatedAt == request.time deve falhar', async () => {
      await seedList();
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(updateDoc(doc(alice.firestore(), 'users', UID_A, 'shoppingLists', LIST_ID), {
        status: 'done',
        updatedAt: FIXED_TS,
      }));
    });

    it('P8 — UPDATE com status inválido deve falhar', async () => {
      await seedList();
      const alice = testEnv.authenticatedContext(UID_A);
      await assertFails(updateDoc(doc(alice.firestore(), 'users', UID_A, 'shoppingLists', LIST_ID), {
        status:    'invalid_status',
        updatedAt: serverTimestamp(),
      }));
    });

    it('P9 — READ por outro usuário deve falhar', async () => {
      await seedList();
      const bob = testEnv.authenticatedContext(UID_B);
      await assertFails(getDoc(doc(bob.firestore(), 'users', UID_A, 'shoppingLists', LIST_ID)));
    });

    it('P10 — UPDATE com linkedTransactionId string deve passar', async () => {
      await seedList();
      const alice = testEnv.authenticatedContext(UID_A);
      await assertSucceeds(updateDoc(doc(alice.firestore(), 'users', UID_A, 'shoppingLists', LIST_ID), {
        linkedTransactionId: 'tx-abc',
        updatedAt:           serverTimestamp(),
      }));
    });
  });

  // ── Bloco Q — groups: invite/accept flow ──────────────────────────────────────
  describe('Q — groups: convite e aceite de membros', () => {
    const GROUP_ID  = 'group-q-001';
    const INVITE_ID = 'invite-q-001';
    const EMAIL_A   = 'alice@test.com';
    const EMAIL_B   = 'bob@test.com';

    const seedGroup = async (overrides: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'groups', GROUP_ID), {
          name:          'Grupo Teste',
          ownerUid:      UID_A,
          memberUids:    [UID_A],
          members:       [],
          schemaVersion: 1,
          createdAt:     FIXED_TS,
          updatedAt:     FIXED_TS,
          ...overrides,
        });
      });
    };

    const seedInvite = async (status = 'pending', overrides: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'groups', GROUP_ID, 'invites', INVITE_ID), {
          groupId:             GROUP_ID,
          groupName:           'Grupo Teste',
          inviterUid:          UID_A,
          inviterDisplayName:  'Alice',
          inviteeEmail:        EMAIL_B,
          status,
          schemaVersion:       1,
          createdAt:           FIXED_TS,
          expiresAt:           '2030-01-01T00:00:00.000Z',
          ...overrides,
        });
      });
    };

    it('Q1 — owner cria convite válido deve passar', async () => {
      await seedGroup();
      const alice = testEnv.authenticatedContext(UID_A, { email: EMAIL_A });
      await assertSucceeds(addDoc(
        collection(alice.firestore(), 'groups', GROUP_ID, 'invites'),
        {
          groupId:             GROUP_ID,
          groupName:           'Grupo Teste',
          inviterUid:          UID_A,
          inviterDisplayName:  'Alice',
          inviteeEmail:        EMAIL_B,
          status:              'pending',
          schemaVersion:       1,
          createdAt:           serverTimestamp(),
          expiresAt:           '2030-01-01T00:00:00.000Z',
        },
      ));
    });

    it('Q2 — não-owner não pode criar convite', async () => {
      await seedGroup();
      const bob = testEnv.authenticatedContext(UID_B, { email: EMAIL_B });
      await assertFails(addDoc(
        collection(bob.firestore(), 'groups', GROUP_ID, 'invites'),
        {
          groupId:             GROUP_ID,
          groupName:           'Grupo Teste',
          inviterUid:          UID_B,
          inviterDisplayName:  'Bob',
          inviteeEmail:        EMAIL_A,
          status:              'pending',
          schemaVersion:       1,
          createdAt:           serverTimestamp(),
          expiresAt:           '2030-01-01T00:00:00.000Z',
        },
      ));
    });

    it('Q3 — invitee lê o próprio convite (email match) deve passar', async () => {
      await seedGroup();
      await seedInvite();
      const bob = testEnv.authenticatedContext(UID_B, { email: EMAIL_B });
      await assertSucceeds(getDoc(doc(bob.firestore(), 'groups', GROUP_ID, 'invites', INVITE_ID)));
    });

    it('Q4 — terceiro não-relacionado não pode ler convite', async () => {
      await seedGroup();
      await seedInvite();
      const stranger = testEnv.authenticatedContext('user-stranger');
      await assertFails(getDoc(doc(stranger.firestore(), 'groups', GROUP_ID, 'invites', INVITE_ID)));
    });

    it('Q5 — owner não pode adicionar membro diretamente (sem invite flow) deve falhar', async () => {
      await seedGroup();
      const alice = testEnv.authenticatedContext(UID_A, { email: EMAIL_A });
      await assertFails(updateDoc(doc(alice.firestore(), 'groups', GROUP_ID), {
        memberUids: [UID_A, UID_B],
        members:    [{ uid: UID_B, displayName: 'Bob', email: EMAIL_B }],
        updatedAt:  serverTimestamp(),
      }));
    });

    it('Q6 — owner pode atualizar nome do grupo', async () => {
      await seedGroup();
      const alice = testEnv.authenticatedContext(UID_A, { email: EMAIL_A });
      await assertSucceeds(updateDoc(doc(alice.firestore(), 'groups', GROUP_ID), {
        name:      'Novo Nome',
        updatedAt: serverTimestamp(),
      }));
    });

    it('Q7 — invitee aceita convite (status pending→accepted) deve passar', async () => {
      await seedGroup();
      await seedInvite('pending');
      const bob = testEnv.authenticatedContext(UID_B, { email: EMAIL_B });
      await assertSucceeds(updateDoc(
        doc(bob.firestore(), 'groups', GROUP_ID, 'invites', INVITE_ID),
        { status: 'accepted', acceptedAt: serverTimestamp() },
      ));
    });

    it('Q8 — invitee rejeita convite (status pending→rejected) deve passar', async () => {
      await seedGroup();
      await seedInvite('pending');
      const bob = testEnv.authenticatedContext(UID_B, { email: EMAIL_B });
      await assertSucceeds(updateDoc(
        doc(bob.firestore(), 'groups', GROUP_ID, 'invites', INVITE_ID),
        { status: 'rejected' },
      ));
    });

    it('Q9 — terceiro não pode alterar status do convite', async () => {
      await seedGroup();
      await seedInvite('pending');
      const stranger = testEnv.authenticatedContext('user-stranger', { email: 'stranger@test.com' });
      await assertFails(updateDoc(
        doc(stranger.firestore(), 'groups', GROUP_ID, 'invites', INVITE_ID),
        { status: 'accepted' },
      ));
    });

    it('Q10 — invitee entra no grupo via convite aceito deve passar', async () => {
      await seedGroup();
      await seedInvite('accepted');
      const bob = testEnv.authenticatedContext(UID_B, { email: EMAIL_B });
      await assertSucceeds(updateDoc(doc(bob.firestore(), 'groups', GROUP_ID), {
        memberUids:            [UID_A, UID_B],
        members:               [{ uid: UID_B, displayName: 'Bob', email: EMAIL_B }],
        updatedAt:             serverTimestamp(),
        _lastAcceptedInviteId: INVITE_ID,
      }));
    });
  });

  // ── R. competencia field in Rules ─────────────────────────────────────────────
  // Cobre a regressão descoberta na auditoria tripla 2026-07-02:
  // installmentRepo.createInstallmentGroupWithHistory grava 'competencia' no txPayload
  // mas o campo estava ausente de txAllowedKeys() → permission-denied ao criar parcelas.
  //
  // Abordagem: 'competencia' adicionado a txAllowedKeys() nas Rules. O afterSnapshot do
  // history NÃO inclui 'competencia' (campo derivável, já removido de installmentRepo.ts:88)
  // para não aumentar a contagem de expressões numa Rules file que já está perto do limite
  // de 1000 expressões do avaliador Firestore.
  //
  // Os testes abaixo usam o mesmo padrão do D2 (campos obrigatórios + isRecurring) e
  // acrescentam apenas 'competencia' no txPayload (não no after), espelhando o que
  // installmentRepo.ts agora faz.

  describe('R. campo competencia nas Rules (regressão auditoria 2026-07-02)', () => {
    const txWithCompetencia = (txId: string, competencia: string | null = '2026-07') => ({
      description:   'Parcela teste (1/3)',
      value_cents:   50000,
      schemaVersion: 2 as const,
      type:          'saida' as const,
      category:      'Eletrônicos',
      date:          '2026-07-01',
      source:        'manual' as const,
      isRecurring:   false,
      ...(competencia !== null ? { competencia } : {}),
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
    });

    // after snapshot sem competencia — espelha o comportamento pós-fix de installmentRepo.ts
    const afterWithoutCompetencia = () => ({
      description:   'Parcela teste (1/3)',
      value_cents:   50000,
      schemaVersion: 2 as const,
      type:          'saida' as const,
      category:      'Eletrônicos',
      date:          '2026-07-01',
      source:        'manual' as const,
      isRecurring:   false,
    });

    const historyFor = (txId: string) => ({
      action:        'CREATE' as const,
      txId,
      createdAt:     serverTimestamp(),
      schemaVersion: 1,
      origin:        'manual',
      amount_cents:  50000,
      category:      'Eletrônicos',
      changedFields: [
        'description', 'value_cents', 'schemaVersion', 'type',
        'category', 'date', 'source', 'isRecurring',
      ],
      after: afterWithoutCompetencia(),
    });

    const commitBatch = async (txId: string, txPayload: Record<string, unknown>) => {
      const alice = testEnv.authenticatedContext(UID_A);
      const db = alice.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', UID_A, 'transactions', txId), txPayload);
      batch.set(
        doc(db, 'users', UID_A, 'transactions', txId, 'history', 'create'),
        historyFor(txId),
      );
      return batch.commit();
    };

    it('R1 — CREATE com competencia no txPayload deve passar', async () => {
      await assertSucceeds(commitBatch('tx-competencia-r1', txWithCompetencia('tx-competencia-r1')));
    });

    it('R2 — CREATE sem competencia deve passar (campo opcional)', async () => {
      await assertSucceeds(commitBatch('tx-competencia-r2', txWithCompetencia('tx-competencia-r2', null)));
    });

    it('R3 — CREATE com campo não permitido deve falhar', async () => {
      await assertFails(commitBatch('tx-competencia-r3', {
        ...txWithCompetencia('tx-competencia-r3'),
        campoDesconhecido: 'valor',
      }));
    });
  });
});

