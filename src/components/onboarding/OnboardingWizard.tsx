import { Landmark, Receipt, X } from 'lucide-react';

interface Props {
  onCreateAccount: () => void;
  onCreateTransaction: () => void;
  onDismiss: () => void;
}

/**
 * Onboarding mínimo viável — mostrado uma única vez quando o usuário não tem
 * nenhuma conta nem transação (ver gate em App.tsx: accounts.length === 0 &&
 * transactions.length === 0). Não força nada: "pular" persiste via localStorage
 * (mesmo padrão safeStorageGet/safeStorageSet de App.tsx) e o wizard também
 * deixa de aparecer sozinho assim que o usuário cria uma conta ou transação
 * real — a condição de exibição é sempre derivada do estado real, nunca de um
 * "passo" artificial.
 *
 * Escopo deliberadamente pequeno: 2 atalhos (ir para Contas / abrir o
 * formulário de transação, ambos já existentes no app) + pular. Sem rotas
 * novas (o projeto não usa react-router — navegação por currentPage).
 */
export function OnboardingWizard({ onCreateAccount, onCreateTransaction, onDismiss }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-wizard-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-quantum-bg/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="relative bg-quantum-card w-full max-w-md rounded-3xl p-6 shadow-2xl border border-quantum-border zoom-in-95">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-quantum-accent/50"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 id="onboarding-wizard-title" className="text-lg font-bold text-quantum-fg mb-1.5 pr-8">
          Bem-vindo ao Quantum Finance
        </h2>
        <p className="text-sm text-quantum-fgMuted mb-6">
          Para começar, crie sua primeira conta ou registre uma transação — o resto do painel se organiza sozinho a partir daí.
        </p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onCreateAccount}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-quantum-border bg-quantum-bg/50 hover:border-quantum-accent/40 hover:bg-white/[0.02] transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-quantum-accent"
          >
            <div className="p-2.5 rounded-xl bg-quantum-accent/10">
              <Landmark className="w-5 h-5 text-quantum-accent" />
            </div>
            <div>
              <p className="font-bold text-quantum-fg text-sm">Criar minha primeira conta</p>
              <p className="text-xs text-quantum-fgMuted mt-0.5">Corrente, poupança, cartão ou dívida</p>
            </div>
          </button>

          <button
            type="button"
            onClick={onCreateTransaction}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-quantum-border bg-quantum-bg/50 hover:border-quantum-accent/40 hover:bg-white/[0.02] transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-quantum-accent"
          >
            <div className="p-2.5 rounded-xl bg-quantum-accent/10">
              <Receipt className="w-5 h-5 text-quantum-accent" />
            </div>
            <div>
              <p className="font-bold text-quantum-fg text-sm">Registrar uma transação</p>
              <p className="text-xs text-quantum-fgMuted mt-0.5">Uma despesa ou receita recente</p>
            </div>
          </button>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="w-full text-center text-xs font-bold text-quantum-fgMuted hover:text-quantum-fg mt-5 transition-colors"
        >
          Pular por agora
        </button>
      </div>
    </div>
  );
}
