import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';

const sidebarStyle = {
  width: 240, minHeight: '100vh', background: '#1a1a2e', color: '#fff',
  display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0,
};
const logoStyle = { padding: '20px 16px', fontSize: 18, fontWeight: 700, borderBottom: '1px solid #2a2a4a' };
const navStyle = { flex: 1, padding: '12px 0' };
const linkStyle = {
  display: 'block', padding: '10px 20px', color: '#a0a0c0', textDecoration: 'none',
  fontSize: 14, transition: 'all 0.15s',
};
const activeLinkStyle = { ...linkStyle, color: '#fff', background: '#2a2a4a', borderLeft: '3px solid #4361ee' };
const contentStyle = { marginLeft: 240, minHeight: '100vh', background: '#f5f5f7' };
const headerStyle = {
  background: '#fff', padding: '12px 24px', borderBottom: '1px solid #e0e0e0',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const mainStyle = { padding: 24 };

const navItems = [
  { to: '/admin', label: 'Дашборд', end: true },
  { to: '/admin/users', label: 'Пользователи' },
  { to: '/admin/channels', label: 'Каналы' },
  { to: '/admin/subscribers', label: 'Подписчики' },
  { to: '/admin/admins', label: 'Администраторы' },
  { to: '/admin/tariffs', label: 'Тарифы' },
  { to: '/admin/finance', label: 'Финансы' },
  { to: '/admin/landings', label: 'Лендинги' },
];

export default function AdminLayout() {
  const { adminUser, adminLogout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = () => { adminLogout(); navigate('/admin/login'); };

  return (
    <div>
      <div style={sidebarStyle}>
        <div style={logoStyle}>Админ-панель</div>
        <nav style={navStyle}>
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div style={contentStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 14, color: '#666' }}>{adminUser?.display_name || adminUser?.username}</span>
          <button onClick={handleLogout} style={{
            background: 'none', border: '1px solid #ccc', borderRadius: 6, padding: '6px 14px',
            cursor: 'pointer', fontSize: 13, color: '#666',
          }}>Выйти</button>
        </div>
        <div style={mainStyle}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
