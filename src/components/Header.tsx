import { useMemo } from 'react';
import {
  Menu, ChevronLeft, ChevronRight, Sun, Moon, Plus, Eye, EyeOff,
  Flame, CalendarClock, Wind, Command,
} from 'lucide-react';
import { motion } from 'framer-motion';
import ImportButton from '../features/transactions/ImportButton';
import { usePrivacy } from '../contexts/PrivacyContext';
import type { Transaction } from '../shared/types/transaction';

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Painel Central',
  reports:   'Relatórios Analíticos',
  history:   'Livro Razão',
  wallet:    'Carteira',
  accounts:  'As Minhas Contas',
  cards:     'Cartões de Crédito',
  portfolio: 'Portfólio',
  markets:   'Mercados',
  quantum:   'Quantum AI',
  recurring: 'Despesas Recorrentes',
};

// ─── HUD de Burn Rate ──────────────────────────────────────────────────────────
interface BurnRateProps {
  transactions: Transaction[];
  currentMonth: number;
  currentYear: number;
}

function BurnRateHUD({ transactions, currentMonth, currentYear }: BurnRateProps) {
  const { isPrivacyMode } = usePrivacy();

  const { burnRate, percentDoMes } = useMemo(() => {
    if (!transactions || transactions.length === 0) return { burnRate: 0, percentDoMes: 0 };

    const today      = new Date();
    const diaAtual   = today.getDate();
    const diasNoMes  = new Date(currentYear, currentMonth, 0).getDate();

    const despesasMes = transactions
      .filter(tx => {
        if (tx.type !== 'saida' && tx.type !== 'despesa') return false;
        const d = new Date((tx.date ?? tx.createdAt) as string);
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, tx) => acc + Math.abs(Number(tx.value ?? 0)), 0);

    const ritmoDiario = diaAtual > 0 ? despesasMes / diaAtual : 0;
    const pct         = Math.round((diaAtual / diasNoMes) * 100);
    return { burnRate: ritmoDiario, percentDoMes: pct };
  }, [transactions, currentMonth, currentYear]);

  if (burnRate === 0) return null;

  const color = percentDoMes < 50
    ? { text: 'text-quantum-accent', bar: 'bg-quantum-accent', glow: 'rgba(0,230,138,0.5)' }
    : percentDoMes < 75
    ? { text: 'text-quantum-gold',   bar: 'bg-quantum-gold',   glow: 'rgba(255,184,0,0.5)' }
    : { text: 'text-quantum-red',    bar: 'bg-quantum-red',    glow: 'rgba(255,71,87,0.5)' };

  const formatted = isPrivacyMode
    ? '••••'
    : `R$ ${burnRate.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/dia`;

  return (
    <div className="hidden lg:flex items-center gap-3 px-4 py-2 bg-quantum-card/60 backdrop-blur-sm border border-quantum-border rounded-xl" title="Burn Rate diário do mês atual">
      <div className={`p-1.5 rounded-lg bg-quantum-bgSecondary ${color.text}`}>
        <Flame className="w-3.5 h-3.5" />
      </div>
      <div className="flex flex-col gap-1 min-w-[120px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-quantum-fgMuted uppercase tracking-wider font-medium">Burn Rate</span>
          <span className={`text-[10px] font-bold font-mono ${color.text}`}>{percentDoMes}% do mês</span>
        </div>
        <div className="w-full h-1 bg-quantum-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${color.bar}`}
            style={{ width: `${Math.min(percentDoMes, 100)}%`, boxShadow: `0 0 6px ${color.glow}` }}
          />
        </div>
        <span className={`text-xs font-bold font-mono ${color.text}`} style={{ textShadow: `0 0 10px ${color.glow}` }}>
          {formatted}
        </span>
      </div>
    </div>
  );
}

// ─── KPIs de Sobrevivência ────────────────────────────────────────────────────
const staggerContainer = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08 } },
};
const kpiItem = {
  hidden: { opacity: 0, y: 6 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

interface SurvivalKPIsProps {
  transactions: Transaction[];
  currentMonth: number;
  currentYear: number;
}

function SurvivalKPIs({ transactions, currentMonth, currentYear }: SurvivalKPIsProps) {
  const { isPrivacyMode } = usePrivacy();

  const { d2z, liberdadeDiaria } = useMemo(() => {
    if (!transactions || transactions.length === 0) return { d2z: null, liberdadeDiaria: null };

    const today          = new Date();
    const diaAtual       = today.getDate();
    const diasNoMes      = new Date(currentYear, currentMonth, 0).getDate();
    const diasRestantes  = Math.max(diasNoMes - diaAtual, 1);

    const saldoTotal = transactions.reduce((acc, tx) => {
      const val = Math.abs(Number(tx.value ?? 0));
      return (tx.type === 'entrada' || tx.type === 'receita') ? acc + val : acc - val;
    }, 0);

    const despesasMes = transactions
      .filter(tx => {
        if (tx.type !== 'saida' && tx.type !== 'despesa') return false;
        const d = new Date((tx.date ?? tx.createdAt) as string);
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, tx) => acc + Math.abs(Number(tx.value ?? 0)), 0);

    const ritmoDiario  = diaAtual > 0 ? despesasMes / diaAtual : 0;
    const d2zVal: number | null = ritmoDiario > 0
      ? Math.floor(saldoTotal / ritmoDiario)
      : saldoTotal > 0 ? Infinity : null;

    const safeDias      = diasRestantes > 0 ? diasRestantes : 1;
    const liberdadeVal  = saldoTotal / safeDias;

    return { d2z: d2zVal, liberdadeDiaria: liberdadeVal };
  }, [transactions, currentMonth, currentYear]);

  if (d2z === null && liberdadeDiaria === null) return null;

  const d2zIsStable = d2z === Infinity;
  const d2zDisplay  = isPrivacyMode ? '••' : d2zIsStable ? 'Estável' : `${d2z} dias`;

  const d2zColor = d2z === null
    ? { text: 'text-quantum-fgMuted', glow: 'transparent' }
    : d2zIsStable
    ? { text: 'text-quantum-accent',  glow: 'rgba(0,230,138,0.45)' }
    : (d2z as number) > 30
    ? { text: 'text-quantum-accent',  glow: 'rgba(0,230,138,0.45)' }
    : (d2z as number) > 15
    ? { text: 'text-quantum-gold',    glow: 'rgba(255,184,0,0.45)'  }
    : { text: 'text-quantum-red',     glow: 'rgba(255,71,87,0.45)'  };

  const libColor = (liberdadeDiaria ?? 0) >= 0
    ? { text: 'text-quantum-accent', glow: 'rgba(0,230,138,0.45)' }
    : { text: 'text-quantum-red',    glow: 'rgba(255,71,87,0.45)'  };

  const fmtCurrency = (v: number) => isPrivacyMode
    ? '••••'
    : `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/dia`;

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="hidden xl:flex items-center gap-2">
      {d2z !== null && (
        <motion.div
          variants={kpiItem}
          className="flex items-center gap-2.5 px-3.5 py-2 bg-quantum-card/60 backdrop-blur-sm border border-quantum-border rounded-xl"
          title="Dias até o saldo chegar a zero no ritmo atual"
        >
          <div className={`p-1.5 rounded-lg bg-quantum-bgSecondary ${d2zColor.text}`}>
            <CalendarClock className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-quantum-fgMuted uppercase tracking-wider font-medium leading-none mb-1">Dias p/ Zero</span>
            <span className={`text-xs font-bold font-mono leading-none ${d2zColor.text}`} style={{ textShadow: `0 0 10px ${d2zColor.glow}` }}>
              {d2zDisplay}
            </span>
          </div>
        </motion.div>
      )}

      {liberdadeDiaria !== null && (
        <motion.div
          variants={kpiItem}
          className="flex items-center gap-2.5 px-3.5 py-2 bg-quantum-card/60 backdrop-blur-sm border border-quantum-border rounded-xl"
          title="Valor disponível por dia até ao fim do mês"
        >
          <div className={`p-1.5 rounded-lg bg-quantum-bgSecondary ${libColor.text}`}>
            <Wind className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-quantum-fgMuted uppercase tracking-wider font-medium leading-none mb-1">Liberdade Diária</span>
            <span className={`text-xs font-bold font-mono leading-none ${libColor.text}`} style={{ textShadow: `0 0 10px ${libColor.glow}` }}>
              {fmtCurrency(liberdadeDiaria)}
            </span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Header Principal ─────────────────────────────────────────────────────────
interface HeaderProps {
  currentPage: string;
  currentMonth: number;
  currentYear: number;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  nomeMeses: string[];
  theme: string;
  toggleTheme: () => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (v: boolean) => void;
  setIsMobileMenuOpen: (v: boolean) => void;
  isFormOpen: boolean;
  setIsFormOpen: (v: boolean) => void;
  user: { uid?: string } | null;
  transactions: Transaction[];
  handleImport: (txs: Partial<Transaction>[]) => Promise<unknown> | void;
  onOpenCommandPalette?: () => void;
}

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
  handleImport,
  onOpenCommandPalette,
}: HeaderProps) {
  const { isPrivacyMode, togglePrivacy } = usePrivacy();
  const pageTitle = PAGE_TITLES[currentPage] ?? 'Quantum Finance';

  return (
    <header className="h-20 border-b border-quantum-border bg-quantum-bg/80 backdrop-blur-xl flex items-center justify-between px-4 lg:px-8 flex-shrink-0 transition-all z-40 relative shadow-[0_1px_0_rgba(0,230,138,0.04)]">
      {/* Esquerda */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="lg:hidden p-2 bg-quantum-card rounded-xl text-quantum-fg border border-quantum-border"
          aria-label="Abrir menu mobile"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden lg:flex p-2 bg-quantum-card hover:bg-quantum-cardHover rounded-xl text-quantum-fgMuted hover:text-quantum-fg border border-quantum-border transition-all"
          title={isSidebarCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
          aria-label={isSidebarCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
        >
          <Menu className="w-5 h-5" />
        </button>

        <h2 className="text-lg md:text-xl font-black text-quantum-fg tracking-wide hidden sm:block">{pageTitle}</h2>
      </div>

      {/* Centro */}
      <div className="flex items-center gap-3">
        {(currentPage === 'dashboard' || currentPage === 'history' || currentPage === 'reports') && (
          <>
            <SurvivalKPIs transactions={transactions} currentMonth={currentMonth} currentYear={currentYear} />
            <BurnRateHUD  transactions={transactions} currentMonth={currentMonth} currentYear={currentYear} />
          </>
        )}

        <div className="flex items-center gap-1 bg-quantum-card/80 p-1.5 rounded-2xl border border-quantum-border shadow-inner">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-quantum-cardHover rounded-xl text-quantum-fgMuted hover:text-quantum-fg transition-colors" aria-label="Mês anterior">
            <ChevronLeft className="w-4 md:w-5 h-4 md:h-5" />
          </button>
          <div className="flex flex-col items-center justify-center w-24 md:w-36" aria-live="polite">
            <span className="text-xs md:text-sm font-bold text-quantum-fg uppercase tracking-wider">
              {nomeMeses && currentMonth ? nomeMeses[currentMonth - 1] : 'MÊS'}
            </span>
            <span className="text-[10px] md:text-xs font-mono text-quantum-accent">
              {currentYear || new Date().getFullYear()}
            </span>
          </div>
          <button onClick={handleNextMonth} className="p-2 hover:bg-quantum-cardHover rounded-xl text-quantum-fgMuted hover:text-quantum-fg transition-colors" aria-label="Próximo mês">
            <ChevronRight className="w-4 md:w-5 h-4 md:h-5" />
          </button>
        </div>
      </div>

      {/* Direita */}
      <div className="flex items-center gap-2 md:gap-3">
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-quantum-card hover:bg-quantum-cardHover rounded-xl text-quantum-fgMuted hover:text-quantum-fg border border-quantum-border transition-all group"
            title="Palete de Comandos (Ctrl+K)"
            aria-label="Abrir palete de comandos"
          >
            <Command className="w-3.5 h-3.5" />
            <span className="text-xs font-mono text-quantum-fgMuted group-hover:text-quantum-fg/70 transition-colors">⌘K</span>
          </button>
        )}

        <button
          onClick={togglePrivacy}
          className={`p-2.5 rounded-xl border transition-all ${isPrivacyMode ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.2)]' : 'bg-quantum-card text-quantum-fgMuted border-quantum-border hover:text-quantum-fg hover:border-quantum-accent/30'}`}
          title="Modo Privacidade (Alt + P)"
          aria-label={isPrivacyMode ? 'Desativar modo privacidade' : 'Ativar modo privacidade'}
        >
          {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleTheme}
          className="p-2.5 bg-quantum-card hover:bg-quantum-cardHover rounded-xl text-quantum-fgMuted hover:text-quantum-accent border border-quantum-border transition-all"
          title={theme === 'dark' ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
          aria-label={theme === 'dark' ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {currentPage === 'dashboard' && (
          <>
            <div className="hidden xl:block">
              <ImportButton onImportTransactions={async (txs) => { await handleImport(txs as Partial<Transaction>[]); }} uid={user?.uid} existingTransactions={transactions} />
            </div>
            <button
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="btn-quantum-primary flex items-center gap-2"
              title="Nova Transação (Alt + N)"
              aria-label="Adicionar nova transação"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline text-sm">Nova Transação</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
