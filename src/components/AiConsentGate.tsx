import { ShieldCheck } from 'lucide-react';

interface Props {
  /** Consentimento de IA concedido (espelho realtime de consents/current.ai). */
  aiGranted:     boolean;
  /** Enquanto o consentimento carrega, renderiza os filhos (o servidor continua fail-closed). */
  loading:       boolean;
  /** Abre Configurações › Privacidade para o usuário ativar o consentimento. */
  onOpenPrivacy: () => void;
  children:      React.ReactNode;
}

/**
 * Gate visual do consentimento de IA. Substitui o conteúdo por um aviso quando o
 * usuário não concedeu consentimento — o bloqueio real é server-trusted
 * (`assertAiConsent`, fail-closed). Durante o carregamento, renderiza os filhos
 * para evitar flash de banner.
 */
export function AiConsentGate({ aiGranted, loading, onOpenPrivacy, children }: Props) {
  if (loading || aiGranted) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center rounded-3xl bg-quantum-card/60 backdrop-blur-xl border border-quantum-border">
      <div className="p-4 rounded-2xl bg-quantum-accent/15 border border-quantum-accent/20">
        <ShieldCheck className="w-8 h-8 text-quantum-accent" />
      </div>
      <h2 className="font-bold text-lg text-quantum-fg">IA desativada por privacidade</h2>
      <p className="text-sm text-quantum-fgMuted max-w-sm">
        Nenhum dado é enviado ao operador de IA sem o seu consentimento (LGPD). O bloqueio é
        aplicado no servidor. Ative o consentimento para usar os recursos de inteligência artificial.
      </p>
      <button
        type="button"
        onClick={onOpenPrivacy}
        className="mt-1 px-5 py-2.5 rounded-xl bg-quantum-accent text-quantum-bg font-semibold hover:bg-quantum-accent/90 transition-colors"
      >
        Ativar consentimento de IA
      </button>
    </div>
  );
}
