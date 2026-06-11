import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send, BrainCircuit, User, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GeminiService } from './GeminiService';
import { ConversationMemory } from './ConversationMemory';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { fromCentavos } from '../../shared/types/money';
import { getTransactionAbsCentavos } from '../../utils/transactionUtils';
import type { Transaction, ModuleBalances } from '../../shared/types/transaction';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CitationTransaction {
  id:          string;
  description: string;
  category:    string;
  date:        string;
  valueBRL:    string;
  type:        string;
}

interface Message {
  role:       'ai' | 'user';
  text:       string;
  citations?: CitationTransaction[];
}

interface Props {
  uid?:         string;
  transactions: Transaction[];
  balances:     Partial<ModuleBalances> | null;
  isOpen:       boolean;
  onClose:      () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isExpenseTx(tx: Transaction): boolean {
  return tx.type === 'saida' || tx.type === 'despesa';
}

/**
 * Picks the top transactions that are most relevant to the user's query.
 * Priority: matches any word from the query in description or category,
 * then fallback to most recent.
 */
function pickCitations(
  userText: string,
  txs: Transaction[],
  limit = 5
): CitationTransaction[] {
  const words = userText
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 3);

  const scored = txs.map(tx => {
    const hay = `${tx.description ?? ''} ${tx.category ?? ''}`.toLowerCase();
    const score = words.filter(w => hay.includes(w)).length;
    return { tx, score };
  });

  const sorted = scored
    .sort((a, b) => b.score - a.score || (a.tx.date ?? '') < (b.tx.date ?? '') ? 1 : -1)
    .slice(0, limit)
    .map(({ tx }) => ({
      id:          tx.id ?? '',
      description: tx.description ?? '—',
      category:    tx.category ?? 'Outros',
      date:        tx.date ?? '',
      valueBRL:    fmtBRL(getTransactionAbsCentavos(tx)),
      type:        tx.type ?? 'saida',
    }));

  return sorted;
}

/** Returns context-aware suggested questions. */
function getSuggestedQuestions(
  transactions: Transaction[],
  balances: Partial<ModuleBalances> | null
): string[] {
  const suggestions: string[] = [];

  // Check if spending is up (expenses > income in current context)
  const saldo    = balances?.geral?.saldo    ?? 0;
  const receitas = balances?.geral?.receitas ?? 0;
  const despesas = balances?.geral?.despesas ?? 0;

  const hasDebts = transactions.some(tx =>
    tx.category?.toLowerCase().includes('dívida') ||
    tx.category?.toLowerCase().includes('emprestimo') ||
    tx.category?.toLowerCase().includes('financiamento')
  );

  const spendingUp = despesas > receitas * 0.8;
  const lowBalance = saldo < fromCentavos(
    transactions.filter(isExpenseTx).reduce((s, tx) => s + getTransactionAbsCentavos(tx), 0) / Math.max(transactions.length, 1) * 10
  );

  if (hasDebts) {
    suggestions.push('Como quitar minhas dívidas mais rápido?');
  }
  if (spendingUp) {
    suggestions.push('Por que meus gastos aumentaram?');
  }
  if (lowBalance && !spendingUp) {
    suggestions.push('Como aumentar minha reserva de emergência?');
  }

  suggestions.push('Qual minha saúde financeira?');
  suggestions.push('Onde posso economizar?');

  return suggestions.slice(0, 4);
}

// ─── Citation disclosure component ────────────────────────────────────────────

function CitationDisclosure({ citations }: { citations: CitationTransaction[] }) {
  const [open, setOpen] = useState(false);

  return (
    <details
      open={open}
      onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mt-2 text-xs"
    >
      <summary className="cursor-pointer select-none flex items-center gap-1.5 text-quantum-fgMuted hover:text-quantum-accent transition-colors list-none">
        <span className="text-base leading-none">📊</span>
        <span>Baseado em {citations.length} transaç{citations.length === 1 ? 'ão' : 'ões'}</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </summary>
      <div className="mt-2 space-y-1 pl-1 border-l-2 border-quantum-accent/20 ml-1">
        {citations.map((c, i) => (
          <div key={`${c.id}-${i}`} className="flex items-start gap-2 text-quantum-fgMuted">
            <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${c.type === 'entrada' || c.type === 'receita' ? 'bg-quantum-accent' : 'bg-red-400'}`} />
            <div className="min-w-0">
              <span className="text-quantum-fg font-medium truncate block">{c.description}</span>
              <span>{c.category} · {c.date} · {c.valueBRL}</span>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const AIAssistantChat = ({ uid = '', transactions, balances, isOpen, onClose }: Props) => {
  const memory = useMemo(() => new ConversationMemory(uid), [uid]);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      text: 'Olá, Comandante! Sou a Quantum AI — Auditora Financeira de Elite. Posso cruzar os seus dados, detetar anomalias e calcular o seu Burn Rate. Como posso ajudar?',
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading,    setIsLoading]    = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const suggestedQuestions = useMemo(
    () => getSuggestedQuestions(transactions, balances),
    [transactions, balances]
  );

  const submitMessage = async (text: string) => {
    const userText = text.trim();
    if (!userText) return;

    setInputMessage('');
    const newMessages: Message[] = [...messages, { role: 'user', text: userText }];
    setMessages(newMessages);
    setIsLoading(true);

    // Persist user turn to memory
    memory.append({ role: 'user', content: userText, timestamp: new Date().toISOString() });

    // Build history context string from memory
    const history = memory.getHistory().slice(-6); // last 3 pairs
    const historyPrefix = history.length >= 2
      ? history
          .slice(0, -1) // exclude the turn we just added
          .map(t => `${t.role === 'user' ? 'Utilizador' : 'Assistente'}: ${t.content}`)
          .join('\n') + '\n\n'
      : '';

    const contextualPrompt = historyPrefix
      ? `[CONTEXTO ANTERIOR DA CONVERSA]\n${historyPrefix}[NOVA PERGUNTA]\n${userText}`
      : userText;

    const contextTxs = transactions.slice(0, 50);

    try {
      const aiResponse = await GeminiService.getFinancialAdvice(contextualPrompt, {
        saldo:        balances?.geral?.saldo    ?? 0,
        entradas:     balances?.geral?.receitas ?? 0,
        saidas:       balances?.geral?.despesas ?? 0,
        transactions: contextTxs,
      });

      // Derive citations from the top transactions relevant to the query
      const citations = pickCitations(userText, contextTxs);

      memory.append({ role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() });

      const aiMessage: Message = citations.length
        ? { role: 'ai', text: aiResponse, citations }
        : { role: 'ai', text: aiResponse };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      logSanitizedFirebaseError('ai_chat_advice', error);
      setMessages(prev => [
        ...prev,
        { role: 'ai', text: '🚨 Interferência quântica detectada. Verifique a chave da API no ficheiro .env.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    void submitMessage(inputMessage);
  };

  const handleChipClick = (question: string) => {
    void submitMessage(question);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="ai-chat"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0,  scale: 1    }}
          exit={{   opacity: 0, y: 24,  scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed bottom-24 right-6 md:right-8 w-[90vw] md:w-[420px] h-[560px] bg-quantum-card/95 backdrop-blur-xl border border-quantum-accent/20 rounded-3xl shadow-[0_0_40px_rgba(0,230,138,0.1)] flex flex-col z-50 overflow-hidden"
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-quantum-accent/8 rounded-full blur-3xl" />
          </div>

          {/* Header */}
          <div className="p-4 bg-quantum-bg/80 border-b border-quantum-border flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-quantum-accent/15 rounded-xl border border-quantum-accent/20 shadow-[0_0_12px_rgba(0,230,138,0.2)]">
                <BrainCircuit className="w-5 h-5 text-quantum-accent" />
              </div>
              <div>
                <h3 className="font-bold text-quantum-fg leading-none tracking-wide">Quantum AI</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-quantum-accent animate-pulse" />
                  <span className="text-xs text-quantum-accent font-medium">Auditora Activa</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/10 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar relative z-10">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 shadow-indigo-500/20'
                        : 'bg-quantum-accent/20 border border-quantum-accent/30 shadow-[0_0_10px_rgba(0,230,138,0.15)]'
                    }`}
                  >
                    {msg.role === 'user'
                      ? <User className="w-4 h-4 text-quantum-fg" />
                      : <BrainCircuit className="w-4 h-4 text-quantum-accent" />
                    }
                  </div>
                  <div
                    className={`p-3 rounded-2xl max-w-[78%] text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-quantum-bgSecondary text-quantum-fg rounded-tl-none border border-quantum-border'
                    }`}
                  >
                    {msg.text}
                    {msg.role === 'ai' && msg.citations && msg.citations.length > 0 && (
                      <CitationDisclosure citations={msg.citations} />
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-quantum-accent/20 border border-quantum-accent/30 flex items-center justify-center shrink-0">
                  <BrainCircuit className="w-4 h-4 text-quantum-accent" />
                </div>
                <div className="p-4 bg-quantum-bgSecondary rounded-2xl rounded-tl-none border border-quantum-border flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-quantum-accent rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-quantum-accent rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-quantum-accent rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested question chips */}
          {!isLoading && messages.length <= 2 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2 relative z-10">
              {suggestedQuestions.map(q => (
                <button
                  key={q}
                  onClick={() => handleChipClick(q)}
                  className="text-xs px-3 py-1.5 rounded-full bg-quantum-bgSecondary border border-quantum-border text-quantum-fgMuted hover:text-quantum-accent hover:border-quantum-accent/40 transition-colors truncate max-w-[200px]"
                  title={q}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleSendMessage}
            className="p-4 bg-quantum-bg/80 border-t border-quantum-border flex gap-2 relative z-10"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              placeholder="Analise os meus gastos, Comandante..."
              disabled={isLoading}
              className="flex-1 bg-quantum-bgSecondary border border-quantum-border rounded-xl px-4 py-2.5 text-sm text-quantum-fg placeholder:text-quantum-fgMuted focus:outline-none focus:border-quantum-accent/50 focus:shadow-[0_0_0_2px_rgba(0,230,138,0.1)] transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              className="p-2.5 bg-quantum-accent/90 hover:bg-quantum-accent text-quantum-bg rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,230,138,0.25)] hover:shadow-[0_0_20px_rgba(0,230,138,0.4)] active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIAssistantChat;
