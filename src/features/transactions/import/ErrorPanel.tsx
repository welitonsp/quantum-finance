import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="py-10 flex flex-col items-center text-center gap-4"
    >
      <AlertTriangle className="w-14 h-14 text-quantum-red" />
      <div>
        <h4 className="text-base font-bold text-quantum-fg mb-2">Interferência Detetada</h4>
        <p className="text-xs text-quantum-fgMuted bg-quantum-redDim border border-quantum-red/20 p-3 rounded-xl max-w-sm mx-auto leading-relaxed">
          {message}
        </p>
      </div>
      <button onClick={onRetry} className="btn-quantum-secondary flex items-center gap-2">
        <RotateCcw className="w-3.5 h-3.5" /> Tentar Novamente
      </button>
    </motion.div>
  );
}
