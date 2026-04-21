import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface NavigationContextValue {
  currentPage:    string;
  setCurrentPage: (page: string) => void;
  currentMonth:   number;
  setCurrentMonth: (m: number | ((prev: number) => number)) => void;
  currentYear:    number;
  setCurrentYear: (y: number | ((prev: number) => number)) => void;
  activeModule:   string;
  setActiveModule: (m: string) => void;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export const useNavigation = (): NavigationContextValue => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigation deve ser usado dentro de um NavigationProvider');
  return context;
};

export const NavigationProvider = ({ children }: { children: ReactNode }) => {
  const [currentPage,  setCurrentPage]  = useState('dashboard');
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear,  setCurrentYear]  = useState(new Date().getFullYear());
  const [activeModule, setActiveModule] = useState('geral');

  const handlePrevMonth = useCallback(() => {
    if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(y => y - 1); }
    else                    { setCurrentMonth(m => m - 1); }
  }, [currentMonth]);

  const handleNextMonth = useCallback(() => {
    if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(y => y + 1); }
    else                     { setCurrentMonth(m => m + 1); }
  }, [currentMonth]);

  const value: NavigationContextValue = {
    currentPage, setCurrentPage,
    currentMonth, setCurrentMonth,
    currentYear,  setCurrentYear,
    activeModule, setActiveModule,
    handlePrevMonth, handleNextMonth,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};
