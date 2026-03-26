// src/components/CategorySettings.jsx
import { useState, useEffect } from "react";
import { X, Trash2, Plus, BrainCircuit } from "lucide-react";
import { FirestoreService } from "../services/FirestoreService";

export default function CategorySettings({ uid, onClose }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para criar uma nova regra
  const [newCategory, setNewCategory] = useState("");
  const [newKeywords, setNewKeywords] = useState("");

  useEffect(() => {
    loadRules();
  }, [uid]);

  const loadRules = async () => {
    if (!uid) return;
    setLoading(true);
    const data = await FirestoreService.getCategoryRules(uid);
    setRules(data);
    setLoading(false);
  };

  const handleAddRule = async () => {
    if (!newCategory || !newKeywords) return;
    
    // Transforma "uber, 99, cabify" num array limpo: ["uber", "99", "cabify"]
    const keywordsArray = newKeywords.split(",").map(k => k.trim()).filter(k => k !== "");
    
    await FirestoreService.addCategoryRule(uid, {
      category: newCategory,
      keywords: keywordsArray
    });
    
    setNewCategory("");
    setNewKeywords("");
    loadRules(); // Recarrega a lista
  };

  const handleDeleteRule = async (ruleId) => {
    await FirestoreService.deleteCategoryRule(uid, ruleId);
    loadRules();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-2xl max-h-[90vh] rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 text-indigo-400">
            <BrainCircuit className="w-8 h-8" />
            <h2 className="text-xl font-bold uppercase tracking-wider text-zinc-100">Cérebro de Categorização (IA)</h2>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <p className="text-sm text-zinc-400 mb-6">
          Ensine o sistema: Sempre que uma descrição do banco contiver uma das palavras-chave, o sistema irá aplicar a categoria correspondente automaticamente.
        </p>

        {/* Formulário de Nova Regra */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-bold text-zinc-500 uppercase">Categoria Final</label>
            <input 
              type="text" placeholder="Ex: Transporte" value={newCategory} onChange={e => setNewCategory(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none" 
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-bold text-zinc-500 uppercase">Palavras (Separadas por vírgula)</label>
            <input 
              type="text" placeholder="Ex: uber, 99app, cabify" value={newKeywords} onChange={e => setNewKeywords(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none" 
            />
          </div>
          <div className="flex items-end">
            <button onClick={handleAddRule} className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-500 transition-all h-[42px]">
              <Plus className="w-4 h-4" /> Adicionar
            </button>
          </div>
        </div>

        {/* Lista de Regras Atuais */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="text-center text-zinc-500 py-4">A carregar regras...</div>
          ) : rules.length === 0 ? (
            <div className="text-center text-zinc-500 py-8 border border-dashed border-zinc-800 rounded-2xl">
              Nenhuma regra de inteligência configurada.
            </div>
          ) : rules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div>
                <span className="font-bold text-emerald-400 text-sm uppercase">{rule.category}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {rule.keywords.map((kw, i) => (
                    <span key={i} className="px-2 py-1 bg-zinc-800 text-zinc-300 text-xs rounded-md border border-zinc-700">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={() => handleDeleteRule(rule.id)} className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all ml-4">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}