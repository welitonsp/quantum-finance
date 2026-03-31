// src/contexts/NavigationContext.jsx
import { createContext, useContext, useState, useCallback } from 'react';

const NavigationContext = createContext();

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation deve ser usado dentro de um NavigationProvider');
  }
  return context;
};

export const NavigationProvider = ({ children }) => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [activeModule, setActiveModule] = useState('geral');

  const handlePrevMonth = useCallback(() => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  }, [currentMonth]);

  const handleNextMonth = useCallback(() => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  }, [currentMonth]);

  const value = {
    currentPage, setCurrentPage,
    currentMonth, setCurrentMonth,
    currentYear, setCurrentYear,
    activeModule, setActiveModule,
    handlePrevMonth,
    handleNextMonth,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};