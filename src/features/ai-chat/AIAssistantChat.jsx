import React, { useState, useEffect, useRef } from 'react';
import { X, Send, BrainCircuit, User, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { aiProvider } from '../../shared/ai/aiProvider';

export const AIAssistantChat = ({ transactions, balances, isOpen, onClose }) => {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Olá, Comandante! Sou a Quantum AI — Auditora Financeira de Elite. Posso cruzar os seus dados, detetar anomalias e calcular o seu Burn Rate. Como posso ajudar?' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userText = inputMessage.trim();
    setInputMessage('');
    const newMessages = [...messages, { role: 'user', text: userText }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const systemPrompt = {
        role: 'system',
        content:
          'Você é a Quantum AI, auditora financeira de elite. Seja direto, objetivo e use dados concretos.\n' +
          'Dados financeiros do utilizador:\n' +
          JSON.stringify({
            saldo:              balances?.geral?.saldo     ?? 0,
            entradas:           balances?.geral?.receitas  ?? 0,
            saidas:             balances?.geral?.despesas  ?? 0,
            ultimasTransacoes:  transactions.slice(0, 50),
          }),
      };

      // Mapeia histórico de UI {role:'user'|'ai', text} → formato do provider
      const historyMsgs = messages.map(m => ({
        role:    m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const aiResponse = await aiProvider.chatCompletion([
        systemPrompt,
        ...historyMsgs,
        { role: 'user', content: userText },
      ]);
      setMessages(prev => [...prev, { role: 'ai', text: aiResponse }]);
    } catch (error) {
      console.error("Erro no link de comunicação Quântico:", error);
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
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed bottom-24 right-6 md:right-8 w-[90vw] md:w-[420px] h-[520px] bg-quantum-card/95 backdrop-blur-xl border border-quantum-accent/20 rounded-3xl shadow-[0_0_40px_rgba(0,230,138,0.1)] flex flex-col z-50 overflow-hidden"
        >
          {/* Glow de fundo */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-quantum-accent/8 rounded-full blur-3xl" />
          </div>

          {/* Cabeçalho */}
          <div className="p-4 bg-quantum-bg/80 border-b border-white/5 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-quantum-accent/15 rounded-xl border border-quantum-accent/20 shadow-[0_0_12px_rgba(0,230,138,0.2)]">
                <BrainCircuit className="w-5 h-5 text-quantum-accent" />
              </div>
              <div>
                <h3 className="font-bold text-white leading-none tracking-wide">Quantum AI</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-quantum-accent animate-pulse" />
                  <span className="text-xs text-quantum-accent font-medium">Auditora Activa</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-quantum-fgMuted hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Janela de Conversa */}
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
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'user' ? 'bg-indigo-600 shadow-indigo-500/20' : 'bg-quantum-accent/20 border border-quantum-accent/30 shadow-[0_0_10px_rgba(0,230,138,0.15)]'}`}>
                    {msg.role === 'user'
                      ? <User className="w-4 h-4 text-white" />
                      : <BrainCircuit className="w-4 h-4 text-quantum-accent" />
                    }
                  </div>
                  <div className={`p-3 rounded-2xl max-w-[78%] text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-quantum-bgSecondary text-quantum-fg rounded-tl-none border border-white/5'}`}>
                    {msg.text}
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
                <div className="p-4 bg-quantum-bgSecondary rounded-2xl rounded-tl-none border border-white/5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-quantum-accent rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-quantum-accent rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-quantum-accent rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="p-4 bg-quantum-bg/80 border-t border-white/5 flex gap-2 relative z-10">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Analise os meus gastos, Comandante..."
              disabled={isLoading}
              className="flex-1 bg-quantum-bgSecondary border border-quantum-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-quantum-fgMuted focus:outline-none focus:border-quantum-accent/50 focus:shadow-[0_0_0_2px_rgba(0,230,138,0.1)] transition-all disabled:opacity-50"
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
