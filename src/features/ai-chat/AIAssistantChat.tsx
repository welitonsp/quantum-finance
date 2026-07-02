import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Send, BrainCircuit, User, ChevronDown, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GeminiService } from './GeminiService';
import { ConversationMemory } from './ConversationMemory';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { fromCentavos } from '../../shared/types/money';
import { getTransactionAbsCentavos } from '../../utils/transactionUtils';
import type { Transaction, ModuleBalances, RecurringTask } from '../../shared/types/transaction';
import { geminiIntentClassifier } from '../ai-agent/geminiIntentClassifier';
import { routeIntent } from '../ai-agent/intentRouter';
import { buildQueryContext } from '../ai-agent/queryContextBuilder';
import { presentProposal, formatMissingInfoMessage, type PresentationHints } from '../ai-agent/proposalPresentation';
import { ActionConfirmationSheet } from '../ai-agent/ActionConfirmationSheet';
import { interpretMutationCommand, parseConfirmationReply } from '../ai-agent/mutationCommandGuard';
import type { AccountRef } from '../ai-agent/accountResolution';
import { useAgentAction, type AgentActionResult } from '../../hooks/useAgentAction';
import type { ActionProposal, AgentIntent } from '../../shared/schemas/agentSchemas';
import { INTENT_REGISTRY, type AgentTool } from '../ai-agent/intentRegistry';

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
  /** Contas do usuário — usadas para resolver nomes → IDs em transferências (read-only). */
  accounts?:       AccountRef[];
  /** Tarefas recorrentes — enriquece o contexto enviado ao Gemini. */
  recurringTasks?: RecurringTask[];
  isOpen:       boolean;
  onClose:      () => void;
  /**
   * Notificação após uma ação do agente ser executada com sucesso (callable retornou).
   * A lista de Movimentações e o Dashboard já refletem a escrita via listener realtime
   * (`onSnapshot`), mas este hook permite invalidação/refresh explícito por consumidores
   * que não sejam realtime.
   */
  onActionExecuted?: (result: AgentActionResult) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Log de auditoria do fluxo do agente — somente DEV, sem PII/secrets (apenas ids/paths). */
function agentLog(event: string, data?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.info(`[agent] ${event}`, data ?? {});
  }
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

export const AIAssistantChat = ({ uid = '', transactions, balances, accounts = [], recurringTasks = [], isOpen, onClose, onActionExecuted }: Props) => {
  const memory = useMemo(() => new ConversationMemory(uid), [uid]);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      text: 'Olá, Comandante! Sou a Quantum AI — Auditora Financeira de Elite. Posso cruzar os seus dados, detetar anomalias e calcular o seu Burn Rate. Como posso ajudar?',
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading,    setIsLoading]    = useState(false);
  const [callCount,    setCallCount]    = useState(0);

  // ── Intent router → confirmação humana de ação (FASE H, atrás de flag) ─────────
  interface PendingAction {
    proposal: ActionProposal;
    intent:   AgentIntent;
    tools:    AgentTool[];
    question: string;
    /** Dicas de exibição fora do payload (ex.: nomes de conta de uma transferência). */
    displayHints?: PresentationHints;
  }
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const { status: agentStatus, error: agentError, runAction, reset: resetAgent } = useAgentAction();

  const RATE_LIMIT_MAX  = 20;
  const RATE_LIMIT_WARN = 18;
  const RATE_LIMIT_KEY  = `qf_rate_${uid}`;
  const RATE_WINDOW_MS  = 60 * 60 * 1000; // 1 hour

  // Sync callCount from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RATE_LIMIT_KEY);
      if (!raw) return;
      const calls: number[] = JSON.parse(raw);
      const now = Date.now();
      const recent = calls.filter(t => now - t < RATE_WINDOW_MS);
      localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(recent));
      setCallCount(recent.length);
    } catch {
      // ignore
    }
  }, [uid]);

  const recordCall = () => {
    try {
      const raw = localStorage.getItem(RATE_LIMIT_KEY);
      const calls: number[] = raw ? (JSON.parse(raw) as number[]) : [];
      const now = Date.now();
      const recent = [...calls.filter(t => now - t < RATE_WINDOW_MS), now];
      localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(recent));
      setCallCount(recent.length);
    } catch {
      // ignore
    }
  };

  const rateLimitReached = callCount >= RATE_LIMIT_MAX;
  const rateLimitWarning = callCount >= RATE_LIMIT_WARN && !rateLimitReached;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const suggestedQuestions = useMemo(
    () => getSuggestedQuestions(transactions, balances),
    [transactions, balances]
  );

  // Acrescenta uma fala do assistente ao chat e à memória de conversa.
  const pushAiMessage = useCallback((text: string) => {
    memory.append({ role: 'assistant', content: text, timestamp: new Date().toISOString() });
    setMessages(prev => [...prev, { role: 'ai', text }]);
  }, [memory]);

  // Confirmação humana: só aqui a ação proposta vira escrita server-trusted.
  const confirmAgentAction = useCallback(async () => {
    if (!pendingAction) return;
    agentLog('action confirmed', { kind: pendingAction.proposal.kind, intent: pendingAction.intent });
    try {
      const result = await runAction(pendingAction.proposal, {
        intent:    pendingAction.intent,
        question:  pendingAction.question,
        toolsUsed: pendingAction.tools,
      });
      setConfirmOpen(false);
      // Path com UID mascarado (sem PII): registra que a escrita foi materializada no
      // caminho canônico lido por Movimentações/Dashboard.
      agentLog('action executed', {
        kind:       pendingAction.proposal.kind,
        txId:       result.id,
        path:       `users/<uid>/transactions/${result.id}`,
        decisionId: result.decisionId,
      });
      // A UI já reflete a escrita via onSnapshot; notifica consumidores para refresh explícito.
      onActionExecuted?.(result);
      agentLog('data refetch requested', { txId: result.id });
      // Só após sucesso real da callable o chat confirma o registro.
      pushAiMessage(presentProposal(pendingAction.proposal).successMessage);
      setPendingAction(null);
    } catch {
      // Erro fica visível no sheet (com rota alternativa quando aplicável).
      // O chat NÃO afirma "registrada" quando a callable falha.
    }
  }, [pendingAction, runAction, pushAiMessage, onActionExecuted]);

  const dismissProposal = useCallback(() => {
    setConfirmOpen(false);
    setPendingAction(null);
  }, []);

  // Cancelamento explícito por texto: descarta a proposta sem qualquer escrita.
  const cancelPendingAction = useCallback(() => {
    if (!pendingAction) return;
    agentLog('action cancelled', { kind: pendingAction.proposal.kind });
    setConfirmOpen(false);
    setPendingAction(null);
    pushAiMessage('Ok, cancelei. Nada foi registrado.');
  }, [pendingAction, pushAiMessage]);

  // Rota para o `reason` server-trusted `use_installment_form` (compra parcelada).
  const handleInstallmentRoute = useCallback(() => {
    setConfirmOpen(false);
    setPendingAction(null);
    pushAiMessage('Compras parceladas são registradas pelo formulário de transações, não pelo assistente.');
  }, [pushAiMessage]);

  const submitMessage = async (text: string) => {
    const userText = text.trim();
    if (!userText || rateLimitReached) return;

    setInputMessage('');
    const newMessages: Message[] = [...messages, { role: 'user', text: userText }];
    setMessages(newMessages);
    setIsLoading(true);

    // Persist user turn to memory
    memory.append({ role: 'user', content: userText, timestamp: new Date().toISOString() });

    const routerEnabled = import.meta.env.VITE_ENABLE_AGENT_ROUTER === 'true';

    // ── (1) Confirmação humana POR TEXTO de uma ação pendente ────────────────────
    // Enquanto houver uma proposta aguardando confirmação, a próxima mensagem é
    // interpretada como confirmar/cancelar. NUNCA cai no chat normal nem executa
    // sem um "confirmar" explícito.
    if (routerEnabled && pendingAction) {
      const reply = parseConfirmationReply(userText);
      if (reply === 'confirm') {
        setIsLoading(false);
        await confirmAgentAction();
        return;
      }
      if (reply === 'cancel') {
        cancelPendingAction();
        setIsLoading(false);
        return;
      }
      pushAiMessage('Só para confirmar: responda "confirmar" para registrar ou "cancelar" para descartar.');
      setIsLoading(false);
      return;
    }

    // ── (2) Guarda determinística de comando de mutação imperativo ───────────────
    // "Registre uma despesa…" vira uma PROPOSTA pendente (confirmação obrigatória),
    // jamais uma escrita imediata e jamais um texto alucinado do chat freeform.
    if (routerEnabled) {
      const guard = interpretMutationCommand(userText, new Date(), accounts);
      if (guard.type === 'expense_proposal' || guard.type === 'income_proposal') {
        // Despesa e receita compartilham a mesma cadeia segura: proposta pendente →
        // confirmação humana → callable validada. O intent só muda a auditoria/rotulagem.
        const intent: AgentIntent =
          guard.type === 'income_proposal' ? 'register_income_proposal' : 'simulate_purchase';
        setPendingAction({
          proposal: guard.proposal,
          intent,
          tools:    INTENT_REGISTRY[intent].tools,
          question: guard.question,
        });
        resetAgent();
        setConfirmOpen(true);
        agentLog('action proposed', { kind: guard.proposal.kind });
        agentLog('action confirmation required', { kind: guard.proposal.kind });
        pushAiMessage(guard.question);
        setIsLoading(false);
        return;
      }
      if (guard.type === 'transfer_proposal') {
        // Transferência: mesma cadeia segura. Os nomes de conta resolvidos viram
        // display hints (a sheet mostra "Poupança"/"Corrente", não os IDs crus).
        const intent: AgentIntent = 'register_transfer_proposal';
        setPendingAction({
          proposal: guard.proposal,
          intent,
          tools:    INTENT_REGISTRY[intent].tools,
          question: guard.question,
          displayHints: { fromAccountName: guard.fromAccountName, toAccountName: guard.toAccountName },
        });
        resetAgent();
        setConfirmOpen(true);
        agentLog('action proposed', { kind: guard.proposal.kind });
        agentLog('action confirmation required', { kind: guard.proposal.kind });
        pushAiMessage(guard.question);
        setIsLoading(false);
        return;
      }
      if (guard.type === 'needs_details') {
        pushAiMessage(guard.message);
        setIsLoading(false);
        return;
      }
      // not_mutation → segue para o classificador LLM abaixo.
    }

    // ── (3) Intent router LLM (atrás de flag; OFF por padrão) ────────────────────
    // Mesmo com a flag ON, NADA é gravado sem confirmação humana — o pior caso de uma
    // classificação ruim é uma proposta recusada. Read-only / baixa confiança /
    // intenção desconhecida caem no chat normal abaixo.
    let queryContextPrefix = '';
    if (routerEnabled) {
      try {
        const route = routeIntent(await geminiIntentClassifier({ message: userText }));

        if (route.type === 'proposal') {
          setPendingAction({
            proposal: route.proposal,
            intent:   route.intent,
            tools:    route.tools,
            question: route.question,
          });
          resetAgent();
          setConfirmOpen(true);
          agentLog('action proposed', { kind: route.proposal.kind });
          agentLog('action confirmation required', { kind: route.proposal.kind });
          pushAiMessage(route.question);
          setIsLoading(false);
          return;
        }

        if (route.type === 'need_more_info') {
          pushAiMessage(formatMissingInfoMessage(route.missing));
          setIsLoading(false);
          return;
        }

        if (route.type === 'answer') {
          // Enriquece o prompt com dados financeiros precisos para o intent detectado.
          queryContextPrefix = buildQueryContext(route.intent, transactions, balances) ?? '';
        }
        // low_confidence | unknown_intent → sem enriquecimento, segue no chat normal.
      } catch {
        // Falha de classificação degrada com segurança para o chat normal.
      }
    }

    // Build history context string from memory
    const history = memory.getHistory().slice(-6); // last 3 pairs
    const historyPrefix = history.length >= 2
      ? history
          .slice(0, -1) // exclude the turn we just added
          .map(t => `${t.role === 'user' ? 'Utilizador' : 'Assistente'}: ${t.content}`)
          .join('\n') + '\n\n'
      : '';

    const basePrompt = historyPrefix
      ? `[CONTEXTO ANTERIOR DA CONVERSA]\n${historyPrefix}[NOVA PERGUNTA]\n${userText}`
      : userText;
    const contextualPrompt = queryContextPrefix
      ? `${queryContextPrefix}\n${basePrompt}`
      : basePrompt;

    const contextTxs = transactions.slice(0, 50);

    try {
      const aiResponse = await GeminiService.getFinancialAdvice(contextualPrompt, {
        saldo:          balances?.geral?.saldo    ?? 0,
        entradas:       balances?.geral?.receitas ?? 0,
        saidas:         balances?.geral?.despesas ?? 0,
        transactions:   contextTxs,
        recurringTasks,
      });

      // Derive citations from the top transactions relevant to the query
      const citations = pickCitations(userText, contextTxs);

      recordCall();
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
    <>
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
            className="p-4 bg-quantum-bg/80 border-t border-quantum-border flex flex-col gap-2 relative z-10"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                placeholder={rateLimitReached ? 'Limite atingido. Tente novamente em breve.' : 'Analise os meus gastos, Comandante...'}
                disabled={isLoading || rateLimitReached}
                className="flex-1 bg-quantum-bgSecondary border border-quantum-border rounded-xl px-4 py-2.5 text-sm text-quantum-fg placeholder:text-quantum-fgMuted focus:outline-none focus:border-quantum-accent/50 focus:shadow-[0_0_0_2px_rgba(0,230,138,0.1)] transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !inputMessage.trim() || rateLimitReached}
                className="p-2.5 bg-quantum-accent/90 hover:bg-quantum-accent text-quantum-bg rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,230,138,0.25)] hover:shadow-[0_0_20px_rgba(0,230,138,0.4)] active:scale-95"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className={rateLimitWarning ? 'text-amber-400' : rateLimitReached ? 'text-red-400 font-medium' : 'text-quantum-fgMuted'}>
                {callCount}/{RATE_LIMIT_MAX} chamadas usadas neste período
              </span>
              {(rateLimitWarning || rateLimitReached) && (
                <AlertTriangle className={`w-3.5 h-3.5 ${rateLimitReached ? 'text-red-400' : 'text-amber-400'}`} />
              )}
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Confirmação humana de ação proposta pelo Agente (FASE H) */}
    {pendingAction && (
      <ActionConfirmationSheet
        open={confirmOpen}
        onClose={dismissProposal}
        onConfirm={() => void confirmAgentAction()}
        question={pendingAction.question}
        status={agentStatus}
        error={agentError}
        route={{
          reason: 'use_installment_form',
          label: 'Abrir formulário de transações',
          onClick: handleInstallmentRoute,
        }}
        {...presentProposal(pendingAction.proposal, pendingAction.displayHints)}
      />
    )}
    </>
  );
};

export default AIAssistantChat;
