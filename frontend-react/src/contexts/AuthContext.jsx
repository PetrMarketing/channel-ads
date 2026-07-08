import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  });

  const login = useCallback((newToken, userData) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      if (data.success) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
    } catch {}
  }, []);

  // Auto-refresh user data every 15 seconds (catches link/unlink changes)
  useEffect(() => {
    if (!token) return;
    refreshUser();
    const interval = setInterval(refreshUser, 15000);
    return () => clearInterval(interval);
  }, [token, refreshUser]);

  // Авто-логин в MAX WebApp контексте: если открыто через кнопку
  // «Приложение» в MAX-боте, window.WebApp содержит initData/initDataUnsafe.
  // Пробуем /api/auth/max-webapp — если юзер уже писал боту, вернёт JWT.
  // Без токена + без WebApp контекста делаем один запрос впустую и уходим.
  useEffect(() => {
    if (token) return;
    let cancelled = false;
    // Ждём до 2 секунд пока подгрузится WebApp bridge
    const tryAutoLogin = async () => {
      let waited = 0;
      while (waited < 2000 && !window.WebApp) {
        await new Promise(r => setTimeout(r, 200));
        waited += 200;
        if (cancelled) return;
      }
      let initData = '';
      let initDataUnsafe = null;
      try { initData = (window.WebApp && window.WebApp.initData) || ''; } catch {}
      try { initDataUnsafe = (window.WebApp && window.WebApp.initDataUnsafe) || null; } catch {}
      // Если ни того, ни другого — WebApp не подгрузился, пробовать бессмысленно
      if (!initData && !(initDataUnsafe && initDataUnsafe.user && initDataUnsafe.user.id)) return;
      try {
        const r = await fetch('/api/auth/max-webapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, initDataUnsafe }),
        });
        const d = await r.json();
        if (!cancelled && d && d.success && d.token) {
          login(d.token, d.user);
        }
      } catch {}
    };
    tryAutoLogin();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
