/**
 * ProactiveBriefing.jsx — Painel de Briefing Pró-Ativo da IA
 * ──────────────────────────────────────────────────────────────────────────
 * Gera automaticamente um relatório semanal assim que o utilizador abre o
 * dashboard. O resultado é cacheado em localStorage para evitar chamadas
 * repetidas à API (cache válido por 7 dias, chave = uid + semana do ano).
 *
 * Comportamento:
 *  • Na primeira abertura da semana → gera o briefing automaticamente (delay 2s)
 *  • Nas aberturas seguintes → exibe o briefing cacheado instantaneamente
 *  • Botão "Gerar Novo" força refresh manual
 *  • Colapsa/expande com AnimatePresence
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  BrainCircuit, ChevronDown, ChevronUp, RefreshCw,
  AlertTriangle, ShieldCheck, AlertCircle, Zap, X
} from 'lucide-react';
import { GeminiService } from '../features/ai-chat/GeminiService';

// ─── Utilitário: número da semana ISO no ano ──────────────────────────────────
function getISOWeek(date = new Date()) {
  const d     = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getCacheKey(uid) {
  const week = getISOWeek();
  const year = new Date().getFullYear();
  return `qf_briefing_${uid}_${year}_w${week}`;
}

// ─── Detectar severidade pelo conteúdo do relatório ──────────────────────────
function detectSeverity(text = '') {
  const lower = text.toLowerCase();
  if (lower.includes('alerta vermelho') || lower.includes('crítico') || lower.includes('perigo')) return 'critical';
  if (lower.includes('atenção')  || lower.includes('cuidado')  || lower.includes('risco')) return 'warning';
  return 'ok';
}

const SEVERITY_CONFIG = {
  critical: {
    icon:       AlertTriangle,
    iconClass:  'text-red-400',
    badgeClass: 'bg-red-500/10 border-red-500/30 text-red-400',
    barClass:   'from-red-600 to-red-400',
    label:      'Alerta Crítico',
  },
  warning: {
    icon:       AlertCircle,
    iconClass:  'text-amber-400',
    badgeClass: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    barClass:   'from-amber-500 to-yellow-400',
    label:      'Atenção Necessária',
  },
  ok: {
    icon:       ShieldCheck,
    iconClass:  'text-emerald-400',
    badgeClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    barClass:   'from-emerald-500 to-teal-400',
    label:      'Finanças Estáveis',
  },
};

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function ProactiveBriefing({ financialContext, uid, className = '' }) {
  const [briefing,     setBriefing]     = useState(null);     // texto do relatório
  const [loading,      setLoading]      = useState(false);
  const [expanded,     setExpanded]     = useState(false);
  const [dismissed,    setDismissed]    = useState(false);
  const [generatedAt,  setGeneratedAt]  = useState(null);
  const [fromCache,    setFromCache]    = useState(false);
  const autoTriggered = useRef(false);

  // ── Carregar do cache ou gerar automaticamente ───────────────────────────
  useEffect(() => {
    if (!uid || autoTriggered.current) return;
    autoTriggered.current = true;

    const cacheKey = getCacheKey(uid);
    const cached   = localStorage.getItem(cacheKey);

    if (cached) {
      try {
        const { text, ts } = JSON.parse(cached);
        setBriefing(text);
        setGeneratedAt(new Date(ts));
        setFromCache(true);
        setExpanded(false); // começa colapsado se vier do cache
        return;
      } catch {
        localStorage.removeItem(cacheKey);
      }
    }

    // Sem cache → gerar automaticamente após 2s (para não bloquear o carregamento do dashboard)
    const timer = setTimeout(() => {
      generate(false);
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const generate = useCallback(async (forceExpand = true) => {
    if (loading || !financialContext) return;
    setLoading(true);
    if (forceExpand) setExpanded(true);

    try {
      const text = await GeminiService.generateAuditReport(financialContext);
      const ts   = new Date();
      setBriefing(text);
      setGeneratedAt(ts);
      setFromCache(false);
      setExpanded(true);
      setDismissed(false);

      // Salvar no cache
      if (uid) {
        const cacheKey = getCacheKey(uid);
        localStorage.setItem(cacheKey, JSON.stringify({ text, ts: ts.toISOString() }));
      }
    } catch (e) {
      console.error('Erro ao gerar briefing:', e);
      setBriefing('> ⚠️ Não foi possível conectar ao motor de IA. Verifique a sua ligação e tente novamente.');
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  }, [loading, financialContext, uid]);

  // ── Não renderiza se dispensado ou sem dados suficientes ─────────────────
  if (dismissed) return null;
  if (!briefing && !loading) return null;

  const severity  = briefing ? detectSeverity(briefing) : 'ok';
  const cfg       = SEVERITY_CONFIG[severity];
  const SevIcon   = cfg.icon;

  const timeLabel = generatedAt
    ? generatedAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      className={`relative rounded-2xl border overflow-hidden ${className} ${
        severity === 'critical'
          ? 'border-red-500/20   bg-red-950/20'
          : severity === 'warning'
          ? 'border-amber-500/20 bg-amber-950/15'
          : 'border-emerald-500/15 bg-emerald-950/10'
      }`}
      style={{ backdropFilter: 'blur(12px)' }}
    >
      {/* Barra de cor no topo */}
      <div className={`h-[2px] w-full bg-gradient-to-r ${cfg.barClass} opacity-70`} />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
        role="button"
        aria-expanded={expanded}
      >
        {/* Ícone de IA pulsando durante loading */}
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          loading ? 'bg-quantum-accentDim animate-pulse' : cfg.badgeClass.split(' ')[0]
        }`}>
          {loading
            ? <Zap className="w-4 h-4 text-quantum-accent" />
            : <BrainCircuit className="w-4 h-4 text-quantum-accent" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-white">Briefing Semanal IA</span>
            {!loading && briefing && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>
                <SevIcon className="inline w-3 h-3 mr-1 -mt-0.5" />
                {cfg.label}
              </span>
            )}
            {fromCache && !loading && (
              <span className="text-[10px] text-quantum-fgMuted border border-quantum-border rounded-full px-2 py-0.5">
                cache
              </span>
            )}
          </div>
          {timeLabel && !loading && (
            <p className="text-[10px] text-quantum-fgMuted mt-0.5">
              Gerado em {timeLabel}
              {fromCache ? ' · Abre o app todos os dias para um novo briefing semanal' : ''}
            </p>
          )}
          {loading && (
            <p className="text-[10px] text-quantum-accent animate-pulse mt-0.5">
              O QUANTUM está a analisar as suas finanças…
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Botão regenerar */}
          {!loading && (
            <button
              onClick={e => { e.stopPropagation(); generate(true); }}
              title="Gerar novo briefing"
              className="p-1.5 rounded-lg text-quantum-fgMuted hover:text-quantum-accent hover:bg-quantum-accentDim transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Dispensar */}
          <button
            onClick={e => { e.stopPropagation(); setDismissed(true); }}
            title="Dispensar"
            className="p-1.5 rounded-lg text-quantum-fgMuted hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Expand toggle */}
          {expanded
            ? <ChevronUp   className="w-4 h-4 text-quantum-fgMuted" />
            : <ChevronDown className="w-4 h-4 text-quantum-fgMuted" />
          }
        </div>
      </div>

      {/* ── Conteúdo expansível ──────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-white/5">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-8 h-8 border-2 border-quantum-accent/30 border-t-quantum-accent rounded-full animate-spin" />
                  <span className="text-xs text-quantum-fgMuted uppercase tracking-widest animate-pulse">
                    Auditoria Quântica em Curso…
                  </span>
                </div>
              ) : (
                <div className="
                  prose prose-invert prose-sm max-w-none
                  prose-headings:text-white prose-headings:font-black prose-headings:text-sm
                  prose-p:text-slate-300 prose-p:text-sm prose-p:leading-relaxed
                  prose-strong:text-white prose-strong:font-bold
                  prose-ul:text-slate-300 prose-li:text-sm prose-li:marker:text-quantum-accent
                  prose-code:text-quantum-accent prose-code:bg-quantum-accentDim prose-code:px-1 prose-code:rounded
                  prose-blockquote:border-l-quantum-accent prose-blockquote:text-slate-400
                ">
                  <ReactMarkdown>{briefing}</ReactMarkdown>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
