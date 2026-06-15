import { useNavigation } from '../contexts/NavigationContext';
import {
  LayoutDashboard, Clock, CalendarRange, CalendarDays, Target, Wallet, ShieldCheck, Settings, LogOut,
  Landmark, BrainCircuit, Repeat, CreditCard, TrendingDown, ShoppingBag,
  Receipt, ShieldAlert, Users, Cpu, FlaskConical, ShoppingCart,
  PieChart, X,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  id: string;
  icon: LucideIcon;
  label: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

interface Props {
  user: { uid: string; displayName?: string | null; photoURL?: string | null } | null;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  isSidebarCollapsed: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  handleLogout: () => void;
}

/** Navegação alinhada aos 8 módulos oficiais do Quantum Finance 2.0 */
const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Principal',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Centro de Comando'  },
      { id: 'history',   icon: Clock,           label: 'Movimentações'      },
      { id: 'timeline',  icon: CalendarRange,   label: 'Timeline Financeira'  },
      { id: 'calendar',  icon: CalendarDays,    label: 'Calendário Financeiro'},
    ],
  },
  {
    title: 'Planejamento',
    items: [
      { id: 'planning',   icon: Target,       label: 'Planejamento'          },
      { id: 'recurring',  icon: Repeat,       label: 'Despesas Fixas'        },
      { id: 'debts',      icon: TrendingDown, label: 'Dívidas'               },
      { id: 'simulation', icon: FlaskConical, label: 'Simulação Monte Carlo' },
    ],
  },
  {
    title: 'Patrimônio & Objetivos',
    items: [
      { id: 'patrimonio', icon: Wallet,     label: 'Patrimônio & Objetivos' },
      { id: 'accounts',   icon: Landmark,   label: 'Contas'                 },
      { id: 'cards',      icon: CreditCard, label: 'Cartões'                },
      { id: 'ir',         icon: Receipt,    label: 'Módulo IR'              },
    ],
  },
  {
    title: 'Compras & Comunidade',
    items: [
      { id: 'shopping',           icon: ShoppingBag,  label: 'Compras Inteligentes'    },
      { id: 'purchase-simulator', icon: ShoppingCart, label: 'Simulador de Compra'     },
      { id: 'shared-finance',     icon: Users,        label: 'Finanças Compartilhadas' },
    ],
  },
  {
    title: 'Copilot IA',
    items: [
      { id: 'copilot',     icon: BrainCircuit, label: 'Copilot IA'        },
      { id: 'quantum',     icon: Cpu,          label: 'Quantum AI'        },
      { id: 'anti-tarifa', icon: ShieldAlert,  label: 'Agente Anti-Tarifa'},
    ],
  },
  {
    title: 'Cofre & Governança',
    items: [
      { id: 'cofre',   icon: ShieldCheck, label: 'Cofre & Governança' },
      { id: 'reports', icon: PieChart,    label: 'BI & Relatórios'   },
    ],
  },
];

export default function Sidebar({
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  isSidebarCollapsed,
  setIsSettingsOpen,
  handleLogout,
}: Props) {
  const { currentPage, setCurrentPage } = useNavigation();

  const handleNavClick = (page: string) => {
    setCurrentPage(page);
    setIsMobileMenuOpen(false);
  };

  const sidebarClasses = `fixed md:static inset-y-0 left-0 z-50 transform ${
    isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
  } md:translate-x-0 transition-all duration-300 ease-in-out bg-quantum-card/95 md:bg-quantum-card/50 backdrop-blur-xl border-r border-quantum-border flex flex-col ${
    isSidebarCollapsed ? 'w-20' : 'w-64'
  }`;

  return (
    <>
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={sidebarClasses} aria-label="Navegação principal">
        {/* Logo */}
        <div className={`p-6 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <BrainCircuit className="w-5 h-5 text-quantum-fg" />
              </div>
              <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-cyan-200 tracking-tight">
                Quantum
              </span>
            </div>
          )}
          {isSidebarCollapsed && (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-400 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-quantum-fg" />
            </div>
          )}
          <button
            className="md:hidden text-quantum-fgMuted"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Grupos de navegação */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-5" aria-label="Módulos do sistema">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="px-4">
              {!isSidebarCollapsed && (
                <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2 ml-2">
                  {group.title}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      title={isSidebarCollapsed ? item.label : undefined}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center ${
                        isSidebarCollapsed ? 'justify-center px-0' : 'px-4'
                      } py-2.5 rounded-xl transition-all duration-200 group ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500/10 to-cyan-400/5 text-cyan-400 border border-cyan-500/20 shadow-sm'
                          : 'text-quantum-fgMuted hover:bg-white/5 hover:text-quantum-fg border border-transparent'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 flex-shrink-0 ${isSidebarCollapsed ? '' : 'mr-3'} ${
                          isActive ? '' : 'group-hover:scale-110 transition-transform'
                        }`}
                      />
                      {!isSidebarCollapsed && (
                        <span className="font-semibold text-sm tracking-wide truncate">{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Rodapé */}
        <div className="p-4 border-t border-quantum-border space-y-1">
          <button
            onClick={() => setIsSettingsOpen(true)}
            title={isSidebarCollapsed ? 'Configurações' : undefined}
            aria-label="Configurações"
            className={`w-full flex items-center ${
              isSidebarCollapsed ? 'justify-center px-0' : 'px-4'
            } py-2.5 text-quantum-fgMuted hover:bg-white/5 hover:text-quantum-fg rounded-xl transition-colors border border-transparent`}
          >
            <Settings className={`w-4 h-4 flex-shrink-0 ${isSidebarCollapsed ? '' : 'mr-3'}`} />
            {!isSidebarCollapsed && <span className="font-semibold text-sm">Configurações</span>}
          </button>

          <button
            onClick={handleLogout}
            title={isSidebarCollapsed ? 'Sair' : undefined}
            aria-label="Sair do sistema"
            className={`w-full flex items-center ${
              isSidebarCollapsed ? 'justify-center px-0' : 'px-4'
            } py-2.5 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent`}
          >
            <LogOut className={`w-4 h-4 flex-shrink-0 ${isSidebarCollapsed ? '' : 'mr-3'}`} />
            {!isSidebarCollapsed && <span className="font-semibold text-sm">Sair</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
