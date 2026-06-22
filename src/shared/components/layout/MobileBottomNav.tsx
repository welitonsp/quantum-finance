import { LayoutDashboard, Clock, Target, BrainCircuit, Menu } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface MobileNavItem {
  /** id de página (`currentPage`/NavigationContext) */
  id: string;
  label: string;
  icon: LucideIcon;
}

interface Props {
  currentPage: string;
  onNavigate: (page: string) => void;
  /** Abre o menu completo (Sidebar mobile) — item "Mais" */
  onOpenMenu: () => void;
  /** Itens principais (default: 4 atalhos essenciais) */
  items?: MobileNavItem[];
}

const DEFAULT_ITEMS: MobileNavItem[] = [
  { id: 'dashboard', label: 'Hoje',         icon: LayoutDashboard },
  { id: 'history',   label: 'Movimentações', icon: Clock },
  { id: 'planning',  label: 'Planejar',     icon: Target },
  { id: 'copilot',   label: 'IA',           icon: BrainCircuit },
];

/**
 * Navegação inferior do mobile (PR 6 — UI/UX premium). Renderizada no slot
 * `bottomNav` do AppShell, fixa na base e visível só no mobile (`lg:hidden`).
 * Reusa o roteamento por `currentPage` (sem react-router). Inclui o item "Mais"
 * que abre o menu completo (Sidebar mobile). Acessível: `<nav>` + `aria-current`.
 */
export function MobileBottomNav({ currentPage, onNavigate, onOpenMenu, items = DEFAULT_ITEMS }: Props) {
  const cell =
    'flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 ' +
    'text-[10px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-quantum-accent/50 rounded-lg';

  return (
    <nav
      aria-label="Navegação principal"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch gap-1 px-2 pb-[env(safe-area-inset-bottom)] bg-quantum-card/95 backdrop-blur-xl border-t border-quantum-border"
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = currentPage === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={active ? 'page' : undefined}
            className={`${cell} ${active ? 'text-quantum-accent' : 'text-quantum-fgMuted hover:text-quantum-fg'}`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">{label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        className={`${cell} text-quantum-fgMuted hover:text-quantum-fg`}
        aria-label="Abrir menu completo"
      >
        <Menu className="w-5 h-5 shrink-0" />
        <span>Mais</span>
      </button>
    </nav>
  );
}
