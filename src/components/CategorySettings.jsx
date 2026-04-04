// src/components/CategorySettings.jsx
import { useState, useEffect } from "react";
import { X, Plus, Trash2, Settings, Tag, Search, Loader2, ArrowRight } from "lucide-react";
import { collection, query, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../shared/api/firebase"; 
import toast from "react-hot-toast";

export default function CategorySettings({ uid, onClose }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!uid) return;

    const q = query(collection(db, "users", uid, "categoryRules"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      data.sort((a, b) => a.keyword.localeCompare(b.keyword));
      
      setRules(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  // ✅ CORREÇÃO: Early return para garantir que o componente não renderiza sem o UID validado
  if (!uid) return null;

  const handleSaveRule = async (e) => {
    e.preventDefault();
    if (!keyword.trim() || !category) {
      toast.error("Preencha a palavra-chave e selecione uma categoria!");
      return;
    }

    setIsSaving(true);
    try {
      const rulesRef = collection(db, "users", uid, "categoryRules");
      await addDoc(rulesRef, {
        keyword: keyword.trim().toLowerCase(),
        category
      });
      
      toast.success("Regra Quântica ativada!");
      setKeyword("");
      setCategory("");
    } catch (error) {
      console.error("Erro ao salvar regra:", error);
      toast.error("Interferência ao salvar regra.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await deleteDoc(doc(db, "users", uid, "categoryRules", ruleId));
      toast.success("Regra desativada.");
    } catch (error) {
      console.error("Erro ao apagar regra:", error);
      toast.error("Falha ao apagar.");
    }
  };

  const categoriasDisponiveis = [
    "Alimentação", "Transporte", "Assinaturas", "Educação", 
    "Saúde", "Moradia", "Impostos/Taxas", "Lazer", 
    "Vestuário", "Salário", "Freelance", "Investimento", "Diversos"
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-quantum-card w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-quantum-border zoom-in-95 flex flex-col max-h-[90vh]">
        
        <div className="flex items-center justify-between p-6 border-b border-quantum-border/50 bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/20">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Motor de Categorização</h2>
              <p className="text-sm text-quantum-fgMuted font-medium mt-1">Regras automáticas para novas movimentações</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-quantum-fgMuted hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
          
          <div className="bg-slate-900/30 rounded-2xl p-5 border border-white/5">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" /> Nova Regra
            </h3>
            
            <form onSubmit={handleSaveRule} className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Tag className="w-4 h-4 text-slate-500" />
                </div>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Ex: uber, ifood, netflix..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                />
              </div>
              
              <div className="md:col-span-4">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                >
                  <option value="" className="text-slate-500">Selecionar Categoria...</option>
                  {categoriasDisponiveis.map(cat => (
                    <option key={cat} value={cat} className="bg-slate-900 text-white">{cat}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full h-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors py-3 md:py-0"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Search className="w-4 h-4 text-cyan-400" /> Regras Ativas ({rules.length})
              </h3>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
                <p className="text-sm font-bold animate-pulse">A ler Cérebro Quântico...</p>
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                <Tag className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-400">Nenhuma regra definida.</p>
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
    </div>
  );
}