// src/components/AIAssistantChat.jsx
import { useState, useRef, useEffect } from "react";
import { BrainCircuit, Send, X, Loader2 } from "lucide-react";

export default function AIAssistantChat({ transactions, balances, isOpen, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Olá! Sou o **Quantum Assistant** 🧠\n\nTenho acesso aos seus dados financeiros deste mês. Como posso ajudar a otimizar os seus recursos hoje?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Prepara contexto financeiro para a IA (O Cérebro)
    const context = `
      Dados financeiros reais do usuário (mês atual):
      - Entradas Totais: R$ ${balances.entradas.toFixed(2)}
      - Saídas Totais: R$ ${balances.saidas.toFixed(2)}
      - Saldo Atual: R$ ${balances.saldoAtual.toFixed(2)}
      
      Últimas transações (máx 15):
      ${JSON.stringify(
        transactions.slice(0, 15).map((t) => ({
          tipo: t.type,
          valor: t.value,
          categoria: t.category || "Diversos",
          descrição: t.description || "N/A"
        }))
      )}
    `;

    try {
      // ATENÇÃO: Uso aceitável apenas em localhost. 
      // Em produção, isto deve ir para o Firebase Functions!
      const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
      
      if (!API_KEY) {
        throw new Error("Chave VITE_GEMINI_API_KEY não encontrada no ficheiro .env.local");
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Você é o Quantum Assistant, um conselheiro financeiro de elite, honesto e direto. 
                    Responda sempre em português de Portugal ou Brasil, com tom premium, analítico e amigável.
                    Use os dados financeiros reais do usuário abaixo para basear as suas respostas.
                    
                    ${context}
                    
                    Responda à mensagem do usuário de forma clara, objetiva e útil (use formatação markdown se necessário).`
                  },
                  { text: userMessage.content },
                ],
              },
            ],
          }),
        }
      );

      const data = await response.json();
      
      if (data.error) throw new Error(data.error.message);

      const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, os meus circuitos quânticos estão ocupados agora.";

      setMessages((prev) => [...prev, { role: "assistant", content: aiReply }]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Erro de conexão neural: ${error.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    // ESTRUTURA BLINDADA COM GLASSMORPHISM
    <div className="fixed bottom-24 right-6 w-[400px] h-[600px] glass-card-quantum flex flex-col overflow-hidden z-50 animate-in slide-in-from-bottom-10 fade-in duration-300 shadow-2xl shadow-indigo-500/20">
      
      {/* Header Quântico */}
      <div className="bg-slate-900/80 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full"></div>
        <div className="flex items-center gap-3 relative z-10">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg shadow-cyan-500/20">
            <BrainCircuit className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white tracking-widest uppercase">Quantum IA</h3>
            <p className="text-[10px] text-cyan-400 font-mono">Conselheiro Financeiro Ativo</p>
          </div>
        </div>
        <button onClick={onClose} className="hover:bg-red-500/20 text-slate-400 hover:text-red-400 p-2 rounded-xl transition-colors relative z-10">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Área de Mensagens */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-10">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-5 py-3.5 text-sm shadow-lg ${
                msg.role === "user"
                  ? "bg-gradient-to-r from-cyan-600 to-indigo-600 text-white rounded-2xl rounded-tr-sm"
                  : "bg-slate-800/80 border border-white/5 text-slate-200 rounded-2xl rounded-tl-sm"
              }`}
            >
              {/* Renderização simples de texto (num futuro podemos usar react-markdown) */}
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800/80 border border-white/5 px-5 py-3.5 rounded-2xl rounded-tl-sm flex items-center gap-3 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              A analisar dados...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10 bg-slate-900/90 relative z-10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Pergunte sobre os seus gastos..."
            className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-500"
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-cyan-500 text-white rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all shadow-lg shadow-indigo-500/20"
          >
            <Send className="w-5 h-5 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}