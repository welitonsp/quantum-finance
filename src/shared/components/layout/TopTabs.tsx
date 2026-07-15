export interface Tab {
  /** id de página (`currentPage`/NavigationContext) ou identificador de aba */
  id: string;
  label: string;
}

interface Props {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

/**
 * Primitivo de abas de topo para páginas-mãe (consolidação de navegação, F-12).
 * Agrupa features irmãs numa única área de conteúdo sem que nenhuma feature
 * morra — o `activeTab` continua sendo o valor de `currentPage`. Sem border-box,
 * fundo transparente; underline `quantum-accent` na aba ativa. Teclado: Arrow
 * Left/Right navega entre abas (`role="tablist"`/`role="tab"`/`aria-selected`).
 */
export function TopTabs({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-quantum-border mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(e) => {
            const idx = tabs.findIndex((t) => t.id === tab.id);
            if (e.key === 'ArrowRight') {
              const next = tabs[(idx + 1) % tabs.length];
              if (next) onTabChange(next.id);
            }
            if (e.key === 'ArrowLeft') {
              const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
              if (prev) onTabChange(prev.id);
            }
          }}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
            activeTab === tab.id
              ? 'border-quantum-accent text-quantum-fg'
              : 'border-transparent text-quantum-fgMuted hover:text-quantum-fg'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
