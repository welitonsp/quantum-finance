import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredTheme(): ThemePreference {
  const stored = localStorage.getItem('theme');
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredTheme()));

  useEffect(() => {
    const root = document.documentElement;
    const next = resolveTheme(theme);
    setResolvedTheme(next);
    if (next === 'dark') root.classList.add('dark');
    else                 root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = resolveTheme('system');
      setResolvedTheme(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : prev === 'light' ? 'system' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
