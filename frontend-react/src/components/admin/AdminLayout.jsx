import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';

const navItems = [
  { to: '/admin', label: 'Дашборд', icon: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z', end: true },
  { to: '/admin/users', label: 'Пользователи', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm11 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
  { to: '/admin/channels', label: 'Каналы', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { to: '/admin/subscribers', label: 'Подписчики', icon: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m7-10a4 4 0 100-8 4 4 0 000 8z' },
  { to: '/admin/admins', label: 'Администраторы', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { to: '/admin/tariffs', label: 'Тарифы', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { to: '/admin/finance', label: 'Финансы', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
  { to: '/admin/generations', label: 'Генерации', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { to: '/admin/support', label: 'Обращения', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', badge: true },
  { to: '/admin/landings', label: 'Лендинги', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z' },
  { to: '/admin/action-log', label: 'Лог действий', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11' },
];

function NavIcon({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function AdminLayout() {
  const { adminUser, adminLogout } = useAdminAuth();
  const navigate = useNavigate();
  const handleLogout = () => { adminLogout(); navigate('/admin/login'); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#eef0f4', fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, minHeight: '100vh',
        background: 'linear-gradient(195deg, #1a1a2e 0%, #16162a 50%, #121228 100%)',
        color: '#fff', display: 'flex', flexDirection: 'column',
        position: 'fixed', left: 0, top: 0, zIndex: 50,
        boxShadow: '4px 0 24px rgba(26,26,46,0.3)',
      }}>
        {/* Logo */}
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #4361ee 0%, #7b68ee 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(67,97,238,0.4)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>Admin</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: 0.5 }}>MAXМаркетинг</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontWeight: 600, letterSpacing: 1.5, padding: '0 12px 8px', textTransform: 'uppercase' }}>Меню</div>
          {navItems.map((item, i) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', margin: '2px 0', borderRadius: 10,
                textDecoration: 'none', fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                background: isActive ? 'rgba(67,97,238,0.2)' : 'transparent',
                boxShadow: isActive ? 'inset 0 0 0 1px rgba(67,97,238,0.3)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                position: 'relative',
              })}>
              <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
                <NavIcon d={item.icon} />
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff6b6b', boxShadow: '0 0 6px rgba(255,107,107,0.6)' }} />}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{
          padding: '16px 14px', borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, #4361ee, #7b68ee)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
            boxShadow: '0 2px 8px rgba(67,97,238,0.3)',
          }}>{(adminUser?.display_name || adminUser?.username || 'A')[0].toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {adminUser?.display_name || adminUser?.username}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Администратор</div>
          </div>
          <button onClick={handleLogout} title="Выйти" style={{
            background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8,
            width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.3)', transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,107,107,0.15)'; e.currentTarget.style.color = '#ff6b6b'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9"/></svg>
          </button>
        </div>
      </aside>

      {/* Content */}
      <div style={{ marginLeft: 240, flex: 1, minHeight: '100vh' }}>
        <div style={{ padding: '24px 32px' }}>
          <Outlet />
        </div>
      </div>

      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" />
      <style>{`
        aside nav a:hover { background: rgba(255,255,255,0.04) !important; color: rgba(255,255,255,0.8) !important; }
        @keyframes adminFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
