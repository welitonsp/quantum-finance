import type { ReactNode } from 'react';

interface Props {
  /** Navigation Rail / Sidebar (slot lateral) */
  sidebar: ReactNode;
  /** Topbar global (slot superior) */
  header: ReactNode;
  /** Conteúdo da página (o switch `currentPage`) */
  children: ReactNode;
  /** Slot opcional para navegação inferior no mobile (PR 6) */
  bottomNav?: ReactNode;
}

/**
 * AppShell — casca de navegação do app (PR 3 — UI/UX premium).
 *
 * Encapsula APENAS o wrapper estrutural (rail + topbar + área de conteúdo rolável),
 * preservando 100% do comportamento atual. Não introduz roteamento próprio: o
 * conteúdo continua sendo decidido pelo switch `currentPage`/`NavigationContext`
 * e é passado como `children`. Fundação para o MobileBottomNav (PR 6) via `bottomNav`.
 *
 * Mantém as mesmas classes do shell original para não alterar o layout.
 */
export function AppShell({ sidebar, header, children, bottomNav }: Props) {
  return (
    <div className="relative z-10 flex w-full h-full pointer-events-none">
      <div className="pointer-events-auto">{sidebar}</div>

      <div className="flex-1 flex flex-col w-full overflow-hidden pointer-events-auto bg-quantum-bg/80 backdrop-blur-sm">
        {header}

        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-12">
          {children}
        </main>

        {bottomNav}
      </div>
    </div>
  );
}
