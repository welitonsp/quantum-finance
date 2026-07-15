import { useEffect, useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import {
  LayoutDashboard, Clock, Target, ShieldCheck, Settings, LogOut,
  BrainCircuit, ShoppingBag,
  PieChart, X, ChevronRight, Search,
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
  onOpenCommandPalette?: () => void;
}

const SIDEBAR_GROUPS_STORAGE_KEY = 'quantum_sidebar_groups';
const DEFAULT_OPEN = new Set(['Navegação']); // grupo único sempre aberto

/** Navegação final: 7 destinos principais (F-12 PR-C6) */
const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Navegação',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Hoje'            },
      { id: 'history',   icon: Clock,           label: 'Movimentações'   },
      { id: 'planning',  icon: Target,          label: 'Planejamento'    },
      { id: 'reports',   icon: PieChart,        label: 'Análises'        },
      { id: 'shopping',  icon: ShoppingBag,     label: 'Compras'         },
      { id: 'copilot',   icon: BrainCircuit,    label: 'IA'              },
      { id: 'cofre',     icon: ShieldCheck,     label: 'Governança'      },
    ],
  },
];

export default function Sidebar({
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  isSidebarCollapsed,
  setIsSettingsOpen,
  handleLogout,
  onOpenCommandPalette,
}: Props) {
  const { currentPage, setCurrentPage } = useNavigation();

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY);
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch { /* ignore */ }
    return new Set(DEFAULT_OPEN);
  });

  const toggleGroup = (title: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      try { localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  // Garante que o grupo do item ativo esteja aberto (não esconder a rota atual).
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find(g => g.items.some(item => item.id === currentPage));
    if (!activeGroup) return;
    setOpenGroups(prev => {
      if (prev.has(activeGroup.title)) return prev;
      const next = new Set(prev);
      next.add(activeGroup.title);
      try { localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, [currentPage]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMobileMenuOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobileMenuOpen, setIsMobileMenuOpen]);

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
          aria-hidden="true"
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

        {/* Busca ⌘K */}
        {!isSidebarCollapsed && onOpenCommandPalette && (
          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-quantum-fgMuted bg-quantum-bgSecondary/50 border border-quantum-border rounded-xl hover:border-quantum-accent/30 hover:text-quantum-fg transition-colors"
            >
              <Search className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 text-left">Buscar…</span>
              <kbd className="text-[10px] font-mono opacity-60">⌘K</kbd>
            </button>
          </div>
        )}

        {/* Grupos de navegação */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-3" aria-label="Módulos do sistema">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="px-4">
              {!isSidebarCollapsed && (
                <button
                  type="button"
                  aria-expanded={openGroups.has(group.title)}
                  aria-controls={`nav-group-${group.title}`}
                  onClick={() => toggleGroup(group.title)}
                  className="w-full flex items-center justify-between text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2 ml-2 pr-1 hover:text-quantum-fg transition-colors"
                >
                  <span>{group.title}</span>
                  <ChevronRight
                    className={`w-3 h-3 transition-transform duration-200 ${openGroups.has(group.title) ? 'rotate-90' : ''} motion-reduce:transition-none`}
                  />
                </button>
              )}
              <div
                id={!isSidebarCollapsed ? `nav-group-${group.title}` : undefined}
                className={`space-y-1 overflow-hidden transition-all duration-200 ease-in-out motion-reduce:transition-none ${
                  isSidebarCollapsed || openGroups.has(group.title) ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
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
