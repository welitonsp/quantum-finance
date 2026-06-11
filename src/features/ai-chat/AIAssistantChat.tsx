import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, BrainCircuit, User, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GeminiService } from './GeminiService';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import type { Transaction, ModuleBalances } from '../../shared/types/transaction';

// ─── Rate-limit helpers (localStorage, no PII stored) ─────────────────────────

const RATE_LIMIT_KEY  = 'qf_ai_calls';
const RATE_LIMIT_MAX  = 20;
const RATE_LIMIT_WARN = 18;
const RATE_WINDOW_MS  = 60 * 60 * 1000; // 1 hour rolling window

function loadCallTimestamps(): number[] {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter((v): v is number => typeof v === 'number');
  } catch {
    return [];
  }
}

function saveCallTimestamps(ts: number[]): void {
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(ts));
  } catch {
    // storage unavailable — fail silently
  }
}

function getActiveCalls(): number[] {
  const now = Date.now();
  return loadCallTimestamps().filter(t => now - t < RATE_WINDOW_MS);
}

function recordCall(): void {
  const active = getActiveCalls();
  saveCallTimestamps([...active, Date.now()]);
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: 'ai' | 'user';
  text: string;
}

interface Props {
  transactions: Transaction[];
  balances: Partial<ModuleBalances> | null;
  isOpen: boolean;
  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const AIAssistantChat = ({ transactions, balances, isOpen, onClose }: Props) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: 'Olá, Comandante! Sou a Quantum AI — Auditora Financeira de Elite. Posso cruzar os seus dados, detetar anomalias e calcular o seu Burn Rate. Como posso ajudar?' },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading,    setIsLoading]    = useState(false);
  const [callCount,    setCallCount]    = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync callCount from localStorage whenever the chat opens or after a call.
  const refreshCount = useCallback(() => {
    setCallCount(getActiveCalls().length);
  }, []);

  useEffect(() => {
    if (isOpen) refreshCount();
  }, [isOpen, refreshCount]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const rateLimitReached = callCount >= RATE_LIMIT_MAX;
  const rateLimitWarning = callCount >= RATE_LIMIT_WARN && !rateLimitReached;

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || rateLimitReached) return;

    const userText = inputMessage.trim();
    setInputMessage('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    recordCall();
    refreshCount();

    try {
      const aiResponse = await GeminiService.getFinancialAdvice(userText, {
        saldo:        balances?.geral?.saldo    ?? 0,
        entradas:     balances?.geral?.receitas ?? 0,
        saidas:       balances?.geral?.despesas ?? 0,
        transactions: transactions.slice(0, 50),
      });
      setMessages(prev => [...prev, { role: 'ai', text: aiResponse }]);
    } catch (error) {
      logSanitizedFirebaseError('ai_chat_advice', error);
      setMessages(prev => [...prev, { role: 'ai', text: '🚨 Interferência quântica detectada. Verifique a chave da API no ficheiro .env.' }]);
    } finally {
      setIsLoading(false);
    }
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
          className="fixed bottom-24 right-6 md:right-8 w-[90vw] md:w-[420px] h-[520px] bg-quantum-card/95 backdrop-blur-xl border border-quantum-accent/20 rounded-3xl shadow-[0_0_40px_rgba(0,230,138,0.1)] flex flex-col z-50 overflow-hidden"
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
            <button onClick={onClose} className="p-2 text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/10 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar relative z-10">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'user' ? 'bg-indigo-600 shadow-indigo-500/20' : 'bg-quantum-accent/20 border border-quantum-accent/30 shadow-[0_0_10px_rgba(0,230,138,0.15)]'}`}>
                    {msg.role === 'user'
                      ? <User className="w-4 h-4 text-quantum-fg" />
                      : <BrainCircuit className="w-4 h-4 text-quantum-accent" />
                    }
                  </div>
                  <div className={`p-3 rounded-2xl max-w-[78%] text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-quantum-bgSecondary text-quantum-fg rounded-tl-none border border-quantum-border'}`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
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

          {/* Input */}
          <form onSubmit={(e) => void handleSendMessage(e)} className="p-4 bg-quantum-bg/80 border-t border-quantum-border flex flex-col gap-2 relative z-10">
            {/* Rate limit indicator */}
            <div className="flex items-center justify-between text-xs px-0.5">
              <span className={`${rateLimitWarning ? 'text-amber-400' : rateLimitReached ? 'text-red-400 font-medium' : 'text-quantum-fgMuted'}`}>
                {callCount}/{RATE_LIMIT_MAX} chamadas usadas neste período
              </span>
              {(rateLimitWarning || rateLimitReached) && (
                <AlertTriangle className={`w-3.5 h-3.5 ${rateLimitReached ? 'text-red-400' : 'text-amber-400'}`} />
              )}
            </div>

            {rateLimitReached ? (
              <p className="text-xs text-red-400 text-center py-1">
                Limite atingido. Tente novamente em breve.
              </p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text" value={inputMessage} onChange={e => setInputMessage(e.target.value)}
                  placeholder="Analise os meus gastos, Comandante..." disabled={isLoading}
                  className="flex-1 bg-quantum-bgSecondary border border-quantum-border rounded-xl px-4 py-2.5 text-sm text-quantum-fg placeholder:text-quantum-fgMuted focus:outline-none focus:border-quantum-accent/50 focus:shadow-[0_0_0_2px_rgba(0,230,138,0.1)] transition-all disabled:opacity-50"
                />
                <button type="submit" disabled={isLoading || !inputMessage.trim()}
                  className="p-2.5 bg-quantum-accent/90 hover:bg-quantum-accent text-quantum-bg rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,230,138,0.25)] hover:shadow-[0_0_20px_rgba(0,230,138,0.4)] active:scale-95">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            )}
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIAssistantChat;
