// src/features/transactions/components/FilterChip.tsx
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface FilterChipProps {
  label:    string;
  onRemove: () => void;
}

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      className="inline-flex items-center gap-1 px-2 py-0.5 bg-quantum-accent/10 border border-quantum-accent/20 text-quantum-accent rounded-md text-[11px] font-bold"
    >
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remover filtro ${label || 'ativo'}`}
        className="hover:text-quantum-fg transition-colors"
      >
        <X className="w-3 h-3" aria-hidden="true" />
      </button>
    </motion.span>
  );
}
