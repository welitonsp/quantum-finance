// src/components/Header.jsx
import { Menu, ChevronLeft, ChevronRight, Sun, Moon, Plus, Eye, EyeOff } from "lucide-react";
import ImportButton from "./ImportButton";
import { usePrivacy } from "../contexts/PrivacyContext";

export default function Header({
  currentPage,
  currentMonth,
  currentYear,
  handlePrevMonth,
  handleNextMonth,
  nomeMeses,
  theme,
  toggleTheme,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  setIsMobileMenuOpen,
  isFormOpen,
  setIsFormOpen,
  user,
  transactions,
  handleImport
}) {
  const { isPrivacyMode, togglePrivacy } = usePrivacy();

  return (
    <header className="h-24 border-b border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-950/30 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 flex-shrink-0 transition-all z-40 relative">
      <div className="flex items-center gap-4">
        <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-800 dark:text-white">
          <Menu className="w-6 h-6" />
        </button>
        
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
          className="hidden lg:flex p-2 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-white/5 transition-colors shadow-sm dark:shadow-none"
          title={isSidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
        >
          <Menu className="w-5 h-5" />
        </button>

        <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white tracking-wide hidden sm:block">
          {currentPage === 'dashboard' ? 'Painel Central' : 'Relatórios Analíticos'}
        </h2>
      </div>

      <div className="flex items-center gap-1 md:gap-2 bg-white dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-inner">
         <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl text-slate-500 dark:text-slate-300 transition-colors">
           <ChevronLeft className="w-4 md:w-5 h-4 md:h-5" />
         </button>
         
         <div className="flex flex-col items-center justify-center w-28 md:w-40">
           {/* ✅ CORREÇÃO AQUI: Programação Defensiva */}
           <span className="text-xs md:text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">
             {nomeMeses && currentMonth ? nomeMeses[currentMonth - 1] : 'MÊS'}
           </span>
           <span className="text-[10px] md:text-xs font-mono text-indigo-600 dark:text-cyan-400">
             {currentYear || new Date().getFullYear()}
           </span>
         </div>
         
         <button onClick={handleNextMonth} className="p-2 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl text-slate-500 dark:text-slate-300 transition-colors">
           <ChevronRight className="w-4 md:w-5 h-4 md:h-5" />
         </button>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* BOTÃO MODO PRIVACIDADE */}
        <button 
          onClick={togglePrivacy} 
          className={`p-3 rounded-xl border transition-all shadow-sm dark:shadow-none ${isPrivacyMode ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30' : 'bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5'}`}
          title="Modo Privacidade (Alt + P)"
        >
          {isPrivacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>

        <button 
          onClick={toggleTheme} 
          className="p-3 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-cyan-400 border border-slate-200 dark:border-white/5 transition-all shadow-sm dark:shadow-none"
          title={theme === 'dark' ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {currentPage === 'dashboard' && (
          <>
            <div className="hidden xl:block">
              <ImportButton onImportTransactions={handleImport} uid={user?.uid} existingTransactions={transactions} />
            </div>
            <button 
              onClick={() => setIsFormOpen(!isFormOpen)} 
              className="px-4 py-2.5 md:px-6 md:py-3.5 bg-gradient-to-r from-indigo-600 to-cyan-500 text-white rounded-2xl flex items-center text-xs md:text-sm font-bold shadow-lg shadow-indigo-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all"
              title="Nova Transação (Alt + N)"
            >
              <Plus className="w-4 h-4 md:w-5 md:h-5 md:mr-2" /> <span className="hidden md:inline">Nova Transação</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}