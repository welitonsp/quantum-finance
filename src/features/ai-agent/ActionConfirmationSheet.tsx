/**
 * ActionConfirmationSheet.tsx — UI de CONFIRMAÇÃO HUMANA de uma ação do Agente (FASE H).
 *
 * É o momento de governança: o assistente NÃO escreve nada sem o usuário revisar e
 * confirmar aqui. Renderiza um resumo legível da ação proposta + nota de auditoria, com
 * Confirmar/Cancelar. Estado (`status`/`error`) vem do `useAgentAction`.
 *
 * Componente apresentacional e agnóstico de domínio: o consumidor passa o título, a
 * pergunta e as linhas de resumo (já formatadas — sem lógica monetária aqui). Para erros
 * roteáveis (ex.: `use_installment_form`), aceita uma rota alternativa explícita.
 */
import type { ReactNode } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, ArrowRight, Wallet, TrendingDown, TrendingUp, ArrowLeftRight } from 'lucide-react';
import { BottomSheet } from '../../shared/components/ui/BottomSheet';
import { Button } from '../../shared/components/ui/Button';
import { addCentavos, subtractCentavos, absCentavos, formatBRL, type Centavos } from '../../shared/types/money';
import type { AgentActionStatus, AgentActionError } from '../../hooks/useAgentAction';

/**
 * Direção do impacto no saldo. `outflow` reduz o saldo (compra/pagamento),
 * `inflow` aumenta (receita/aporte), `neutral` não altera o total (transferência),
 * `none` desativa o preview (ex.: criar orçamento — nenhum movimento de caixa).
 */
export type ImpactDirection = 'outflow' | 'inflow' | 'neutral' | 'none';

export interface ActionSummaryRow {
  label: string;
  value: ReactNode;
  /** Destaque visual (ex.: valor principal). */
  emphasis?: boolean;
}

/** Rota alternativa exibida quando o servidor recusa com um `reason` conhecido. */
export interface ActionRouteAffordance {
  /** `reason` estruturado que dispara esta rota (ex.: 'use_installment_form'). */
  reason: string;
  label: string;
  onClick: () => void;
}

interface ImpactPreviewProps {
  /** Saldo disponível atual, em centavos inteiros (fonte canônica). */
  currentBalanceCents: Centavos;
  /** Valor absoluto da ação, em centavos inteiros. */
  amountCents: Centavos;
  /** Direção do impacto no saldo. */
  direction: Exclude<ImpactDirection, 'none'>;
}

/**
 * ImpactPreview — bloco visual "Impacto no saldo" (puro, sem I/O).
 *
 * Calcula `depois` a partir de `antes` usando SOMENTE aritmética de centavos
 * inteiros (`addCentavos`/`subtractCentavos`) — jamais floats. Para transferência
 * o total do usuário é neutro (dinheiro só muda de conta), então não projeta delta.
 */
function ImpactPreview({ currentBalanceCents, amountCents, direction }: ImpactPreviewProps) {
  const isNeutral = direction === 'neutral';
  const afterCents = isNeutral
    ? currentBalanceCents
    : direction === 'inflow'
      ? addCentavos(currentBalanceCents, amountCents)
      : subtractCentavos(currentBalanceCents, amountCents);

  const deltaCents = absCentavos(amountCents);

  const afterColor = isNeutral
    ? 'text-quantum-fgMuted'
    : direction === 'inflow'
      ? 'text-emerald-300'
      : 'text-rose-300';

  const DeltaIcon = isNeutral ? ArrowLeftRight : direction === 'inflow' ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-2xl border border-quantum-border bg-quantum-card/50 px-4 py-3 space-y-2">
      <p className="flex items-center gap-2 text-xs font-bold text-quantum-fgMuted">
        <Wallet className="w-3.5 h-3.5 shrink-0 text-quantum-accent" />
        Impacto no saldo
      </p>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-quantum-fgMuted">Antes</span>
        <span className="text-right font-mono text-sm text-quantum-fg">
          {formatBRL(currentBalanceCents)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-quantum-fgMuted">Depois</span>
        <span className="flex items-center justify-end gap-2 text-right">
          <span className={`font-mono text-base font-bold ${afterColor}`}>
            {formatBRL(afterCents)}
          </span>
          <span className={`flex items-center gap-0.5 font-mono text-[11px] ${afterColor}`}>
            <DeltaIcon className="w-3 h-3 shrink-0" />
            {isNeutral ? 'sem mudança no total' : formatBRL(deltaCents)}
          </span>
        </span>
      </div>

      {isNeutral && (
        <p className="text-[11px] text-quantum-fgMuted leading-relaxed">
          Transferência entre contas — seu saldo total não muda.
        </p>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Título curto da ação (ex.: "Registrar compra"). */
  title: string;
  /** Pergunta/resumo legível (mesma string auditada em `/decisions`). */
  question: string;
  /** Linhas de resumo já formatadas pelo consumidor. */
  rows: ActionSummaryRow[];
  status: AgentActionStatus;
  error?: AgentActionError | null;
  confirmLabel?: string;
  /** Mensagem de sucesso opcional (quando o consumidor não fecha imediatamente). */
  successMessage?: string;
  /** Rota alternativa para um erro roteável (casa com `error.reason`). */
  route?: ActionRouteAffordance;
  /** Saldo disponível atual em centavos — habilita o preview "Impacto no saldo". */
  currentBalanceCents?: Centavos;
  /** Valor absoluto da ação em centavos — necessário para projetar o saldo. */
  impactAmountCents?: Centavos;
  /** Direção do impacto no saldo. `none` (ou ausente) não renderiza o preview. */
  impactDirection?: ImpactDirection;
}

export function ActionConfirmationSheet({
  open,
  onClose,
  onConfirm,
  title,
  question,
  rows,
  status,
  error = null,
  confirmLabel = 'Confirmar',
  successMessage,
  route,
  currentBalanceCents,
  impactAmountCents,
  impactDirection = 'none',
}: Props) {
  const running = status === 'running';
  const succeeded = status === 'success';
  const showRoute = status === 'error' && !!route && error?.reason === route.reason;

  const showImpact =
    !succeeded &&
    impactDirection !== 'none' &&
    currentBalanceCents !== undefined &&
    impactAmountCents !== undefined
      ? { currentBalanceCents, impactAmountCents, direction: impactDirection }
      : null;

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-quantum-fg leading-relaxed">{question}</p>

        {/* Resumo da ação */}
        <div className="rounded-2xl border border-quantum-border bg-quantum-card/50 divide-y divide-quantum-border/60">
          {rows.map(({ label, value, emphasis }) => (
            <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-xs text-quantum-fgMuted">{label}</span>
              <span
                className={`text-right font-mono font-bold ${
                  emphasis ? 'text-base text-quantum-fg' : 'text-sm text-quantum-fg'
                }`}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Impacto financeiro — saldo antes → depois */}
        {showImpact && (
          <ImpactPreview
            currentBalanceCents={showImpact.currentBalanceCents}
            amountCents={showImpact.impactAmountCents}
            direction={showImpact.direction}
          />
        )}

        {/* Nota de governança / auditoria */}
        {!succeeded && (
          <p className="flex items-start gap-2 text-[11px] text-quantum-fgMuted leading-relaxed">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
            <span>
              Ao confirmar, o assistente registra esta ação com trilha de auditoria no Diário de
              Decisões. Nada é gravado sem a sua confirmação.
            </span>
          </p>
        )}

        {/* Erro */}
        {status === 'error' && error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 space-y-2"
          >
            <p className="flex items-start gap-2 text-xs text-rose-300 leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error.message}</span>
            </p>
            {showRoute && route && (
              <Button
                variant="secondary"
                size="sm"
                icon={ArrowRight}
                iconPosition="right"
                onClick={route.onClick}
                className="w-full"
              >
                {route.label}
              </Button>
            )}
          </div>
        )}

        {/* Sucesso */}
        {succeeded && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-emerald-300 font-bold"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {successMessage ?? 'Ação registrada com sucesso.'}
          </p>
        )}

        {/* Ações */}
        {!succeeded && (
          <div className="flex items-center gap-3 pt-1">
            <Button variant="ghost" size="md" onClick={onClose} disabled={running} className="flex-1">
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={onConfirm}
              loading={running}
              disabled={running}
              className="flex-1"
            >
              {confirmLabel}
            </Button>
          </div>
        )}

        {succeeded && (
          <Button variant="secondary" size="md" onClick={onClose} className="w-full">
            Concluir
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
