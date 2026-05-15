import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Console Logging Policy Test
 * 
 * Por que este teste existe?
 * Para evitar regressões de observabilidade onde logs crus (console.log, console.error) 
 * que podem conter dados sensíveis (PII, payloads financeiros, UIDs) sejam introduzidos 
 * no código de produção.
 * 
 * Política:
 * 1. console.error, console.log, console.debug, console.trace são PROIBIDOS no src.
 * 2. console.warn e console.info são permitidos APENAS se protegidos por 'import.meta.env.DEV'.
 * 3. Exceções arquiteturais explícitas são listadas abaixo.
 * 
 * Se você precisar logar um erro técnico do Firebase ou de fluxo financeiro, 
 * use 'logSanitizedFirebaseError' de 'src/shared/lib/firebaseErrorHandling.ts'.
 */

const SRC_DIR = path.resolve(__dirname, '..');

type ExceptionRule = { method: string; requiredText?: string };

const ALLOWED_EXCEPTIONS: Record<string, ExceptionRule[]> = {
  // Monkey patch para silenciar ruidoso Recharts/ResizeObserver em produção
  'src/App.tsx': [{ method: 'warn' }],
  // Sink oficial de logs sanitizados
  'src/shared/lib/firebaseErrorHandling.ts': [{ method: 'warn' }],
  // Mensagem estática tolerável sem payload
  'src/shared/lib/pdfParser.ts': [{ method: 'warn' }],
  // Log técnico de falha final de sincronização (sem PII)
  'src/hooks/useTransactions.ts': [{ 
    method: 'warn', 
    requiredText: '[SyncQueue] operação descartada após tentativas' 
  }],
};

const IGNORED_FILES = [
  'setup.ts',
];

const IGNORED_EXTENSIONS = [
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
];

const IGNORED_DIRS = [
  'node_modules',
  'dist',
  'coverage',
  '.git',
];

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.includes(file)) {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      const isIgnoredFile = IGNORED_FILES.includes(file) || 
                          IGNORED_EXTENSIONS.some(ext => file.endsWith(ext));
      if (!isIgnoredFile) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

describe('Política de Logging de Console', () => {
  const files = getAllFiles(SRC_DIR);

  files.forEach((file) => {
    const relativePath = path.relative(path.resolve(SRC_DIR, '..'), file).replace(/\\/g, '/');

    it(`O arquivo ${relativePath} deve cumprir a política de logging`, () => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);

      const consoleRegex = /\bconsole\.(error|warn|log|debug|info|trace)\b/g;
      
      lines.forEach((line, index) => {
        let match: RegExpExecArray | null;
        while ((match = consoleRegex.exec(line)) !== null) {
          const method = match[1];
          const exceptionRules = ALLOWED_EXCEPTIONS[relativePath] || [];
          const isException = exceptionRules.some(r => 
            r.method === method && (!r.requiredText || line.includes(r.requiredText))
          );
          
          if (isException) continue;

          // Verificar se é condicional DEV-only (apenas para warn e info)
          if (method === 'warn' || method === 'info') {
            // Analisar janela anterior no arquivo para encontrar import.meta.env.DEV
            const charIndexInLine = match.index;
            const lineIndexInContent = content.indexOf(line);
            const globalMatchIndex = lineIndexInContent + charIndexInLine;
            const windowStart = Math.max(0, globalMatchIndex - 500);
            const window = content.slice(windowStart, globalMatchIndex);

            if (window.includes('import.meta.env.DEV')) {
              continue;
            }
          }

          // Se chegou aqui, é uma violação
          const message = `Violação da política de logging encontrada em ${relativePath}:${index + 1}:
  Método: console.${method}
  Motivo: Uso de console.* cru não permitido.
  Dica: Use 'logSanitizedFirebaseError' para erros técnicos ou proteja com 'import.meta.env.DEV' se for log de desenvolvimento.`;

          expect.fail(message);
        }
      });
    });
  });
});
