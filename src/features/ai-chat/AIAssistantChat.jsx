import React, { useState, useEffect, useRef } from 'react';
import { X, Send, BrainCircuit, User, Loader2 } from 'lucide-react';
import { GeminiService } from './GeminiService'; 

export const AIAssistantChat = ({ transactions, balances, isOpen, onClose }) => {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Olá, Comandante Weliton! Sou a Quantum AI. O motor está blindado. Como posso ajudar com a sua estratégia financeira hoje?' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Autoscroll para a mensagem mais recente
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userText = inputMessage.trim();
    setInputMessage('');
    
    // Adicionar mensagem do utilizador à UI
    const newMessages = [...messages, { role: 'user', text: userText }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Formatação tática dos dados para a IA analisar
      const contextData = {
        balances,
        // Limita a 50 transações recentes para não sobrecarregar a memória da IA
        recentTransactions: transactions.slice(0, 50) 
      };

      // Chamada ao Motor da IA
      const aiResponse = await GeminiService.sendMessage(userText, newMessages, contextData);
      
      setMessages(prev => [...prev, { role: 'ai', text: aiResponse }]);
    } catch (error) {
      console.error("Erro no link de comunicação Quântico:", error);
      setMessages(prev => [...prev, { role: 'ai', text: '🚨 Interferência quântica detectada. Não foi possível processar a resposta. Verifique a chave da API no seu ficheiro .env.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 right-6 md:right-8 w-[90vw] md:w-[400px] h-[500px] bg-slate-900 border border-cyan-500/30 rounded-3xl shadow-2xl flex flex-col z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
      
      {/* ─── Cabeçalho ─── */}
      <div className="p-4 bg-slate-950 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 rounded-xl">
            <BrainCircuit className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-bold text-white leading-none">Quantum AI</h3>
            <span className="text-xs text-cyan-400 font-medium">Online e operacional</span>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ─── Janela de Conversa ─── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'user' ? 'bg-indigo-600 shadow-indigo-500/20' : 'bg-cyan-600 shadow-cyan-500/20'}`}>
              {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <BrainCircuit className="w-4 h-4 text-white" />}
            </div>
            <div className={`p-3 rounded-2xl max-w-[75%] text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none border border-white/5'}`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20">
              <BrainCircuit className="w-4 h-4 text-white" />
            </div>
            <div className="p-4 bg-slate-800 rounded-2xl rounded-tl-none border border-white/5 flex items-center">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Painel de Comando (Input) ─── */}
      <form onSubmit={handleSendMessage} className="p-4 bg-slate-950 border-t border-white/5 flex gap-2">
        <input 
          type="text" 
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Pergunte sobre as suas finanças..." 
          disabled={isLoading}
          className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
        />
        <button 
          type="submit" 
          disabled={isLoading || !inputMessage.trim()}
          className="p-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(8,145,178,0.3)]"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};