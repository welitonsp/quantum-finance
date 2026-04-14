// src/features/transactions/CreditCardManager.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard, Plus, Trash2, Edit2, X, CheckCircle,
  AlertTriangle, ShieldAlert, Calendar, Wallet, TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useCreditCards } from '../../hooks/useCreditCards';
import { fromCentavos } from '../../shared/schemas/financialSchemas';

// ─── Visual do Cartão Físico ─────────────────────────────────────────────────
function CardVisual({ card }) {
  const { metrics } = card;
  const color = card.color || '#00E68A';

  const alertColors = {
    safe:     { bar: color,     text: 'text-emerald-400' },
    warning:  { bar: '#FFB800', text: 'text-yellow-400'  },
    critical: { bar: '#FF4757', text: 'text-red-400'     },
  };
  const ac = alertColors[metrics.alertLevel] || alertColors.safe;

  return (
    <div
      className="relative w-full aspect-[1.586] rounded-2xl p-5 overflow-hidden select-none"
      style={{
        background: `linear-gradient(135deg, rgba(19,26,42,0.95) 0%, rgba(10,14,23,0.99) 100%)`,
        border: `1px solid ${color}30`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${color}15, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      {/* Fundo decorativo */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-8 -right-8 w-40 h-40 rounded-full blur-3xl opacity-20"
          style={{ background: color }}
        />
        <div
          className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full blur-3xl opacity-10"
          style={{ background: color }}
        />
        {/* Padrão de linhas */}
        <svg className="absolute inset-0 w-full h-full opacity-5" viewBox="0 0 400 252">
          <path d="M0 100 Q200 50 400 100" stroke="white" strokeWidth="1" fill="none" />
          <path d="M0 150 Q200 100 400 150" stroke="white" strokeWidth="0.5" fill="none" />
        </svg>
      </div>

      <div className="relative z-10 h-full flex flex-col justify-between">
        {/* Topo */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: `${color}99` }}>
              Quantum Finance
            </p>
            <p className="text-base font-black text-white mt-0.5">{card.name}</p>
          </div>
          <div
            className="p-2 rounded-xl"
            style={{ background: `${color}20`, border: `1px solid ${color}30` }}
          >
            <CreditCard className="w-5 h-5" style={{ color }} />
          </div>
        </div>

        {/* Chip decorativo */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-7 rounded-md border-2 opacity-60"
            style={{ borderColor: `${color}60`, background: `${color}15` }}
          />
          <div className="h-0.5 w-12 opacity-20" style={{ background: color }} />
          <div className="h-0.5 w-8 opacity-10" style={{ background: color }} />
        </div>

        {/* Baixo: limite e uso */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-white/40">Usado</span>
            <span className={`font-bold font-mono ${ac.text}`}>
              {metrics.compromisso.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${metrics.compromisso}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${ac.bar}, ${ac.bar}CC)`,
                boxShadow: `0 0 8px ${ac.bar}80`,
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/30 mb-0.5">Disponível</p>
              <p className="text-sm font-black font-mono text-white">
                R$ {metrics.disponivel.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest text-white/30 mb-0.5">Limite Total</p>
              <p className="text-sm font-bold font-mono" style={{ color: `${color}CC` }}>
                R$ {metrics.limitVal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Formulário de Cartão ────────────────────────────────────────────────────
const CARD_COLORS = ['#00E68A', '#A855F7', '#06B6D4', '#FFB800', '#FF4757', '#3B82F6', '#F43F5E'];

function CardForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:       initial?.name        || '',
    limit:      initial ? fromCentavos(initial.limit) : '',
    closingDay: initial?.closingDay  || 1,
    dueDay:     initial?.dueDay      || 10,
    color:      initial?.color       || '#00E68A',
    active:     initial?.active !== false,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.limit) {
      toast.error('Preencha nome e limite.');
      return;
    }
    // 🛡️ MATEMÁTICA MILITAR: Transforma o limite em Centavos Inteiros antes de gravar
    const limitEmCentavos = Math.round(Number(form.limit) * 100);
    onSave({ ...form, limit: limitEmCentavos });
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <div>
        <label className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-1.5 block">Nome do Cartão</label>
        <input
          className="input-quantum"
          placeholder="Ex: Nubank Platinum"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          required
        />
      </div>

      <div>
        <label className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-1.5 block">Limite (R$)</label>
        <input
          className="input-quantum"
          type="number"
          placeholder="5000.00"
          value={form.limit}
          onChange={e => set('limit', e.target.value)}
          required min="1" step="0.01"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-1.5 block">Dia de Fecho</label>
          <input
            className="input-quantum"
            type="number" min="1" max="31"
            value={form.closingDay}
            onChange={e => set('closingDay', Number(e.target.value))}
          />
        </div>
        <div>
          <label className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-1.5 block">Dia de Vencimento</label>
          <input
            className="input-quantum"
            type="number" min="1" max="31"
            value={form.dueDay}
            onChange={e => set('dueDay', Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-2 block">Cor do Cartão</label>
        <div className="flex gap-2 flex-wrap">
          {CARD_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => set('color', c)}
              className="w-8 h-8 rounded-lg transition-all border-2"
              style={{
                background: c,
                borderColor: form.color === c ? 'white' : 'transparent',
                boxShadow: form.color === c ? `0 0 12px ${c}80` : 'none',
                transform: form.color === c ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 bg-quantum-bgSecondary border border-quantum-border text-quantum-fgMuted rounded-xl text-sm font-bold hover:text-white transition-colors">
          Cancelar
        </button>
        <button type="submit" className="flex-1 btn-quantum-primary">
          {initial ? 'Guardar Alterações' : 'Adicionar Cartão'}
        </button>
      </div>
    </motion.form>
  );
}

// ─── Componente Principal ────────────────────────────────────────────────────
export default function CreditCardManager({ uid, transactions = [] }) {
  const { cards, loading, addCard, updateCard, removeCard } = useCreditCards(uid, transactions);
  const [showForm,   setShowForm]   = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [deletingId,  setDeletingId]  = useState(null);

  const handleSave = async (data) => {
    try {
      if (editingCard) {
        await updateCard(editingCard.id, data);
        toast.success('Cartão atualizado!');
      } else {
        await addCard(data);
        toast.success('Cartão adicionado!');
      }
      setShowForm(false);
      setEditingCard(null);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao guardar cartão.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await removeCard(id);
      toast.success('Cartão removido.');
    } catch {
      toast.error('Erro ao remover cartão.');
    } finally {
      setDeletingId(null);
    }
  };

  const alertIcon = (level) => {
    if (level === 'critical') return <ShieldAlert className="w-4 h-4 text-quantum-red" />;
    if (level === 'warning')  return <AlertTriangle className="w-4 h-4 text-quantum-gold" />;
    return <CheckCircle className="w-4 h-4 text-quantum-accent" />;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-3">
            <div className="p-2 bg-quantum-accentDim rounded-xl border border-quantum-accent/20">
              <CreditCard className="w-5 h-5 text-quantum-accent" />
            </div>
            Cartões de Crédito
          </h2>
          <p className="text-sm text-quantum-fgMuted ml-12 mt-0.5">Monitorização de limites e faturas em tempo real</p>
        </div>
        <button
          onClick={() => { setEditingCard(null); setShowForm(true); }}
          className="btn-quantum-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo Cartão</span>
        </button>
      </div>

      {/* Formulário */}
      <AnimatePresence>
        {(showForm || editingCard) && (
          <motion.div
            key="card-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card-quantum p-5 border border-quantum-accent/20"
          >
            <h3 className="text-sm font-bold text-white mb-4">
              {editingCard ? 'Editar Cartão' : 'Adicionar Novo Cartão'}
            </h3>
            <CardForm
              initial={editingCard}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingCard(null); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista de Cartões */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-quantum-fgMuted">
          <div className="w-6 h-6 border-2 border-quantum-accent/30 border-t-quantum-accent rounded-full animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center py-16 gap-4 text-center"
        >
          <div className="p-5 bg-quantum-card rounded-3xl border border-quantum-border">
            <CreditCard className="w-10 h-10 text-quantum-fgMuted" />
          </div>
          <p className="text-sm text-quantum-fgMuted">Sem cartões registados. Adicione o primeiro cartão.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {cards.map((card, i) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.07 }}
                className="space-y-3"
              >
                {/* Visual Físico */}
                <CardVisual card={card} />

                {/* Informações do Cartão */}
                <div className="glass-card-quantum p-4 space-y-3">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {alertIcon(card.metrics.alertLevel)}
                      <span className="text-xs font-bold text-white">
                        {card.metrics.alertLevel === 'critical' ? 'Limite Crítico'
                          : card.metrics.alertLevel === 'warning' ? 'Atenção'
                          : 'Margem Segura'}
                      </span>
                    </div>
                    <span className="text-xs text-quantum-fgMuted">
                      Vence em {card.metrics.daysUntilDue}d
                    </span>
                  </div>

                  {/* Dados */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-quantum-bgSecondary rounded-xl p-2.5">
                      <p className="text-[9px] text-quantum-fgMuted uppercase tracking-wider mb-1">Fatura</p>
                      <p className="text-xs font-bold text-quantum-red font-mono">
                        R$ {card.metrics.faturaAtual.toFixed(0)}
                      </p>
                    </div>
                    <div className="bg-quantum-bgSecondary rounded-xl p-2.5">
                      <p className="text-[9px] text-quantum-fgMuted uppercase tracking-wider mb-1">Livre</p>
                      <p className="text-xs font-bold text-quantum-accent font-mono">
                        R$ {card.metrics.disponivel.toFixed(0)}
                      </p>
                    </div>
                    <div className="bg-quantum-bgSecondary rounded-xl p-2.5">
                      <p className="text-[9px] text-quantum-fgMuted uppercase tracking-wider mb-1">Fecho</p>
                      <p className="text-xs font-bold text-white">Dia {card.closingDay}</p>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingCard(card); setShowForm(false); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-xs text-quantum-fgMuted hover:text-white hover:border-quantum-accent/30 transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Editar
                    </button>

                    {deletingId === card.id ? (
                      <div className="flex gap-1.5 flex-1">
                        <button onClick={() => setDeletingId(null)} className="flex-1 py-2 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-xs text-quantum-fgMuted hover:text-white transition-all">
                          Não
                        </button>
                        <button onClick={() => handleDelete(card.id)} className="flex-1 py-2 bg-quantum-redDim border border-quantum-red/30 rounded-xl text-xs text-quantum-red font-bold hover:bg-quantum-red/20 transition-all">
                          Confirmar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(card.id)}
                        className="p-2 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-quantum-fgMuted hover:text-quantum-red hover:border-quantum-red/30 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}