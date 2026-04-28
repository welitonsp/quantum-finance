import { useEffect, useRef, useCallback } from 'react';
import ParserWorker from './workers/parserWorker?worker';
import type { ParsedTransaction } from '../types/transaction';
import type { ColumnMapping } from './csvParser';

interface WorkerError extends Error {
  code?: string;
  headers?: string[];
  autoMap?: ColumnMapping;
  separator?: string;
  previewRows?: string[][];
}

interface WorkerResponse {
  id: string;
  success: boolean;
  transactions?: ParsedTransaction[];
  error?: string;
  code?: string;
  headers?: string[];
  autoMap?: ColumnMapping;
  separator?: string;
  previewRows?: string[][];
}

interface PendingRequest {
  resolve: (txs: ParsedTransaction[]) => void;
  reject: (err: WorkerError) => void;
}

export function useParserWorker() {
  const workerRef  = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());

  useEffect(() => {
    const worker = new ParserWorker();

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, success, transactions, error, code, headers, autoMap, separator, previewRows } = event.data;
      const pending = pendingRef.current.get(id);
      if (!pending) return;
      pendingRef.current.delete(id);

      if (success && transactions) {
        pending.resolve(transactions);
      } else {
        const err: WorkerError = new Error(error || 'Erro desconhecido no parser worker.');
        if (code)        err.code        = code;
        if (headers)     err.headers     = headers;
        if (autoMap)     err.autoMap     = autoMap;
        if (separator)   err.separator   = separator;
        if (previewRows) err.previewRows = previewRows;
        pending.reject(err);
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      console.error('[parserWorker] Erro interno no worker:', event.message);
      pendingRef.current.forEach(({ reject }) => {
        reject(new Error(`Worker crash: ${event.message}`));
      });
      pendingRef.current.clear();
    };

    workerRef.current = worker;
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  const parseFile = useCallback((file: File, opts: Record<string, unknown> = {}): Promise<ParsedTransaction[]> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Parser worker não está disponível.'));
        return;
      }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const id  = crypto.randomUUID();

      file.arrayBuffer()
        .then((buffer) => {
          pendingRef.current.set(id, { resolve, reject });
          workerRef.current?.postMessage(
            { id, type: ext, buffer, fileName: file.name, ...opts },
            [buffer],
          );
        })
        .catch((e: unknown) => {
          const err = e as Error;
          reject(new Error(`Falha ao ler o ficheiro "${file.name}": ${err.message}`));
        });
    });
  }, []);

  const parseFileWithMapping = useCallback((file: File, mapping: ColumnMapping): Promise<ParsedTransaction[]> => {
    return parseFile(file, { mapping });
  }, [parseFile]);

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current.clear();
  }, []);

  return { parseFile, parseFileWithMapping, terminateWorker };
}
