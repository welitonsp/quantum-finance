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
  action: 'CREATE' as const,
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
    // A1: payload mínimo válido com serverTimestamp satisfaz createdAt == request.time
    it('A1 — CREATE válido pelo owner deve passar', async () => {
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
});
