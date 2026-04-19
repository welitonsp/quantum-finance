// src/shared/lib/useParserWorker.ts
import { useEffect, useRef, useCallback } from 'react';
import ParserWorker from './workers/parserWorker?worker';

interface ParsedTx {
  id: string;
  date: string;
  description: string;
  value: number;
  type: string;
  category: string;
  [key: string]: unknown;
}

interface PendingRequest {
  resolve: (txs: ParsedTx[]) => void;
  reject:  (err: Error)       => void;
}

interface WorkerMessage {
  id: string;
  success: boolean;
  transactions?: ParsedTx[];
  error?: string;
  code?: string;
  headers?: string[];
  autoMap?: { dateIdx: number; descIdx: number; valueIdx: number };
  separator?: string;
  previewRows?: string[][];
}

interface ParseOptions {
  password?: string;
  mapping?: { dateIdx: number; descIdx: number; valueIdx: number };
}

interface ParserWorkerHook {
  parseFile:           (file: File, opts?: ParseOptions)                                              => Promise<ParsedTx[]>;
  parseFileWithMapping:(file: File, mapping: { dateIdx: number; descIdx: number; valueIdx: number }) => Promise<ParsedTx[]>;
  terminateWorker:     ()                                                                             => void;
}

export function useParserWorker(): ParserWorkerHook {
  const workerRef  = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, PendingRequest>());

  useEffect(() => {
    const worker = new ParserWorker();

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { id, success, transactions, error, code, headers, autoMap, separator, previewRows } = event.data;
      const pending = pendingRef.current.get(id);
      if (!pending) return;
      pendingRef.current.delete(id);

      if (success) {
        pending.resolve(transactions ?? []);
      } else {
        const err = Object.assign(new Error(error || 'Erro desconhecido no parser worker.'), {
          ...(code        && { code }),
          ...(headers     && { headers }),
          ...(autoMap     && { autoMap }),
          ...(separator   && { separator }),
          ...(previewRows && { previewRows }),
        });
        pending.reject(err);
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      console.error('[parserWorker] Erro interno no worker:', event.message);
      pendingRef.current.forEach(({ reject }) => reject(new Error(`Worker crash: ${event.message}`)));
      pendingRef.current.clear();
    };

    workerRef.current = worker;
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  const parseFile = useCallback((file: File, opts: ParseOptions = {}): Promise<ParsedTx[]> => {
    return new Promise(async (resolve, reject) => {
      if (!workerRef.current) { reject(new Error('Parser worker não está disponível.')); return; }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const id  = crypto.randomUUID();

      let buffer: ArrayBuffer;
      try {
        buffer = await file.arrayBuffer();
      } catch (e) {
        reject(new Error(`Falha ao ler o ficheiro "${file.name}": ${(e as Error).message}`));
        return;
      }

      pendingRef.current.set(id, { resolve, reject });
      workerRef.current.postMessage({ id, type: ext, buffer, fileName: file.name, ...opts }, [buffer]);
    });
  }, []);

  const parseFileWithMapping = useCallback(
    (file: File, mapping: { dateIdx: number; descIdx: number; valueIdx: number }) =>
      parseFile(file, { mapping }),
    [parseFile],
  );

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current.clear();
  }, []);

  return { parseFile, parseFileWithMapping, terminateWorker };
}
