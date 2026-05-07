import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud } from 'lucide-react';

interface DropZoneProps {
  onFile:       (f: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function DropZone({ onFile, fileInputRef }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {dragging ? 'Arquivo sobre a área de soltar. Solte para importar.' : ''}
      </span>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Importar arquivo de extrato bancário"
        className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center text-center cursor-pointer transition-all duration-300 ${
          dragging
            ? 'border-quantum-accent bg-quantum-accent/5 scale-[1.01]'
            : 'border-quantum-border hover:border-quantum-accent/40 hover:bg-white/[0.02]'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quantum-accent`}
      >
        <input
          type="file" ref={fileInputRef} className="hidden" accept=".csv,.ofx,.pdf"
          aria-hidden="true" tabIndex={-1}
          onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
        />
        <motion.div
          animate={dragging ? { scale: 1.1 } : { scale: 1 }}
          className="w-16 h-16 rounded-2xl bg-quantum-bgSecondary border border-quantum-border flex items-center justify-center mb-5"
        >
          <UploadCloud className={`w-8 h-8 transition-colors ${dragging ? 'text-quantum-accent' : 'text-quantum-fgMuted'}`} />
        </motion.div>
        <p className="font-bold text-quantum-fg mb-1.5">
          {dragging ? 'Largar aqui!' : 'Arraste o seu extrato'}
        </p>
        <p className="text-xs text-quantum-fgMuted max-w-xs leading-relaxed">
          Formatos suportados: <span className="text-quantum-fg font-mono">CSV</span>,{' '}
          <span className="text-quantum-fg font-mono">OFX</span> e{' '}
          <span className="text-quantum-fg font-mono">PDF</span>.
          Processado localmente — o Motor Gemini categoriza automaticamente.
        </p>
        <div className="mt-5 flex gap-2">
          {['CSV','OFX','PDF'].map(f => (
            <span key={f} className="text-[10px] font-mono font-bold px-2.5 py-1 bg-quantum-bgSecondary border border-quantum-border rounded-lg text-quantum-fgMuted">
              .{f.toLowerCase()}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
