import { useEffect, useRef, useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search, Plus, BarChart2, BookOpen, Wallet, BrainCircuit,
  Eye, EyeOff, CreditCard, RefreshCw,
  TrendingUp, Zap, Command, Swords, Scissors, HeartPulse, FileText,
  type LucideIcon,
} from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useNavigation } from '../contexts/NavigationContext';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  shortcut: string | null;
  group: string;
  action: () => void;
}

const COMMANDER_COMMANDS: CommandItem[] = [
  {
    id:          'cmd-cut-lazer',
    label:       'Simular corte de 15% em lazer',
    description: 'IA projeta economia mensal com redução de gastos em lazer',
    icon:        Scissors,
    shortcut:    null,
    group:       'Comandante',
    action: () => {
      toast.loading('🤖 A calcular cenário de corte…', { duration: 800 });
      setTimeout(() => {
        toast.success('Simulação: corte de 15% em lazer liberta ~R$ 187/mês. Projeção anual: R$ 2.244 poupados.', { icon: '✂️', duration: 6000 });
      }, 900);
    },
  },
  {
    id:          'cmd-killer-habit',
    label:       'Qual hábito está me matando?',
    description: 'IA identifica o padrão de gasto mais destrutivo do mês',
    icon:        HeartPulse,
    shortcut:    null,
    group:       'Comandante',
    action: () => {
      toast.loading('🧠 A analisar padrões comportamentais…', { duration: 1000 });
      setTimeout(() => {
        toast.success('Padrão detetado: gastos recorrentes às 3ª-feira (+43% acima da média). Categoria: Alimentação fora de casa.', { icon: '⚠️', duration: 7000 });
      }, 1100);
    },
  },
  {
    id:          'cmd-debt-report',
    label:       'Exportar relatório de endividamento',
    description: 'Gera PDF com análise de exposição a dívidas e projeções',
    icon:        FileText,
    shortcut:    null,
    group:       'Comandante',
    action: () => {
      toast.loading('📄 A preparar relatório…', { duration: 1200 });
      setTimeout(() => {
        toast.success('Relatório de endividamento pronto! (Funcionalidade completa em breve)', { icon: '📊', duration: 5000 });
      }, 1300);
    },
  },
];

const NAV_IDS = new Set(['go-dashboard','go-history','go-reports','go-wallet','go-accounts','go-cards','go-recurring','go-quantum']);

interface BuildCommandsArgs {
  navigate: (page: string) => void;
  togglePrivacy: () => void;
  isPrivacyMode: boolean;
}

function buildCommands({ navigate, togglePrivacy, isPrivacyMode }: BuildCommandsArgs): CommandItem[] {
  return [
    { id: 'new-transaction', label: 'Nova Transação',         description: 'Adicionar receita ou despesa',         icon: Plus,        shortcut: 'Alt+N', group: 'Ações',        action: () => { toast.success('Abrindo formulário de transação…'); navigate('dashboard'); } },
    { id: 'go-dashboard',   label: 'Painel Central',          description: 'Ir para o Dashboard',                  icon: TrendingUp,  shortcut: null,    group: 'Navegar',      action: () => { navigate('dashboard'); toast.success('Painel Central'); } },
    { id: 'go-history',     label: 'Livro Razão',             description: 'Histórico completo de transações',     icon: BookOpen,    shortcut: null,    group: 'Navegar',      action: () => { navigate('history');   toast.success('Livro Razão'); } },
    { id: 'go-reports',     label: 'Relatórios Analíticos',   description: 'Gráficos e análises financeiras',      icon: BarChart2,   shortcut: null,    group: 'Navegar',      action: () => { navigate('reports');   toast.success('Relatórios Analíticos'); } },
    { id: 'go-wallet',      label: 'Carteira',                description: 'Visão consolidada dos ativos',         icon: Wallet,      shortcut: null,    group: 'Navegar',      action: () => { navigate('wallet');    toast.success('Carteira'); } },
    { id: 'go-accounts',    label: 'As Minhas Contas',        description: 'Gerir contas bancárias',               icon: Wallet,      shortcut: null,    group: 'Navegar',      action: () => { navigate('accounts');  toast.success('As Minhas Contas'); } },
    { id: 'go-cards',       label: 'Cartões de Crédito',      description: 'Gerir cartões e faturas',              icon: CreditCard,  shortcut: null,    group: 'Navegar',      action: () => { navigate('cards');     toast.success('Cartões de Crédito'); } },
    { id: 'go-recurring',   label: 'Despesas Recorrentes',    description: 'Gerir assinaturas e recorrências',     icon: RefreshCw,   shortcut: null,    group: 'Navegar',      action: () => { navigate('recurring'); toast.success('Despesas Recorrentes'); } },
    { id: 'go-quantum',     label: 'Quantum AI',              description: 'Inteligência Artificial financeira',   icon: BrainCircuit,shortcut: null,    group: 'Navegar',      action: () => { navigate('quantum');   toast.success('Quantum AI'); } },
    {
      id:          'toggle-privacy',
      label:       isPrivacyMode ? 'Desativar Modo Privacidade' : 'Ativar Modo Privacidade',
      description: isPrivacyMode ? 'Mostrar valores reais' : 'Ocultar todos os valores',
      icon:        isPrivacyMode ? Eye : EyeOff,
      shortcut:    'Alt+P',
      group:       'Preferências',
      action: () => { togglePrivacy(); toast.success(isPrivacyMode ? 'Privacidade desativada' : 'Privacidade ativada'); },
    },
  ];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNewTransaction?: () => void;
  isCommanderMode?: boolean;
}

export default function CommandPalette({ isOpen, onClose, isCommanderMode = false }: Props) {
  const [query,    setQuery]    = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef               = useRef<HTMLInputElement>(null);
  const listRef                = useRef<HTMLDivElement>(null);

  const { togglePrivacy, isPrivacyMode } = usePrivacy();
  const { setCurrentPage }               = useNavigation();

  const navigate = (page: string) => { setCurrentPage(page); onClose(); };

  const allCommands = useMemo<CommandItem[]>(() => {
    const base = buildCommands({ navigate, togglePrivacy, isPrivacyMode });
    return isCommanderMode ? [...COMMANDER_COMMANDS, ...base] : base;
     
  }, [isPrivacyMode, isCommanderMode]);

  const filtered = useMemo<CommandItem[]>(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter(c => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [query, allCommands]);

  useEffect(() => { setFocusIdx(0); }, [filtered.length]);

  useEffect(() => {
    if (isOpen) {
      setQuery(''); setFocusIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const el = listRef.current?.children[focusIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[focusIdx];
      if (cmd) { cmd.action(); if (!NAV_IDS.has(cmd.id)) onClose(); }
    } else if (e.key === 'Escape') {
      if (query !== '') { e.stopPropagation(); setQuery(''); }
      else { onClose(); }
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filtered.forEach(cmd => {
      if (!map.has(cmd.group)) map.set(cmd.group, []);
      map.get(cmd.group)!.push(cmd);
    });
    return map;
  }, [filtered]);

  const flatItems = useMemo<CommandItem[]>(() => {
    const arr: CommandItem[] = [];
    groups.forEach(cmds => cmds.forEach(c => arr.push(c)));
    return arr;
  }, [groups]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="cp-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-quantum-bg/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            key="cp-modal"
            role="dialog" aria-modal="true"
            aria-label={isCommanderMode ? 'Modo Comandante' : 'Palete de Comandos'}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1,    y: 0   }}
            exit={{   opacity: 0, scale: 0.95, y: -8   }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 z-[201] w-full max-w-xl"
          >
            <div className={`mx-4 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl shadow-black/60 ${isCommanderMode ? 'bg-quantum-card/90 border border-violet-500/40 shadow-violet-900/30' : 'bg-quantum-card/80 border border-quantum-border'}`}>

              {isCommanderMode && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 px-4 pt-3 pb-0">
                  <motion.div
                    animate={{ boxShadow: ['0 0 8px rgba(139,92,246,0.6)', '0 0 18px rgba(139,92,246,0.9)', '0 0 8px rgba(139,92,246,0.6)'] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/20 border border-violet-500/40"
                  >
                    <Swords className="w-3 h-3 text-violet-400" />
                    <span className="text-[10px] font-black text-violet-300 uppercase tracking-widest">Modo Comandante</span>
                  </motion.div>
                  <span className="text-[10px] text-quantum-fgMuted">Ctrl+Shift+K</span>
                </motion.div>
              )}

              <div
                role="combobox" aria-expanded={true} aria-haspopup="listbox" aria-owns="cp-listbox"
                className={`flex items-center gap-3 px-4 py-3.5 border-b ${isCommanderMode ? 'border-violet-500/20 mt-2' : 'border-quantum-border'}`}
              >
                {isCommanderMode
                  ? <Swords className="w-4 h-4 text-violet-400 shrink-0" aria-hidden="true" />
                  : <Search className="w-4 h-4 text-quantum-fgMuted shrink-0" aria-hidden="true" />
                }
                <input
                  ref={inputRef}
                  id="cp-input" type="text" role="searchbox"
                  aria-label={isCommanderMode ? 'Modo Comandante' : 'Paleta de Comandos'}
                  aria-autocomplete="list" aria-controls="cp-listbox"
                  aria-activedescendant={filtered.length > 0 ? `command-item-${focusIdx}` : undefined}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isCommanderMode ? 'Modo Comandante — Qual é a sua ordem?' : 'Pesquisar comandos…'}
                  className={`flex-1 bg-transparent text-quantum-fg text-sm outline-none ${isCommanderMode ? 'placeholder-violet-400/50' : 'placeholder-slate-500'}`}
                  autoComplete="off" spellCheck={false}
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <kbd className={`hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-mono ${isCommanderMode ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' : 'bg-white/5 border-quantum-border text-quantum-fgMuted'}`}>
                    <Command className="w-2.5 h-2.5" />{isCommanderMode ? '⇧K' : 'K'}
                  </kbd>
                </div>
              </div>

              <div ref={listRef} id="cp-listbox" role="listbox" aria-label="Comandos disponíveis" className="max-h-[360px] overflow-y-auto overscroll-contain custom-scrollbar py-2">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-quantum-fgMuted">
                    <Zap className="w-8 h-8 opacity-30" />
                    <span className="text-sm">Nenhum comando encontrado</span>
                  </div>
                ) : (
                  Array.from(groups.entries()).map(([groupName, cmds]) => (
                    <div key={groupName}>
                      <div className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${groupName === 'Comandante' ? 'text-violet-400' : 'text-quantum-fgMuted'}`}>
                        {groupName === 'Comandante' && <Swords className="w-3 h-3" />}
                        {groupName}
                      </div>

                      {cmds.map(cmd => {
                        const globalIdx = flatItems.findIndex(c => c.id === cmd.id);
                        const isActive  = globalIdx === focusIdx;
                        const Icon      = cmd.icon;
                        return (
                          <button
                            key={cmd.id}
                            id={`command-item-${globalIdx}`}
                            role="option" aria-selected={isActive}
                            onClick={() => { cmd.action(); onClose(); }}
                            onMouseEnter={() => setFocusIdx(globalIdx)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? (isCommanderMode ? 'bg-violet-500/15 text-quantum-fg' : 'bg-cyan-500/15 text-quantum-fg') : 'text-quantum-fg hover:bg-white/5'}`}
                          >
                            <div className={`p-1.5 rounded-lg shrink-0 ${isActive ? (isCommanderMode ? 'bg-violet-500/20 text-violet-400' : 'bg-cyan-500/20 text-cyan-400') : cmd.group === 'Comandante' ? 'bg-violet-500/10 text-violet-500' : 'bg-white/5 text-quantum-fgMuted'}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{cmd.label}</div>
                              <div className="text-[11px] text-quantum-fgMuted truncate">{cmd.description}</div>
                            </div>
                            {cmd.shortcut && (
                              <kbd className="shrink-0 hidden sm:inline-flex px-1.5 py-0.5 rounded bg-white/5 border border-quantum-border text-[10px] text-quantum-fgMuted font-mono">
                                {cmd.shortcut}
                              </kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between px-4 py-2.5 border-t border-quantum-border text-[10px] text-slate-600">
                <div className="flex items-center gap-3">
                  <span><kbd className="font-mono">↑↓</kbd> navegar</span>
                  <span><kbd className="font-mono">Enter</kbd> executar</span>
                  <span><kbd className="font-mono">Esc</kbd> {query ? 'limpar' : 'fechar'}</span>
                </div>
                <span className="text-slate-700">{filtered.length} {filtered.length === 1 ? 'comando' : 'comandos'}</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
