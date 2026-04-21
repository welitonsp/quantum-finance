import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface PrivacyContextValue {
  isPrivacyMode: boolean;
  togglePrivacy: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue | undefined>(undefined);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivacyMode, setIsPrivacyMode] = useState(() => {
    const saved = localStorage.getItem('quantum_privacy_mode');
    return saved !== null ? JSON.parse(saved) as boolean : false;
  });

  useEffect(() => {
    localStorage.setItem('quantum_privacy_mode', JSON.stringify(isPrivacyMode));
  }, [isPrivacyMode]);

  const togglePrivacy = () => setIsPrivacyMode(prev => !prev);

  return (
    <PrivacyContext.Provider value={{ isPrivacyMode, togglePrivacy }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export const usePrivacy = (): PrivacyContextValue => {
  const context = useContext(PrivacyContext);
  if (!context) throw new Error('usePrivacy deve ser usado dentro de um PrivacyProvider');
  return context;
};
