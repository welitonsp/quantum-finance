const admin = require('firebase-admin');

// Initialize with default credentials, assuming GOOGLE_APPLICATION_CREDENTIALS or emulator
if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: 'demo-quantum-finance' });
}

const db = admin.firestore();

// O script deve rodar em modo dry-run por padrão
const isWriteMode = process.argv.includes('--write');

const ESSENTIAL_FIELDS = [
  'description',
  'value_cents',
  'schemaVersion',
  'type',
  'category',
  'date',
  'source',
  'createdAt',
  'updatedAt'
];

async function runDiagnostics() {
  console.log('--- Diagnóstico de Transações Legadas ---');
  console.log(`Modo: ${isWriteMode ? 'WRITE (Não autorizado)' : 'DRY-RUN'}\n`);

  if (isWriteMode) {
    console.warn('WRITE MODE bloqueado temporariamente por segurança até auditoria.');
    return;
  }

  let totalAnalyzed = 0;
  const issuesCount = {
    missingCreatedAt: 0,
    missingEssentialField: 0,
    invalidFieldType: 0,
  };
  
  const sampleIssues = {
    missingCreatedAt: null,
    missingEssentialField: null,
    invalidFieldType: null,
  };

  try {
    const usersSnapshot = await db.collection('users').limit(50).get();
    
    for (const userDoc of usersSnapshot.docs) {
      const txSnapshot = await userDoc.ref.collection('transactions').limit(500).get();
      
      for (const txDoc of txSnapshot.docs) {
        totalAnalyzed++;
        const data = txDoc.data();
        let hasIssue = false;

        // 1. Missing createdAt
        if (!data.createdAt) {
          issuesCount.missingCreatedAt++;
          if (!sampleIssues.missingCreatedAt) {
            sampleIssues.missingCreatedAt = { docId: 'anon-id' };
          }
          hasIssue = true;
        }

        // 2. Missing other essential fields
        const missingFields = ESSENTIAL_FIELDS.filter(f => data[f] === undefined);
        if (missingFields.length > 0) {
          issuesCount.missingEssentialField++;
          if (!sampleIssues.missingEssentialField) {
            sampleIssues.missingEssentialField = { missingFields };
          }
          hasIssue = true;
        }

        // 3. Invalid field types for essential fields
        const invalidTypes = [];
        if (data.description !== undefined && typeof data.description !== 'string') invalidTypes.push('description');
        if (data.value_cents !== undefined && typeof data.value_cents !== 'number') invalidTypes.push('value_cents');
        
        const rawType = data.type;
        const normalizedType = typeof rawType === 'string' ? rawType.toLowerCase() : '';
        if (data.type !== undefined && !['entrada', 'saida', 'receita', 'despesa'].includes(normalizedType)) {
          invalidTypes.push('type');
        }
        
        if (data.date !== undefined && typeof data.date !== 'string') invalidTypes.push('date');
        
        if (invalidTypes.length > 0) {
          issuesCount.invalidFieldType++;
          if (!sampleIssues.invalidFieldType) {
            sampleIssues.invalidFieldType = { invalidTypes };
          }
        }
      }
    }

    console.log(`Total de transações analisadas: ${totalAnalyzed}`);
    console.log('\nContagem de problemas encontrados:');
    console.log(`- createdAt ausente: ${issuesCount.missingCreatedAt}`);
    console.log(`- campos essenciais ausentes: ${issuesCount.missingEssentialField}`);
    console.log(`- tipos inválidos em campos essenciais: ${issuesCount.invalidFieldType}`);
    
    console.log('\nExemplos anonimizados por tipo de problema (sem valores sensíveis):');
    console.log(`- missingCreatedAt: ${JSON.stringify(sampleIssues.missingCreatedAt)}`);
    console.log(`- missingEssentialField: ${JSON.stringify(sampleIssues.missingEssentialField)}`);
    console.log(`- invalidFieldType: ${JSON.stringify(sampleIssues.invalidFieldType)}`);
    
    console.log('\nFim do diagnóstico.');
    return { totalAnalyzed, issuesCount };

  } catch (error) {
    console.error('Erro ao executar diagnóstico:', error);
    throw error;
  }
}

if (require.main === module) {
  runDiagnostics();
}

module.exports = { runDiagnostics, ESSENTIAL_FIELDS };
