import { createContext, useContext, useEffect, useState } from 'react';

const PrivacyContext = createContext();

export function PrivacyProvider({ children }) {
  const [isPrivacyMode, setIsPrivacyMode] = useState(() => {
    const saved = localStorage.getItem('quantum_privacy_mode');
    return saved !== null ? JSON.parse(saved) : false;
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

export const usePrivacy = () => useContext(PrivacyContext);