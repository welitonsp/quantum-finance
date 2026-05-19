const assert = require('node:assert/strict');
const { describe, it, beforeEach, afterEach } = require('node:test');
const admin = require('firebase-admin');

// Mock console to avoid cluttering test output
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const capturedLogs = [];

function mockLogs() {
  capturedLogs.length = 0;
  console.log = (...args) => capturedLogs.push(args.join(' '));
  console.warn = (...args) => capturedLogs.push(args.join(' '));
  console.error = (...args) => capturedLogs.push(args.join(' '));
}

function restoreLogs() {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
}

// Mock Admin SDK by replacing it in require.cache
const adminModulePath = require.resolve('firebase-admin');
const originalAdminModule = require.cache[adminModulePath];

let mockUsers = [];
let mockTransactions = [];

const mockDb = {
  collection(name) {
    if (name === 'users') {
      return {
        limit: () => ({
          get: async () => ({
            docs: mockUsers.map(u => ({
              id: u.id,
              ref: {
                collection: (subname) => {
                  if (subname === 'transactions') {
                    return {
                      limit: () => ({
                        get: async () => ({
                          docs: mockTransactions.filter(t => t.uid === u.id).map(t => ({
                            id: t.id,
                            data: () => t.data
                          }))
                        })
                      })
                    };
                  }
                  return null;
                }
              }
            }))
          })
        })
      };
    }
    return null;
  }
};

const mockAdmin = {
  apps: [],
  initializeApp() {
    this.apps.push({});
    return {};
  },
  firestore: () => mockDb
};

require.cache[adminModulePath] = {
  id: adminModulePath,
  filename: adminModulePath,
  loaded: true,
  exports: mockAdmin,
};

// Now require the script after mocking admin
const { runDiagnostics } = require('../scripts/diagnoseLegacyTransactions');

describe('Diagnostic Script: diagnoseLegacyTransactions', () => {
  beforeEach(() => {
    mockLogs();
    mockUsers = [];
    mockTransactions = [];
  });

  afterEach(() => {
    restoreLogs();
  });

  it('deve rodar em modo DRY-RUN por padrão e não imprimir PII', async () => {
    mockUsers = [{ id: 'user-1' }];
    mockTransactions = [
      {
        uid: 'user-1',
        id: 'tx-1',
        data: {
          description: 'Test',
          value_cents: 1000,
          schemaVersion: 2,
          type: 'saida',
          category: 'Outros',
          date: '2026-01-01',
          source: 'manual',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      }
    ];

    const result = await runDiagnostics();
    
    assert.equal(result.totalAnalyzed, 1);
    assert.equal(result.issuesCount.missingCreatedAt, 0);
    
    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('user-1'), 'User ID should be anonymized');
    assert.ok(!allLogs.includes('tx-1'), 'Transaction ID should be anonymized');
  });

  it('deve identificar transações com createdAt ausente', async () => {
    mockUsers = [{ id: 'user-1' }];
    mockTransactions = [
      {
        uid: 'user-1',
        id: 'tx-no-date',
        data: {
          description: 'Test',
          value_cents: 1000,
          schemaVersion: 2,
          type: 'saida',
          category: 'Outros',
          date: '2026-01-01',
          source: 'manual',
          // createdAt ausente
          updatedAt: new Date(),
        }
      }
    ];

    const result = await runDiagnostics();
    assert.equal(result.issuesCount.missingCreatedAt, 1);
  });

  it('deve identificar campos com tipos inválidos', async () => {
    mockUsers = [{ id: 'user-1' }];
    mockTransactions = [
      {
        uid: 'user-1',
        id: 'tx-invalid-type',
        data: {
          description: 123, // deveria ser string
          value_cents: '1000', // deveria ser number
          schemaVersion: 2,
          type: 'saida',
          category: 'Outros',
          date: '2026-01-01',
          source: 'manual',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      }
    ];

    const result = await runDiagnostics();
    assert.equal(result.issuesCount.invalidFieldType, 1);
  });
});

// Cleanup Admin SDK mock at the end
if (originalAdminModule) {
  require.cache[adminModulePath] = originalAdminModule;
} else {
  delete require.cache[adminModulePath];
}
