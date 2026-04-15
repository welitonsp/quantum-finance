/**
 * useParserWorker.js — Hook React para o Parser Web Worker
 * ──────────────────────────────────────────────────────────────────────────────
 * Instancia e gerencia o parserWorker de forma segura.
 * Expõe `parseFile(file, options?) → Promise<Transaction[]>`
 *
 * CARACTERÍSTICAS:
 *  • Worker instanciado UMA vez no mount, terminado no unmount (sem leaks)
 *  • IDs únicos por requisição → suporte a múltiplas chamadas concorrentes
 *  • Erros estruturados propagados como Error com campos extras (code, headers, autoMap)
 *  • `parseFileWithMapping(file, mapping)` para reuso após mapeamento manual de colunas CSV
 */

import { useEffect, useRef, useCallback } from 'react';
import ParserWorker from './workers/parserWorker?worker';

/**
 * @returns {{ parseFile: Function, parseFileWithMapping: Function, terminateWorker: Function }}
 */
export function useParserWorker() {
  const workerRef  = useRef(null);
  // Map de id → { resolve, reject } para suportar chamadas concorrentes
  const pendingRef = useRef(new Map());

  // ── Instanciar worker na montagem do componente ────────────────────────────
  useEffect(() => {
    const worker = new ParserWorker();

    worker.onmessage = (event) => {
      const { id, success, transactions, error, code, headers, autoMap, separator, previewRows } = event.data;
      const pending = pendingRef.current.get(id);
      if (!pending) return;
      pendingRef.current.delete(id);

      if (success) {
        pending.resolve(transactions);
      } else {
        // Reconstrói o erro com todos os metadados estruturados
        const err     = new Error(error || 'Erro desconhecido no parser worker.');
        if (code)        err.code        = code;
        if (headers)     err.headers     = headers;
        if (autoMap)     err.autoMap     = autoMap;
        if (separator)   err.separator   = separator;
        if (previewRows) err.previewRows = previewRows;
        pending.reject(err);
      }
    };

    worker.onerror = (event) => {
      console.error('[parserWorker] Erro interno no worker:', event.message);
      // Rejeitar todos os pendentes se o worker morrer inesperadamente
      pendingRef.current.forEach(({ reject }) => {
        reject(new Error(`Worker crash: ${event.message}`));
      });
      pendingRef.current.clear();
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ── Enviar ficheiro ao worker ──────────────────────────────────────────────
  /**
   * @param {File}   file     - Ficheiro a processar
   * @param {object} [opts]   - Opções adicionais (password para PDF)
   * @returns {Promise<Transaction[]>}
   */
  const parseFile = useCallback((file, opts = {}) => {
    return new Promise(async (resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Parser worker não está disponível.'));
        return;
      }

      const ext = file.name.split('.').pop().toLowerCase();
      const id  = crypto.randomUUID();

      // Converter File → ArrayBuffer (transferable → zero-copy via postMessage)
      let buffer;
      try {
        buffer = await file.arrayBuffer();
      } catch (e) {
        reject(new Error(`Falha ao ler o ficheiro "${file.name}": ${e.message}`));
        return;
      }

      pendingRef.current.set(id, { resolve, reject });

      // Transferir o ArrayBuffer (não clonar) para eficiência máxima
      workerRef.current.postMessage(
        { id, type: ext, buffer, fileName: file.name, ...opts },
        [buffer]   // lista de transferíveis
      );
    });
  }, []);

  // ── Reenviar CSV com mapeamento manual (após COLUMNS_NOT_FOUND) ───────────
  /**
   * @param {File}   file    - O mesmo ficheiro CSV
   * @param {{ dateIdx: number, descIdx: number, valueIdx: number }} mapping
   * @returns {Promise<Transaction[]>}
   */
  const parseFileWithMapping = useCallback((file, mapping) => {
    return parseFile(file, { mapping });
  }, [parseFile]);

  // ── Terminar worker manualmente (raro — cleanup automático no unmount) ────
  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current.clear();
  }, []);

  return { parseFile, parseFileWithMapping, terminateWorker };
}
