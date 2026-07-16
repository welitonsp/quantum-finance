import { useState } from 'react';
import {
  ShieldCheck, ScrollText, Clock, BrainCircuit, Tag, ChevronRight,
  CheckCircle2, AlertTriangle, Lock, Bell, BellOff,
  Award, TrendingUp, ShieldCheck as ShieldFull,
  RotateCcw, XCircle, Clock as ClockIcon,
} from 'lucide-react';
import { useAuditLogs } from '../../hooks/useAuditLogs';
import { useDecisions } from '../../hooks/useDecisions';
import type { AIDecision } from '../../hooks/useDecisions';
import AuditTimeline from '../../components/AuditTimeline';
import DataPrivacyPanel from '../settings/DataPrivacyPanel';
import { LoadingPage, Spinner } from '../../shared/components/ui';
import { usePushNotifications } from '../../shared/hooks/usePushNotifications';

interface Props {
  uid: string;
}

const KIND_LABELS: Record<string, string> = {
  register_purchase:     'Compra registrada',
  register_income:       'Renda registrada',
  contribute_to_goal:    'Meta contribuída',
  register_debt_payment: 'Dívida quitada',
  create_budget:         'Orçamento criado',
  register_transfer:     'Transferência',
};

const OUTCOME_CONFIG = {
  applied:  { icon: CheckCircle2, cls: 'text-emerald-400',        label: 'Aplicada' },
  reverted: { icon: RotateCcw,    cls: 'text-amber-400',          label: 'Revertida' },
  pending:  { icon: ClockIcon,    cls: 'text-blue-400',           label: 'Pendente' },
  'n/a':    { icon: XCircle,      cls: 'text-quantum-fgMuted',    label: 'N/A' },
} as const;

function DecisionRow({ decision }: { decision: AIDecision }) {
  const kind = decision.proposedAction.kind;
  const label = KIND_LABELS[kind] ?? (kind || decision.intent);
  const cfg = OUTCOME_CONFIG[decision.outcomeStatus] ?? OUTCOME_CONFIG['n/a'];
  const Icon = cfg.icon;
  const dateStr = decision.createdAt
    ? decision.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : '—';

  return (
    <div className="flex items-center gap-3 py-2 border-t border-quantum-border/30">
      <Icon className={`w-4 h-4 shrink-0 ${cfg.cls}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-quantum-fg truncate">{label}</p>
        <p className="text-[10px] text-quantum-fgMuted truncate">{decision.question || decision.intent}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
          decision.outcomeStatus === 'applied'
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
            : decision.outcomeStatus === 'reverted'
              ? 'border-amber-500/25 bg-amber-500/10 text-amber-400'
              : 'border-quantum-border bg-quantum-bg/60 text-quantum-fgMuted'
        }`}>{cfg.label}</span>
        <span className="text-[10px] text-quantum-fgMuted font-mono">{dateStr}</span>
      </div>
    </div>
  );
}

const AI_PERMISSIONS = [
  { label: 'Leitura de transações do período selecionado',    allowed: true  },
  { label: 'Escrita direta em transações',                    allowed: false },
  { label: 'Leitura de saldos de contas',                     allowed: true  },
  { label: 'Acesso a dados de terceiros (Open Finance)',       allowed: false },
  { label: 'Execução de transferências ou pagamentos',        allowed: false },
  { label: 'Armazenamento de histórico de conversas',         allowed: false },
  { label: 'Envio de dados financeiros para terceiros',       allowed: false },
];

export default function GovernancePage({ uid }: Props) {
  const { logs, loading: loadingLogs } = useAuditLogs(uid);
  const { decisions, loading: loadingDecisions, stats } = useDecisions(uid);
  const [showAuditTimeline, setShowAuditTimeline] = useState(false);
  const {
    permission: pushPermission,
    loading:    pushLoading,
    error:      pushError,
    isSupported: pushSupported,
    requestPermission: requestPush,
    revokePermission:  revokePush,
  } = usePushNotifications(uid);

  if (loadingLogs) return <LoadingPage label="Carregando governança..." />;

  const recentCount = logs.length;

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-quantum-accent/10 border border-quantum-accent/25 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-quantum-accent" />
        </div>
        <div>
          <h1 className="text-xl font-black text-quantum-fg">Cofre & Governança</h1>
          <p className="text-xs text-quantum-fgMuted">LGPD, auditoria, histórico append-only e permissões de IA</p>
        </div>
      </div>

      {/* Selo de Integridade */}
      <section aria-labelledby="integrity-heading">
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="integrity-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Selo de Integridade</h2>
        </div>
        <div className="bg-gradient-to-br from-quantum-card/60 to-quantum-bgSecondary/40 border border-quantum-border rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <ShieldFull className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-black text-quantum-fg">Sistema Verificável &amp; Auditável</p>
              <p className="text-xs text-quantum-fgMuted mt-0.5">4 pilares de integridade ativos em produção</p>
            </div>
            <span className="ml-auto text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              Nível Premium
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Pilar 1: Rastreabilidade */}
            <div className="bg-quantum-bg/60 border border-quantum-border rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-quantum-fg">Rastreabilidade</span>
              </div>
              <p className="text-[10px] text-quantum-fgMuted leading-relaxed">100% das transações com histórico append-only imutável (Modelo A)</p>
            </div>
            {/* Pilar 2: IA Verificável */}
            <div className="bg-quantum-bg/60 border border-quantum-border rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-quantum-fg">IA Verificável</span>
              </div>
              {loadingDecisions ? (
                <p className="text-[10px] text-quantum-fgMuted">Carregando…</p>
              ) : (
                <p className="text-[10px] text-quantum-fgMuted leading-relaxed">
                  {stats.total === 0
                    ? 'Nenhuma decisão registrada ainda'
                    : `${stats.confirmed} confirmada${stats.confirmed !== 1 ? 's' : ''} · ${stats.reverted > 0 ? `${stats.reverted} revertida${stats.reverted !== 1 ? 's' : ''}` : '0 revertidas'}`
                  }
                </p>
              )}
            </div>
            {/* Pilar 3: LGPD */}
            <div className="bg-quantum-bg/60 border border-quantum-border rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-quantum-fg">LGPD Ativo</span>
              </div>
              <p className="text-[10px] text-quantum-fgMuted leading-relaxed">Hard-delete LGPD disponível — exclusão completa via Admin SDK</p>
            </div>
            {/* Pilar 4: Idempotência */}
            <div className="bg-quantum-bg/60 border border-quantum-border rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-quantum-fg">Idempotência</span>
              </div>
              <p className="text-[10px] text-quantum-fgMuted leading-relaxed">Zero operações duplicadas — chave de idempotência por callable</p>
            </div>
          </div>
        </div>
      </section>

      {/* Auditoria */}
      <section aria-labelledby="audit-heading">
        <div className="flex items-center gap-2 mb-4">
          <ScrollText className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="audit-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Auditoria</h2>
        </div>
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-quantum-fg">Histórico de Auditoria</p>
              <p className="text-xs text-quantum-fgMuted mt-0.5">
                {recentCount} registro{recentCount !== 1 ? 's' : ''} recentes · Histórico append-only, imutável
              </p>
            </div>
            <button
              onClick={() => setShowAuditTimeline(true)}
              className="flex items-center gap-2 px-4 py-2 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-xs font-bold text-quantum-fg hover:border-quantum-accent/40 transition-all"
            >
              <Clock className="w-3.5 h-3.5" />
              Ver Timeline
              <ChevronRight className="w-3.5 h-3.5 text-quantum-fgMuted" />
            </button>
          </div>

          {/* Últimos 3 registros */}
          {logs.slice(0, 3).map(log => (
            <div key={log.id} className="flex items-start gap-3 py-2 border-t border-quantum-border/30">
              <div className="w-1.5 h-1.5 rounded-full bg-quantum-accent/60 mt-1.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-quantum-fg truncate">{log.title}</p>
                <p className="text-[10px] text-quantum-fgMuted mt-0.5">{log.subtitle}</p>
              </div>
              <span className="text-[10px] text-quantum-fgMuted shrink-0 font-mono">
                {new Date(log.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
            </div>
          ))}

          {logs.length === 0 && (
            <p className="text-xs text-quantum-fgMuted">Nenhum registro de auditoria ainda.</p>
          )}
        </div>
      </section>

      {/* Permissões de IA */}
      <section aria-labelledby="ai-perms-heading">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="ai-perms-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Permissões de IA</h2>
        </div>
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-black text-quantum-fg">O que o Copilot IA pode acessar</p>
          </div>
          <div className="space-y-2.5">
            {AI_PERMISSIONS.map(({ label, allowed }) => (
              <div key={label} className="flex items-center gap-3">
                {allowed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400/70 shrink-0" />
                )}
                <span className={`text-xs ${allowed ? 'text-quantum-fg' : 'text-quantum-fgMuted line-through'}`}>
                  {label}
                </span>
                <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                  allowed
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : 'text-red-400 border-red-500/25 bg-red-500/8'
                }`}>
                  {allowed ? 'Permitido' : 'Bloqueado'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-quantum-fgMuted mt-4 leading-relaxed border-t border-quantum-border/30 pt-3">
            Conforme <span className="font-bold">Política Copilot IA — 2026-06-12</span>: toda feature com IA declara dados usados, auditoria, idempotência e requer confirmação humana para ações.
          </p>
        </div>
      </section>

      {/* Diário de Decisões IA */}
      <section aria-labelledby="decisions-heading">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="decisions-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Diário de Decisões IA</h2>
        </div>
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl p-5 space-y-4">
          {/* Stats header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-quantum-fg">Histórico do Copiloto</p>
              {loadingDecisions ? (
                <p className="text-xs text-quantum-fgMuted mt-0.5">Carregando…</p>
              ) : (
                <p className="text-xs text-quantum-fgMuted mt-0.5">
                  {stats.total === 0
                    ? 'Nenhuma ação do Copiloto ainda'
                    : `${stats.total} decisão${stats.total !== 1 ? 'ões' : ''} · ${stats.total > 0 ? Math.round((stats.confirmed / stats.total) * 100) : 0}% confirmadas`
                  }
                </p>
              )}
            </div>
            {stats.total > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                  {stats.confirmed} aplicadas
                </span>
                {stats.reverted > 0 && (
                  <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400">
                    {stats.reverted} revertidas
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Recent decisions list */}
          {!loadingDecisions && decisions.slice(0, 5).map(dec => (
            <DecisionRow key={dec.id} decision={dec} />
          ))}

          {!loadingDecisions && decisions.length === 0 && (
            <p className="text-xs text-quantum-fgMuted border-t border-quantum-border/30 pt-3">
              Quando o Copiloto registrar uma ação confirmada, ela aparecerá aqui.
            </p>
          )}
        </div>
      </section>

      {/* Categorias */}
      <section aria-labelledby="categories-heading">
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="categories-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Categorias</h2>
        </div>
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-quantum-fg">Gerenciar Categorias</p>
              <p className="text-xs text-quantum-fgMuted mt-0.5">Categorias personalizadas e regras de categorização automática</p>
            </div>
            <span className="text-[10px] text-quantum-fgMuted px-3 py-1.5 border border-quantum-border rounded-xl">
              Via Configurações (⚙️)
            </span>
          </div>
        </div>
      </section>

      {/* Notificações Push */}
      <section aria-labelledby="push-heading">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="push-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Notificações Push</h2>
        </div>
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-black text-quantum-fg">Notificações no Dispositivo</p>
              <p className="text-xs text-quantum-fgMuted mt-0.5">
                {!pushSupported
                  ? 'Não disponível neste navegador ou ambiente'
                  : pushPermission === 'granted'
                    ? 'Ativas — alertas de orçamento, faturas e metas'
                    : pushPermission === 'denied'
                      ? 'Bloqueadas pelo navegador'
                      : 'Receba alertas de orçamento, faturas e metas'
                }
              </p>
            </div>
            {pushSupported && pushPermission !== 'denied' && (
              <button
                onClick={pushPermission === 'granted' ? revokePush : requestPush}
                disabled={pushLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  pushPermission === 'granted'
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                    : 'bg-quantum-bgSecondary border border-quantum-border text-quantum-fg hover:border-quantum-accent/40'
                }`}
              >
                {pushLoading
                  ? <Spinner size="sm" />
                  : pushPermission === 'granted'
                    ? <><BellOff className="w-3.5 h-3.5" />Desativar</>
                    : <><Bell className="w-3.5 h-3.5" />Ativar</>
                }
              </button>
            )}
          </div>
          {pushPermission === 'denied' && (
            <p className="text-xs text-amber-400/80 mt-3 border-t border-quantum-border/30 pt-3">
              Para reativar, altere as permissões de notificação nas configurações do navegador.
            </p>
          )}
          {pushError && (
            <p className="text-xs text-red-400/70 mt-2">{pushError}</p>
          )}
          {!pushSupported && (
            <p className="text-[10px] text-quantum-fgMuted mt-3 border-t border-quantum-border/30 pt-3">
              Requer navegador compatível, HTTPS e chave VAPID configurada (<code className="font-mono">VITE_FCM_VAPID_KEY</code>).
            </p>
          )}
        </div>
      </section>

      {/* LGPD / Privacidade */}
      <section aria-labelledby="lgpd-heading">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="lgpd-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Privacidade & LGPD</h2>
        </div>
        <DataPrivacyPanel uid={uid} />
      </section>

      {/* AuditTimeline drawer */}
      <AuditTimeline uid={uid} open={showAuditTimeline} onClose={() => setShowAuditTimeline(false)} />
    </div>
  );
}
