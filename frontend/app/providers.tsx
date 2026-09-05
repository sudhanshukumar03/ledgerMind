'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider as NextThemeProvider } from 'next-themes';
import { User, getUser } from '../lib/api-client';

interface AuthContextValue {
  user: User | null;
  setUser: (u: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  setUser: () => {},
  logout: () => {},
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);

  useEffect(() => {
    setUserState(getUser());
  }, []);

  const setUser = (u: User | null) => {
    setUserState(u);
    if (u) {
      localStorage.setItem('lm_user', JSON.stringify(u));
    } else {
      localStorage.removeItem('lm_user');
    }
  };

  const logout = () => {
    localStorage.removeItem('lm_token');
    localStorage.removeItem('lm_user');
    setUserState(null);
    window.location.href = '/login';
  };

  return (
    <NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthContext.Provider value={{ user, setUser, logout }}>
        {children}
      </AuthContext.Provider>
    </NextThemeProvider>
  );
}

export const useAuth = () => useContext(AuthContext);
