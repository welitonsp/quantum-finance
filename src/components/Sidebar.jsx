import { Wallet, LayoutDashboard, PieChart, Settings, LogOut } from "lucide-react";

export default function Sidebar({ 
  user, 
  currentPage, 
  setCurrentPage, 
  isMobileMenuOpen, 
  setIsMobileMenuOpen, 
  isSidebarCollapsed, 
  setIsSettingsOpen, 
  handleLogout 
}) {
  return (
    <>
      {/* Backdrop para Mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}
      
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-2xl border-r border-slate-200 dark:border-white/5 flex flex-col transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'} ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-72'}`}>
        
        {/* Logo Area */}
        <div className={`h-24 flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-8'} gap-4 border-b border-slate-200 dark:border-white/5 transition-all duration-300`}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          {!isSidebarCollapsed && (
            <div className="animate-in fade-in duration-300 whitespace-nowrap overflow-hidden">
              <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-wide uppercase leading-tight">Quantum<br/><span className="text-indigo-600 dark:text-cyan-400">Finance</span></h1>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-8 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
          <div className="px-4">
            {!isSidebarCollapsed ? (
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 animate-in fade-in">Menu Principal</p>
            ) : (
              <div className="w-full h-px bg-slate-200 dark:bg-white/10 my-4"></div>
            )}
            
            <button onClick={() => { setCurrentPage('dashboard'); setIsMobileMenuOpen(false); }} title="Painel Central" className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-4 gap-4'} py-3.5 rounded-xl font-bold transition-all ${currentPage === 'dashboard' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shadow-inner' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'}`}>
              <LayoutDashboard className="w-5 h-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span className="animate-in fade-in duration-300 whitespace-nowrap">Painel Central</span>}
            </button>
            
            <button onClick={() => { setCurrentPage('reports'); setIsMobileMenuOpen(false); }} title="Relatórios Analíticos" className={`mt-2 w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-4 gap-4'} py-3.5 rounded-xl font-bold transition-all ${currentPage === 'reports' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shadow-inner' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'}`}>
              <PieChart className="w-5 h-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span className="animate-in fade-in duration-300 whitespace-nowrap">Relatórios</span>}
            </button>
          </div>

          <div className="px-4 mt-8">
            {!isSidebarCollapsed ? (
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 animate-in fade-in">Inteligência & Regras</p>
            ) : (
              <div className="w-full h-px bg-slate-200 dark:bg-white/10 my-6"></div>
            )}
            
            <button onClick={() => { setIsSettingsOpen(true); setIsMobileMenuOpen(false); }} title="Motor de Automação" className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-4 gap-4'} py-3.5 rounded-xl font-bold text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-cyan-500/10 hover:text-indigo-600 dark:hover:text-cyan-400 transition-all`}>
              <Settings className="w-5 h-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span className="animate-in fade-in duration-300 whitespace-nowrap">Motor de Automação</span>}
            </button>
          </div>
        </nav>

        {/* User Footer Responsivo */}
        <div className="p-4 border-t border-slate-200 dark:border-white/5">
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center flex-col gap-3' : 'justify-between'} bg-slate-50 dark:bg-slate-900/50 p-2 rounded-2xl border border-slate-200 dark:border-white/5 transition-all`}>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-200 dark:border-indigo-500/30 flex-shrink-0" title={user?.displayName}>
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              {!isSidebarCollapsed && (
                <div className="truncate animate-in fade-in duration-300">
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{user?.displayName || 'Usuário'}</p>
                  <p className="text-xs text-slate-500 truncate">Sessão Ativa</p>
                </div>
              )}
            </div>

            {!isSidebarCollapsed ? (
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all flex-shrink-0" title="Sair do Sistema">
                <LogOut className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={handleLogout} className="w-full flex justify-center p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all" title="Sair do Sistema">
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}