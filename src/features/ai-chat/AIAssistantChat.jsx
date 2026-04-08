// src/features/ai-chat/AIAssistantChat.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, Bot, User, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../shared/api/firebase/index.js'; 
import ReactMarkdown from 'react-markdown'; 

export default function AIAssistantChat({ transactions, balances, isOpen, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Olá, Comandante. Sou o seu Gestor de Património Quântico. Já analisei o seu fluxo de caixa deste mês. Como posso ajudar a otimizar as suas finanças hoje?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // 🌟 CONTEXTO INTELIGENTE: Utiliza os saldos já calculados pelo sistema central
  const financialContext = useMemo(() => {
    const format = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    
    return {
      entradas: format(balances?.geral?.receitas),
      saidas: format(balances?.geral?.despesas),
      saldo: format(balances?.geral?.saldo),
      totalTransacoes: transactions?.length || 0
    };
  }, [balances, transactions]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Se não estiver aberto (botão não clicado), não renderiza nada
  if (!isOpen) return null;

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
    <div className="fixed bottom-24 right-6 md:right-8 w-[350px] md:w-[420px] flex flex-col h-[600px] max-h-[80vh] bg-slate-900 border border-cyan-500/20 rounded-3xl overflow-hidden shadow-2xl shadow-cyan-500/10 z-50 animate-in slide-in-from-bottom-10">
      <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* CABEÇALHO */}
      <div className="p-4 border-b border-white/10 bg-slate-950 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">Quantum Advisor</h2>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Conexão Nuvem Segura (Grau Bancário)
            </div>
          </div>
        </div>
        {/* 🌟 BOTÃO DE FECHAR (Crucial para a UI flutuante) */}
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ÁREA DE MENSAGENS */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar z-10 bg-slate-900/50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 max-w-[90%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-cyan-500/20 text-cyan-400'}`}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`p-3.5 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-cyan-600 text-white rounded-tr-none shadow-md' 
                : 'bg-slate-800 border border-white/5 text-slate-200 rounded-tl-none prose prose-invert prose-p:leading-snug prose-li:my-0 max-w-none shadow-md'
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
          <div className="flex gap-3 max-w-[85%]">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-4 rounded-2xl bg-slate-800 border border-white/5 rounded-tl-none flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse delay-75"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse delay-150"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div className="p-4 border-t border-white/5 bg-slate-950 z-10">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre os seus gastos..."
            className="w-full bg-slate-900 border border-white/10 rounded-xl pl-4 pr-12 py-3.5 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-all placeholder:text-slate-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}