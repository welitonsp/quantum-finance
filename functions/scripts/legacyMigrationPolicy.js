/**
 * functions/scripts/legacyMigrationPolicy.js
 * 
 * Classificador puro para migração de transações legadas.
 * Não possui efeitos colaterais. Não realiza escritas em banco de dados.
 */

function isSafeCents(value) {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function classifyLegacyTransaction(docData) {
  if (!docData || typeof docData !== 'object' || Array.isArray(docData)) {
    return { status: 'unknownShape', decision: 'migrationBlocked' };
  }

  const hasSchemaVersion2 = docData.schemaVersion === 2;
  const isValueCentsSafe = isSafeCents(docData.value_cents);
  const hasValue = 'value' in docData;

  if (hasSchemaVersion2) {
    if (isValueCentsSafe) {
      return { status: 'alreadyV2', decision: 'ignored' };
    } else {
      return { status: 'unknownShape', decision: 'migrationBlocked' };
    }
  }

  if (isValueCentsSafe) {
    return { status: 'v1WithSafeValueCents', decision: 'migrationEligible' };
  }

  // Se não tem value_cents seguro nem schemaVersion 2, é legado
  if (hasValue && typeof docData.value === 'number') {
    return { status: 'v1FloatOnlyUnsafe', decision: 'adminRepairRequired' };
  }

  return { status: 'v1MissingValueCents', decision: 'adminRepairRequired' };
}

function buildMigrationPlan(docData, classification) {
  if (classification.decision !== 'migrationEligible') {
    return null;
  }

  const plan = {
    schemaVersion: 2
  };

  // source ausente NÃO vira 'manual' automaticamente. Preservamos o que existe, se existir.
  if (docData.source !== undefined) {
    plan.source = docData.source;
  }

  // O plano de atualização não pode conter campos proibidos.
  // Como estamos apenas atualizando a schemaVersion e source,
  // campos como id, uid, importHash, value não entram no patch final.
  
  return plan;
}

module.exports = {
  classifyLegacyTransaction,
  buildMigrationPlan
};
