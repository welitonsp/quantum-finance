// src/features/ai-chat/AIAssistantChat.jsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, User, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
// ✅ CORREÇÃO: Coordenada atualizada para o cofre do Firebase no shared
import { app } from '../../shared/api/firebase/index.js'; 
import ReactMarkdown from 'react-markdown'; 

export default function AIAssistantChat({ transactions }) {
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Olá, Comandante. Sou o seu Gestor de Património Quântico. Já analisei o seu fluxo de caixa deste mês. Como posso ajudar a otimizar as suas finanças hoje?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const financialContext = useMemo(() => {
    if (!transactions) return { entradas: 0, saidas: 0, saldo: 0, totalTransacoes: 0 };
    
    let entradas = 0;
    let saidas = 0;
    
    transactions.forEach(t => {
      if (t.type === 'entrada') entradas += Number(t.value);
      else saidas += Number(t.value);
    });

    return {
      entradas,
      saidas,
      saldo: entradas - saidas,
      totalTransacoes: transactions.length
    };
  }, [transactions]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const functions = getFunctions(app);
      const quantumChatAdvisor = httpsCallable(functions, 'quantumChatAdvisor');
      
      const result = await quantumChatAdvisor({ 
        message: userMsg,
        financialContext: financialContext 
      });

      setMessages(prev => [...prev, { role: 'ai', content: result.data.reply }]);
    } catch (error) {
      console.error("Erro de comunicação com o Quantum:", error);
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: '⚠️ Ocorreu uma interferência quântica nos servidores. Por favor, tente novamente.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-quantum-card border border-quantum-border rounded-3xl overflow-hidden shadow-2xl relative">
      <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="p-4 md:p-6 border-b border-quantum-border bg-quantum-bgSecondary/50 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">Quantum Advisor</h2>
            <div className="flex items-center gap-1 text-xs text-quantum-fgMuted">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Conexão Nuvem Segura (Grau Bancário)
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar z-10">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-quantum-accent/20 text-quantum-accent' : 'bg-cyan-500/20 text-cyan-400'}`}>
              {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>
            <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-quantum-accent text-white rounded-tr-none' 
                : 'bg-quantum-bgSecondary border border-quantum-border text-slate-200 rounded-tl-none prose prose-invert prose-p:leading-snug prose-li:my-0 max-w-none'
            }`}>
              {msg.role === 'user' ? (
                 msg.content
              ) : (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4 max-w-[85%]">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className="p-4 rounded-2xl bg-quantum-bgSecondary border border-quantum-border rounded-tl-none flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse delay-75"></div>
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse delay-150"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-quantum-border bg-quantum-bgSecondary/30 z-10">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre os seus gastos, investimentos ou estratégias..."
            className="flex-1 bg-quantum-card border border-quantum-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-600"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}