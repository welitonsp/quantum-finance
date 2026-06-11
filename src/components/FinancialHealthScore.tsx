// src/components/FinancialHealthScore.tsx
import { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, ShieldCheck, PiggyBank, CreditCard, Star, Download, Share2 } from 'lucide-react';
import type { FinancialMetrics } from '../hooks/useFinancialMetrics';
import type { ScoreHistoryEntry } from '../hooks/useScoreHistory';
import toast from 'react-hot-toast';

interface Props {
  metrics: FinancialMetrics | null;
  loading: boolean;
  history?: ScoreHistoryEntry[];
}

interface Pillar {
  label:    string;
  icon:     React.ComponentType<{ className?: string }>;
  value:    string;
  score:    number;
  maxScore: number;
  status:   'great' | 'ok' | 'warn' | 'critical';
  tip:      string;
}

function computePillars(m: FinancialMetrics): Pillar[] {
  const savingsScore = m.taxaPoupanca >= 30 ? 25 : m.taxaPoupanca >= 20 ? 20 : m.taxaPoupanca >= 10 ? 12 : m.taxaPoupanca >= 5 ? 6 : 0;
  const savingsStatus: Pillar['status'] = m.taxaPoupanca >= 20 ? 'great' : m.taxaPoupanca >= 10 ? 'ok' : m.taxaPoupanca >= 5 ? 'warn' : 'critical';

  const debtScore = m.endividamento <= 10 ? 25 : m.endividamento <= 30 ? 20 : m.endividamento <= 50 ? 12 : m.endividamento <= 70 ? 6 : 0;
  const debtStatus: Pillar['status'] = m.endividamento <= 20 ? 'great' : m.endividamento <= 40 ? 'ok' : m.endividamento <= 60 ? 'warn' : 'critical';

  const reserveScore = m.reservaMeses >= 6 ? 25 : m.reservaMeses >= 3 ? 18 : m.reservaMeses >= 1 ? 8 : 0;
  const reserveStatus: Pillar['status'] = m.reservaMeses >= 6 ? 'great' : m.reservaMeses >= 3 ? 'ok' : m.reservaMeses >= 1 ? 'warn' : 'critical';

  const commitScore = m.comprometimento <= 20 ? 25 : m.comprometimento <= 35 ? 18 : m.comprometimento <= 50 ? 8 : 0;
  const commitStatus: Pillar['status'] = m.comprometimento <= 25 ? 'great' : m.comprometimento <= 40 ? 'ok' : m.comprometimento <= 55 ? 'warn' : 'critical';

  return [
    {
      label: 'Taxa de Poupança', icon: PiggyBank, value: m.receita > 0 ? `${m.taxaPoupanca.toFixed(1)}%` : '—',
      score: savingsScore, maxScore: 25, status: savingsStatus,
      tip: m.taxaPoupanca >= 20 ? 'Excelente! Manter acima de 20% é o padrão das finanças saudáveis.'
        : m.taxaPoupanca >= 10 ? 'Razoável, mas tente chegar a 20% para construir patrimônio mais rápido.'
        : 'Crítico: quase nada está sendo guardado. Revise suas despesas variáveis.',
    },
    {
      label: 'Endividamento', icon: CreditCard, value: `${m.endividamento.toFixed(1)}%`,
      score: debtScore, maxScore: 25, status: debtStatus,
      tip: m.endividamento <= 20 ? 'Dívida controlada. Seu patrimônio está saudável.'
        : m.endividamento <= 40 ? 'Dívida moderada. Evite assumir novos compromissos.'
        : 'Endividamento alto. Priorize a quitação das dívidas antes de investir.',
    },
    {
      label: 'Reserva de Emergência', icon: ShieldCheck, value: m.despesa > 0 ? `${m.reservaMeses.toFixed(1)} meses` : '—',
      score: reserveScore, maxScore: 25, status: reserveStatus,
      tip: m.reservaMeses >= 6 ? 'Reserva sólida! Você tem 6+ meses de sobrevivência acumulados.'
        : m.reservaMeses >= 3 ? 'Reserva parcial. Meta: chegar a 6 meses de custo de vida.'
        : 'Reserva insuficiente. Em caso de imprevisto, você ficaria vulnerável.',
    },
    {
      label: 'Comprometimento de Renda', icon: TrendingUp, value: m.receita > 0 ? `${m.comprometimento.toFixed(1)}%` : '—',
      score: commitScore, maxScore: 25, status: commitStatus,
      tip: m.comprometimento <= 25 ? 'Ótimo! Menos de 1/4 da renda está presa em despesas fixas.'
        : m.comprometimento <= 40 ? 'Moderate. Considere revisar assinaturas e contratos fixos.'
        : 'Sua renda está muito comprometida. Cancele o que não é essencial.',
    },
  ];
}

const STATUS_COLORS = {
  great:    { bar: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' },
  ok:       { bar: 'bg-blue-500',    text: 'text-blue-400',    badge: 'bg-blue-500/10 border-blue-500/25 text-blue-400'         },
  warn:     { bar: 'bg-amber-500',   text: 'text-amber-400',   badge: 'bg-amber-500/10 border-amber-500/25 text-amber-400'      },
  critical: { bar: 'bg-red-500',     text: 'text-red-400',     badge: 'bg-red-500/10 border-red-500/25 text-red-400'           },
};

const STATUS_LABEL = { great: 'Ótimo', ok: 'Bom', warn: 'Atenção', critical: 'Crítico' };

// ─── Score history sparkline (SVG, no deps) ───────────────────────────────────

function ScoreSparkline({ history }: { history: ScoreHistoryEntry[] }) {
  if (history.length < 2) return null;

  const W = 220, H = 48, PAD = 6;
  const scores = history.map(h => h.score);
  const minVal = Math.max(0,   Math.min(...scores) - 5);
  const maxVal = Math.min(100, Math.max(...scores) + 5);
  const range  = maxVal - minVal || 1;

  const points: Array<[number, number]> = scores.map((s, i) => [
    PAD + (i / (scores.length - 1)) * (W - PAD * 2),
    H - PAD - ((s - minVal) / range) * (H - PAD * 2),
  ]);

  const path    = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const lastPt  = points[points.length - 1] ?? [PAD, H - PAD] as [number, number];
  const area    = `${path} L${lastPt[0].toFixed(1)},${(H - PAD).toFixed(1)} L${PAD},${(H - PAD).toFixed(1)} Z`;

  const lastScore  = scores[scores.length - 1] ?? 0;
  const prevScore  = scores[scores.length - 2] ?? 0;
  const trend      = lastScore >= prevScore ? '↑' : '↓';
  const trendColor = lastScore >= prevScore ? '#00E68A' : '#FF4757';

  return (
    <div className="flex items-end gap-3">
      <div>
        <p className="text-[9px] font-bold text-quantum-fgMuted uppercase tracking-wider mb-1">Histórico 6M</p>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00E68A" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#00E68A" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#scoreGrad)" />
          <path d={path} fill="none" stroke="#00E68A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.5" fill={i === points.length - 1 ? '#00E68A' : '#00E68A88'} />
          ))}
          {/* Month labels */}
          {history.map((h, i) => {
            const pt    = points[i];
            if (!pt) return null;
            const label = h.month.slice(5); // MM
            return (
              <text key={i} x={pt[0]} y={H} textAnchor="middle" fontSize="7" fill="#8899AA" fontFamily="monospace">
                {label}
              </text>
            );
          })}
        </svg>
      </div>
      <div className="pb-2 text-right shrink-0">
        <p className="text-[10px] font-black" style={{ color: trendColor }}>{trend} {Math.abs(lastScore - prevScore)}pts</p>
        <p className="text-[9px] text-quantum-fgMuted">vs mês anterior</p>
      </div>
    </div>
  );
}

// ─── Shareable card export (Canvas API) ──────────────────────────────────────

function drawShareCard(score: number, status: string, pillars: Pillar[], month: string): string {
  const W = 800, H = 440;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0A0F1E');
  bg.addColorStop(1, '#0D1B2A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Border glow
  ctx.strokeStyle = score >= 85 ? '#00E68A33' : score >= 60 ? '#3B82F633' : '#F59E0B33';
  ctx.lineWidth = 2;
  ctx.roundRect(1, 1, W - 2, H - 2, 24);
  ctx.stroke();

  // Score circle
  const cx = 140, cy = 200, r = 90;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#1A2540';
  ctx.lineWidth = 12;
  ctx.stroke();

  const scoreColor = score >= 85 ? '#00E68A' : score >= 60 ? '#3B82F6' : score >= 35 ? '#F59E0B' : '#FF4757';
  const angle = (score / 100) * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, angle);
  ctx.strokeStyle = scoreColor;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Score number
  ctx.fillStyle = scoreColor;
  ctx.font = 'bold 52px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(score), cx, cy + 10);
  ctx.fillStyle = '#8899AA';
  ctx.font = '14px sans-serif';
  ctx.fillText('/ 100', cx, cy + 34);

  // Status label
  ctx.fillStyle = scoreColor;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(status.toUpperCase(), cx, cy + 58);

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Score de Saúde Financeira', 270, 80);

  ctx.fillStyle = '#8899AA';
  ctx.font = '15px monospace';
  ctx.fillText(`Quantum Finance · ${month}`, 270, 106);

  // Pillars
  const colX: [number, number] = [270, 540];
  const rowY: [number, number] = [155, 265];
  pillars.forEach((p, i) => {
    const x = colX[i % 2 as 0 | 1];
    const y = rowY[Math.floor(i / 2) as 0 | 1];
    const pc = p.score >= 22 ? '#00E68A' : p.score >= 15 ? '#3B82F6' : p.score >= 8 ? '#F59E0B' : '#FF4757';

    ctx.fillStyle = '#1A2540';
    ctx.beginPath();
    ctx.roundRect(x, y, 240, 90, 12);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(p.label, x + 14, y + 26);

    ctx.fillStyle = pc;
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`${p.score}`, x + 14, y + 56);
    ctx.fillStyle = '#8899AA';
    ctx.font = '12px monospace';
    ctx.fillText(`/${p.maxScore}`, x + 14 + ctx.measureText(`${p.score}`).width + 3, y + 56);

    ctx.fillStyle = pc;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(p.value, x + 200, y + 56);

    // Mini progress bar
    ctx.fillStyle = '#263352';
    ctx.beginPath(); ctx.roundRect(x + 14, y + 68, 212, 6, 3); ctx.fill();
    ctx.fillStyle = pc;
    ctx.beginPath(); ctx.roundRect(x + 14, y + 68, 212 * (p.score / p.maxScore), 6, 3); ctx.fill();
  });

  // Footer
  ctx.fillStyle = '#4A5568';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('quantumfinance.app', W / 2, H - 18);

  return canvas.toDataURL('image/png');
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FinancialHealthScore({ metrics, loading, history = [] }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleExport = useCallback(() => {
    if (!metrics) return;
    const pillars     = computePillars(metrics);
    const totalScore  = pillars.reduce((s, p) => s + p.score, 0);
    const status      = totalScore >= 85 ? 'Ótimo' : totalScore >= 60 ? 'Bom' : totalScore >= 35 ? 'Atenção' : 'Crítico';
    const now         = new Date();
    const month       = `${now.toLocaleString('pt-BR', { month: 'long' })} ${now.getFullYear()}`;
    try {
      const dataUrl = drawShareCard(totalScore, status, pillars, month);
      const a       = document.createElement('a');
      a.href        = dataUrl;
      a.download    = `score-financeiro-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.png`;
      a.click();
      toast.success('Card exportado com sucesso!');
    } catch {
      toast.error('Erro ao gerar card. Tente novamente.');
    }
  }, [metrics]);

  if (loading || !metrics) return null;

  const pillars      = computePillars(metrics);
  const totalScore   = pillars.reduce((s, p) => s + p.score, 0);
  const overallStatus: Pillar['status'] = totalScore >= 85 ? 'great' : totalScore >= 60 ? 'ok' : totalScore >= 35 ? 'warn' : 'critical';
  const oc           = STATUS_COLORS[overallStatus];

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-quantum-card border border-quantum-border rounded-3xl p-6 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center border border-yellow-500/25">
            <Star className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h3 className="text-base font-black text-quantum-fg">Score de Saúde Financeira</h3>
            <p className="text-[11px] text-quantum-fgMuted">Decomposição por pilar · máximo 100 pts</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-right">
            <p className={`text-3xl font-black font-mono ${oc.text}`}>{totalScore}</p>
            <p className="text-[10px] text-quantum-fgMuted">/ 100</p>
          </div>
          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${oc.badge}`}>
            {STATUS_LABEL[overallStatus]}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              title="Exportar card como PNG"
              className="p-2 rounded-xl text-quantum-fgMuted hover:text-quantum-accent hover:bg-quantum-accent/10 border border-quantum-border transition-all"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const text = `🏆 Meu Score de Saúde Financeira: ${totalScore}/100 (${STATUS_LABEL[overallStatus]}) via Quantum Finance`;
                void navigator.clipboard?.writeText(text).then(() => toast.success('Texto copiado para a área de transferência!'));
              }}
              title="Copiar para partilhar"
              className="p-2 rounded-xl text-quantum-fgMuted hover:text-quantum-accent hover:bg-quantum-accent/10 border border-quantum-border transition-all"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-2 rounded-full bg-quantum-bgSecondary mb-5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${totalScore}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${oc.bar}`}
        />
      </div>

      {/* History sparkline */}
      {history.length >= 2 && (
        <div className="mb-5 border-b border-quantum-border pb-4">
          <ScoreSparkline history={history} />
        </div>
      )}

      {/* Pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pillars.map(p => {
          const c   = STATUS_COLORS[p.status];
          const pct = (p.score / p.maxScore) * 100;
          return (
            <div key={p.label} className="bg-quantum-bgSecondary/60 border border-quantum-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p.icon className={`w-4 h-4 ${c.text}`} />
                  <span className="text-xs font-bold text-quantum-fg">{p.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md border ${c.badge}`}>
                    {STATUS_LABEL[p.status]}
                  </span>
                  <span className={`text-sm font-black font-mono ${c.text}`}>
                    {p.score}<span className="text-quantum-fgMuted font-normal text-[10px]">/{p.maxScore}</span>
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-quantum-card mb-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                  className={`h-full rounded-full ${c.bar}`}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-quantum-fgMuted leading-snug">{p.tip}</p>
                <span className={`text-[11px] font-bold ml-3 shrink-0 ${c.text}`}>{p.value}</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
