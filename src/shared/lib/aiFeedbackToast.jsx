/**
 * aiFeedbackToast.jsx — Toast Interativo de Feedback da IA
 * ──────────────────────────────────────────────────────────────────────────────
 * Exibe um toast customizado do react-hot-toast quando a IA categoriza
 * uma transação, com botões 👍 / 👎 para reforço de aprendizado local.
 *
 * USO:
 *   import { showAIFeedbackToast } from '../shared/lib/aiFeedbackToast';
 *   showAIFeedbackToast('UBER *VIAGEM', 'Transporte');
 *
 * ZERO-KNOWLEDGE: os feedbacks são armazenados apenas no localStorage do
 * utilizador (nunca enviados para servidor), prontos para futuros modelos locais.
 */

import toast from 'react-hot-toast';

// ─── Storage local do reforço ────────────────────────────────────────────────
const STORAGE_KEY = 'quantum_ai_feedback_log';

function logFeedback(description, category, vote) {
  try {
    const raw  = localStorage.getItem(STORAGE_KEY);
    const log  = raw ? JSON.parse(raw) : [];
    log.push({ description, category, vote, ts: Date.now() });
    // Manter apenas os últimos 500 registos
    if (log.length > 500) log.splice(0, log.length - 500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch { /* Silencia falhas de storage */ }
}

// ─── Toast customizado ───────────────────────────────────────────────────────
/**
 * @param {string} description  - Descrição da transação categorizada
 * @param {string} category     - Categoria atribuída pela IA
 * @param {number} [duration]   - Duração em ms (default: 6000)
 */
export function showAIFeedbackToast(description, category, duration = 6000) {
  const shortDesc = description?.length > 28
    ? description.substring(0, 28) + '…'
    : (description || 'Transação');

  const toastId = toast.custom(
    (t) => (
      <div
        className={`
          flex flex-col gap-2 max-w-xs w-full
          bg-slate-900/95 border border-white/12 backdrop-blur-xl
          rounded-2xl px-4 py-3 shadow-2xl shadow-black/50
          transition-all duration-300
          ${t.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
        `}
      >
        {/* ── Linha principal ── */}
        <div className="flex items-start gap-2.5">
          <span className="text-base leading-none mt-0.5" aria-hidden="true">🤖</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider mb-0.5">
              IA aprendeu
            </p>
            <p className="text-xs text-white font-medium leading-snug">
              <span className="text-slate-300 font-mono">{shortDesc}</span>
              <span className="text-slate-500 mx-1">→</span>
              <span className="text-cyan-400 font-bold">{category}</span>
            </p>
          </div>
        </div>

        {/* ── Botões de feedback ── */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/8">
          <span className="text-[10px] text-slate-500 flex-1">Esta categorização está correcta?</span>

          <button
            onClick={() => {
              logFeedback(description, category, 'positive');
              toast.dismiss(toastId);
              toast.success('Obrigado! IA reforçada ✓', { duration: 2000, icon: '🧠' });
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold transition-colors border border-emerald-500/20"
          >
            👍
          </button>

          <button
            onClick={() => {
              logFeedback(description, category, 'negative');
              toast.dismiss(toastId);
              toast.error('Registado. A IA irá melhorar.', { duration: 2000, icon: '📝' });
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-400 text-xs font-bold transition-colors border border-red-500/20"
          >
            👎
          </button>
        </div>
      </div>
    ),
    { duration, position: 'bottom-right' }
  );

  return toastId;
}

/**
 * Dispara múltiplos toasts em sequência com delay entre eles,
 * evitando sobrepor todos de uma vez após uma importação em lote.
 *
 * @param {Array<{description: string, category: string}>} items
 * @param {number} [delayBetween] - ms entre cada toast (default: 800)
 * @param {number} [maxToasts]    - máximo de toasts (default: 3)
 */
export function showAIFeedbackBatch(items = [], delayBetween = 800, maxToasts = 3) {
  const slice = items.slice(0, maxToasts);
  slice.forEach((item, i) => {
    setTimeout(() => {
      showAIFeedbackToast(item.description, item.category);
    }, i * delayBetween);
  });
}
