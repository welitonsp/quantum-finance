// src/components/CategorySettings.jsx
import { useState, useEffect } from "react";
import { X, Plus, Trash2, Settings, Tag, Search, Loader2, ArrowRight } from "lucide-react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase"; // Certifique-se de que o caminho para o firebase está correto
import toast from "react-hot-toast";

export default function CategorySettings({ uid, onClose }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados do Formulário
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Busca as regras em tempo real no Firebase
  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "categoryRules"),
      where("uid", "==", uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordena por ordem alfabética da palavra-chave
      data.sort((a, b) => a.keyword.localeCompare(b.keyword));
      
      setRules(data);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar regras:", error);
      toast.error("Falha ao sincronizar o Motor de Regras.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  // Função para salvar uma nova regra
  const handleAddRule = async (e) => {
    e.preventDefault();
    if (!keyword.trim() || !category.trim()) {
      toast.error("Preencha a palavra-chave e a categoria.");
      return;
    }

    setIsSaving(true);
    try {
      await addDoc(collection(db, "categoryRules"), {
        uid,
        keyword: keyword.toUpperCase().trim(),
        category: category.trim(),
        createdAt: new Date().toISOString()
      });
      
      setKeyword("");
      setCategory("");
      toast.success("Regra Quântica ativada com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar a regra.");
    } finally {
      setIsSaving(false);
    }
  };

  // Função para apagar uma regra
  const handleDeleteRule = async (id) => {
    try {
      await deleteDoc(doc(db, "categoryRules", id));
      toast.success("Regra eliminada da memória.");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao eliminar a regra.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Fundo Desfocado (Backdrop) */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity animate-in fade-in"
        onClick={onClose}
      ></div>
      
      {/* Modal Principal */}
      <div className="glass-card-quantum w-full max-w-2xl relative z-10 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 shadow-2xl shadow-indigo-500/20 border-t-4 border-t-indigo-500">
        
        {/* Efeito de Luz Interna */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none"></div>

        {/* Cabeçalho */}
        <div className="flex justify-between items-start p-6 border-b border-white/10 bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-2xl shadow-lg shadow-cyan-500/20">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide uppercase">Motor de Automação</h2>
              <p className="text-xs text-slate-400 mt-1">Ensine a IA a classificar as suas transações de forma automática.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário de Nova Regra */}
        <div className="p-6 bg-slate-950/50 border-b border-white/10">
          <form onSubmit={handleAddRule} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Se contiver o texto:</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-500" />
                </div>
                <input 
                  type="text" 
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Ex: UBER, IFOOD, NETFLIX..." 
                  className="w-full bg-slate-900/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all uppercase"
                />
              </div>
            </div>

            <div className="flex-1 w-full space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Categorizar como:</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Tag className="h-4 w-4 text-slate-500" />
                </div>
                <input 
                  type="text" 
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ex: Transporte, Alimentação..." 
                  className="w-full bg-slate-900/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isSaving}
              className="w-full md:w-auto px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Gravar
            </button>
          </form>
        </div>

        {/* Lista de Regras Ativas */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-900/30">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Regras em Operação ({rules.length})</h3>
          
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-2xl">
              <Settings className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">O motor está vazio.</p>
              <p className="text-xs text-slate-500 mt-1">Crie a sua primeira regra acima.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rules.map((rule) => (
                <div key={rule.id} className="group bg-slate-950/50 border border-white/5 hover:border-indigo-500/30 rounded-xl p-3 flex items-center justify-between transition-all hover:bg-slate-900/80">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold font-mono rounded-lg border border-indigo-500/20 truncate max-w-[100px]">
                      {rule.keyword}
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                    <span className="text-sm font-bold text-slate-300 truncate">
                      {rule.category}
                    </span>
                  </div>
                  <button 
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    title="Apagar Regra"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}