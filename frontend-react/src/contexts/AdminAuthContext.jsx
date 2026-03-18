import React, { createContext, useContext, useState, useCallback } from 'react';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('admin_token'));
  const [adminUser, setAdminUser] = useState(() => {
    const stored = localStorage.getItem('admin_user');
    return stored ? JSON.parse(stored) : null;
  });

  const adminLogin = useCallback((token, user) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_user', JSON.stringify(user));
    setAdminToken(token);
    setAdminUser(user);
  }, []);

  const adminLogout = useCallback(() => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setAdminToken(null);
    setAdminUser(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ adminToken, adminUser, adminLogin, adminLogout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return ctx;
}
