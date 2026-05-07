import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import type {
  ColumnMapping, ColumnMappingDraft, ColumnMappingSuggestionId,
} from './importTypes';
import { COLUMN_MAPPING_KEYS } from './importTypes';
import {
  BANK_MAPPING_TEMPLATES, COLUMN_MAPPING_SUGGESTION_OPTIONS,
  suggestColumnMapping, countSuggestedFields, mergeSuggestedMapping,
} from './importConstants';

interface ColumnMapperProps {
  headers:     string[];
  previewRows: string[][];
  autoMap:     ColumnMapping;
  onApply:     (m: ColumnMapping) => void;
  onCancel:    () => void;
}

export function ColumnMapper({ headers, previewRows, autoMap, onApply, onCancel }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<ColumnMappingDraft>({
    dateIdx:  autoMap.dateIdx  >= 0 ? autoMap.dateIdx  : '',
    descIdx:  autoMap.descIdx  >= 0 ? autoMap.descIdx  : '',
    valueIdx: autoMap.valueIdx >= 0 ? autoMap.valueIdx : '',
  });
  const [selectedSuggestion, setSelectedSuggestion] = useState<ColumnMappingSuggestionId>('auto');
  const [suggestionFeedback, setSuggestionFeedback] = useState('');

  const set   = (k: keyof typeof mapping, v: number | '') => setMapping(m => ({ ...m, [k]: v }));
  const ready = mapping.dateIdx !== '' && mapping.descIdx !== '' && mapping.valueIdx !== '';

  const handleApplySuggestion = () => {
    const template = selectedSuggestion === 'auto'
      ? undefined
      : BANK_MAPPING_TEMPLATES.find(item => item.id === selectedSuggestion);
    const suggestion  = suggestColumnMapping(headers, template);
    const foundFields = countSuggestedFields(suggestion);

    if (foundFields === 0) {
      setSuggestionFeedback('Não foi possível identificar colunas suficientes para este modelo.');
      return;
    }

    const nextMapping = mergeSuggestedMapping(mapping, suggestion);
    setMapping(nextMapping);
    setSuggestionFeedback(
      COLUMN_MAPPING_KEYS.every(key => nextMapping[key] !== '')
        ? 'Mapeamento sugerido aplicado. Revise antes de continuar.'
        : 'Mapeamento parcial aplicado. Complete as colunas restantes manualmente.'
    );
  };

  const FIELDS: { key: keyof typeof mapping; label: string; color: string }[] = [
    { key: 'dateIdx',  label: 'Coluna de Data',      color: 'text-cyan-400'       },
    { key: 'descIdx',  label: 'Coluna de Descrição',  color: 'text-quantum-fg'     },
    { key: 'valueIdx', label: 'Coluna de Valor',      color: 'text-quantum-accent' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex items-start gap-3 p-3.5 bg-quantum-goldDim border border-quantum-gold/20 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-quantum-gold shrink-0 mt-0.5" />
        <p className="text-xs text-quantum-fg leading-relaxed">
          Não foi possível detetar automaticamente as colunas. Mapeie manualmente abaixo.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-quantum-border bg-quantum-bgSecondary/40 p-3.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-quantum-fg">Sugestões de mapeamento</h4>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedSuggestion}
            onChange={e => setSelectedSuggestion(e.target.value as ColumnMappingSuggestionId)}
            aria-label="Selecionar sugestão de mapeamento por banco"
            className="input-quantum flex-1 appearance-none pr-8"
          >
            {COLUMN_MAPPING_SUGGESTION_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleApplySuggestion}
            aria-label="Aplicar sugestão de mapeamento selecionada"
            className="btn-quantum-secondary flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            Aplicar
          </button>
        </div>
        {suggestionFeedback && (
          <p role="status" aria-live="polite" className="text-xs text-quantum-fgMuted">
            {suggestionFeedback}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {FIELDS.map(({ key, label, color }) => (
          <div key={key}>
            <label className={`text-xs font-bold uppercase tracking-wider mb-1.5 block ${color}`}>{label}</label>
            <select
              value={mapping[key]}
              onChange={e => set(key, e.target.value === '' ? '' : Number(e.target.value))}
              aria-label={label}
              className="input-quantum appearance-none pr-8"
            >
              <option value="">— Selecionar coluna —</option>
              {headers.map((h, i) => (
                <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {previewRows.length > 0 && (
        <div>
          <p className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-2">
            Pré-visualização (primeiras {previewRows.length} linhas)
          </p>
          <div className="overflow-x-auto rounded-xl border border-quantum-border">
            <table className="w-full text-xs" aria-label="Pré-visualização do arquivo">
              <thead>
                <tr className="bg-quantum-bgSecondary">
                  {headers.map((h, i) => (
                    <th key={i} scope="col" className={`px-3 py-2 text-left font-bold border-b border-quantum-border truncate max-w-[100px] ${
                      i === Number(mapping.dateIdx)  ? 'text-cyan-400' :
                      i === Number(mapping.descIdx)  ? 'text-quantum-fg' :
                      i === Number(mapping.valueIdx) ? 'text-quantum-accent' :
                      'text-quantum-fgMuted'
                    }`}>{h || `Col ${i + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr key={ri} className="border-b border-quantum-border/50 last:border-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`px-3 py-2 truncate max-w-[100px] ${
                        ci === Number(mapping.dateIdx)  ? 'text-cyan-400  font-mono' :
                        ci === Number(mapping.descIdx)  ? 'text-quantum-fg' :
                        ci === Number(mapping.valueIdx) ? 'text-quantum-accent font-mono' :
                        'text-quantum-fgMuted'
                      }`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} className="btn-quantum-secondary flex-1">Cancelar</button>
        <button
          onClick={() => {
            if (ready) {
              onApply({
                dateIdx:  Number(mapping.dateIdx),
                descIdx:  Number(mapping.descIdx),
                valueIdx: Number(mapping.valueIdx),
              });
            }
          }}
          disabled={!ready}
          className="btn-quantum-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowRight className="w-4 h-4" /> Aplicar Mapeamento
        </button>
      </div>
    </motion.div>
  );
}
