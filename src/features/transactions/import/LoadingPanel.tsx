import { Loader2, BrainCircuit } from 'lucide-react';
import type { LoadingStatus } from './importTypes';

const LOADING_MSGS: Record<LoadingStatus, { title: string; sub: string }> = {
  parsing:       { title: 'A Extrair Dados...',      sub: 'A ler e filtrar duplicados do extrato.' },
  ai_processing: { title: 'Deep Scan Gemini Ativo',  sub: 'A categorizar despesas desconhecidas com IA.' },
  importing:     { title: 'A Sincronizar com o Cofre', sub: 'A gravar as transações no Firestore.' },
};

export function LoadingPanel({ status }: { status: LoadingStatus }) {
  const msg = LOADING_MSGS[status] ?? { title: 'A processar...', sub: '' };
  return (
    <div role="status" aria-live="polite" className="py-14 flex flex-col items-center text-center gap-4">
      <div className="relative">
        <div className="absolute inset-0 bg-quantum-accent/20 rounded-full blur-2xl animate-pulse" />
        {status === 'ai_processing'
          ? <BrainCircuit className="w-14 h-14 text-quantum-accent relative z-10 animate-pulse" />
          : <Loader2     className="w-14 h-14 text-quantum-accent relative z-10 animate-spin"  />
        }
      </div>
      <div>
        <h4 className="text-sm font-black text-quantum-fg tracking-widest uppercase mb-1">{msg.title}</h4>
        <p className="text-xs text-quantum-fgMuted">{msg.sub}</p>
      </div>
    </div>
  );
}
