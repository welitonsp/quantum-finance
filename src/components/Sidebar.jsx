import React from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import {
  LayoutDashboard, PieChart, Settings, LogOut,
  Landmark, BrainCircuit, Repeat, Clock, X, CreditCard, FlaskConical
} from "lucide-react";

export default function Sidebar({ user, isMobileMenuOpen, setIsMobileMenuOpen, isSidebarCollapsed, setIsSettingsOpen, handleLogout }) {
  const { currentPage, setCurrentPage } = useNavigation();

  const handleNavClick = (page) => {
    setCurrentPage(page);
    setIsMobileMenuOpen(false);
  };

  const navGroups = [
    {
      title: "Visão Principal",
      items: [
        { id: 'dashboard',   icon: LayoutDashboard, label: 'Dashboard'            },
        { id: 'reports',     icon: PieChart,        label: 'BI & Relatórios'      },
        { id: 'quantum',     icon: BrainCircuit,    label: 'Quantum AI'           },
        { id: 'simulation',  icon: FlaskConical,    label: 'Monte Carlo'          },
      ]
    },
    {
      title: "Cofre Quântico",
      items: [
        { id: 'accounts',  icon: Landmark,    label: 'Minhas Contas'    },
        { id: 'cards',     icon: CreditCard,  label: 'Cartões de Crédito' },
        { id: 'history',   icon: Clock,       label: 'Movimentações'    },
        { id: 'recurring', icon: Repeat,      label: 'Despesas Fixas'   },
      ]
    }
  ];

  const sidebarClasses = `fixed md:static inset-y-0 left-0 z-50 transform ${
    isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
  } md:translate-x-0 transition-all duration-300 ease-in-out bg-slate-900/95 md:bg-slate-900/50 backdrop-blur-xl border-r border-white/5 flex flex-col ${
    isSidebarCollapsed ? "w-20" : "w-64"
  }`;

  return (
    <>
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={sidebarClasses}>
        <div className={`p-6 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <BrainCircuit className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-cyan-200 tracking-tight">
                Quantum
              </span>
            </div>
          )}
          {isSidebarCollapsed && (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-400 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
          )}
          <button className="md:hidden text-slate-400" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-6">
          {navGroups.map((group, index) => (
            <div key={index} className="px-4">
              {!isSidebarCollapsed && (
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-2">{group.title}</p>
              )}
              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      title={isSidebarCollapsed ? item.label : ""}
                      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'px-4'} py-3 rounded-xl transition-all duration-200 group ${
                        isActive 
                          ? 'bg-gradient-to-r from-cyan-500/10 to-cyan-400/5 text-cyan-400 border border-cyan-500/20 shadow-sm' 
                          : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isSidebarCollapsed ? '' : 'mr-3'} ${isActive ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'}`} />
                      {!isSidebarCollapsed && <span className="font-bold text-sm tracking-wide">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/5 space-y-2">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            title={isSidebarCollapsed ? "Configurações" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'px-4'} py-3 text-slate-400 hover:bg-white/5 hover:text-white rounded-xl transition-colors border border-transparent`}
          >
            <Settings className={`w-5 h-5 ${isSidebarCollapsed ? '' : 'mr-3'}`} />
            {!isSidebarCollapsed && <span className="font-bold text-sm">Configurações</span>}
          </button>
          
          <button 
            onClick={handleLogout}
            title={isSidebarCollapsed ? "Sair" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'px-4'} py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent`}
          >
            <LogOut className={`w-5 h-5 ${isSidebarCollapsed ? '' : 'mr-3'}`} />
            {!isSidebarCollapsed && <span className="font-bold text-sm">Sair do Sistema</span>}
          </button>
        </div>
      </aside>
    </>
  );
}