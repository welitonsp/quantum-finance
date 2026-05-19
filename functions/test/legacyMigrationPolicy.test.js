const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');
const { classifyLegacyTransaction, buildMigrationPlan } = require('../scripts/legacyMigrationPolicy');

describe('Legacy Migration Policy Guardrails (10D-1B)', () => {

  describe('Classificação de Transações', () => {
    it('1. Float legado com { value: 12.34 } e sem value_cents é bloqueado (adminRepairRequired)', () => {
      const doc = { value: 12.34, description: 'Teste' };
      const classification = classifyLegacyTransaction(doc);
      assert.strictEqual(classification.status, 'v1FloatOnlyUnsafe');
      assert.strictEqual(classification.decision, 'adminRepairRequired');
    });

    it('2. v1 com value_cents inteiro seguro é migrationEligible', () => {
      const doc = { value_cents: 1000, description: 'Teste v1' };
      const classification = classifyLegacyTransaction(doc);
      assert.strictEqual(classification.status, 'v1WithSafeValueCents');
      assert.strictEqual(classification.decision, 'migrationEligible');
    });

    it('3. schemaVersion 2 com value_cents seguro é ignored (alreadyV2)', () => {
      const doc = { schemaVersion: 2, value_cents: 1500, description: 'Teste v2' };
      const classification = classifyLegacyTransaction(doc);
      assert.strictEqual(classification.status, 'alreadyV2');
      assert.strictEqual(classification.decision, 'ignored');
    });

    it('4. value_cents inválido bloqueia (decimal, NaN, Infinity, string, unsafe integer)', () => {
      const invalids = [
        12.34, // decimal
        NaN,
        Infinity,
        -Infinity,
        '1000', // string
        Number.MAX_SAFE_INTEGER + 1 // unsafe integer
      ];

      for (const val of invalids) {
        const doc = { value_cents: val };
        const classification = classifyLegacyTransaction(doc);
        assert.notStrictEqual(classification.decision, 'migrationEligible');
      }
    });
  });

  describe('Construção do Plano Sanitizado', () => {
    it('5. source ausente não vira manual', () => {
      const doc = { value_cents: 2000 };
      const classification = classifyLegacyTransaction(doc);
      const plan = buildMigrationPlan(doc, classification);
      assert.ok(plan);
      assert.ok(!('source' in plan));
    });

    it('6. importHash fica intocado no documento (não é atualizado/adicionado no plano)', () => {
      const doc = { value_cents: 2000, importHash: 'abcd1234efgh5678' };
      const classification = classifyLegacyTransaction(doc);
      const plan = buildMigrationPlan(doc, classification);
      assert.ok(plan);
      assert.ok(!('importHash' in plan));
    });

    it('7. plano sanitizado não contém id, uid, importHash, value', () => {
      const doc = { 
        id: 'tx-1', 
        uid: 'user-1', 
        importHash: 'abcd', 
        value: 20.00, 
        value_cents: 2000 
      };
      const classification = classifyLegacyTransaction(doc);
      const plan = buildMigrationPlan(doc, classification);
      assert.ok(plan);
      assert.ok(!('id' in plan));
      assert.ok(!('uid' in plan));
      assert.ok(!('importHash' in plan));
      assert.ok(!('value' in plan));
    });

    it('10. alreadyV2 não gera plano de update/history', () => {
      const doc = { schemaVersion: 2, value_cents: 1000 };
      const classification = classifyLegacyTransaction(doc);
      const plan = buildMigrationPlan(doc, classification);
      assert.strictEqual(plan, null);
    });
  });

  describe('Guardrails Estáticos (Anti-Flutuação e Efeitos Colaterais)', () => {
    it('8. Teste estático garante ausência de Math.round, parseFloat, Number(, e value * 100', () => {
      const scriptPath = path.join(__dirname, '../scripts/legacyMigrationPolicy.js');
      const content = fs.readFileSync(scriptPath, 'utf8');

      assert.ok(!content.includes('Math.round'), 'Proibido usar Math.round');
      assert.ok(!content.includes('parseFloat'), 'Proibido usar parseFloat');
      assert.ok(!content.includes('Number('), 'Proibido usar conversão explicita via Number(');
      assert.ok(!content.includes('value * 100'), 'Proibido usar valor legado multiplicado por 100');
    });

    it('9. Teste estático garante ausência de commit/set/update/delete/batch e writeBatch', () => {
      const scriptPath = path.join(__dirname, '../scripts/legacyMigrationPolicy.js');
      const content = fs.readFileSync(scriptPath, 'utf8');

      assert.ok(!content.includes('batch.commit'), 'Proibido usar batch.commit');
      assert.ok(!content.includes('.commit('), 'Proibido usar .commit(');
      assert.ok(!content.includes('.set('), 'Proibido usar .set(');
      assert.ok(!content.includes('.update('), 'Proibido usar .update(');
      assert.ok(!content.includes('.delete('), 'Proibido usar .delete(');
      assert.ok(!content.includes('admin.firestore().batch()'), 'Proibido usar admin batch');
      assert.ok(!content.includes('writeBatch'), 'Proibido usar writeBatch');
    });
  });

});