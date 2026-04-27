import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { adminApi } from '../../services/adminApi';

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap';

const inputStyle = {
  width: '100%', padding: '12px 16px', border: '1px solid #e5e7eb',
  borderRadius: 12, fontSize: 14, boxSizing: 'border-box', outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  fontFamily: "'DM Sans', sans-serif",
};

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { adminLogin, adminToken } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!document.querySelector(`link[href="${FONT_LINK}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  if (adminToken) return <Navigate to="/admin" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await adminApi.post('/auth/login', { username, password });
      adminLogin(data.token, data.admin);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message || 'Ошибка входа');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#1a1a2e', fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* subtle radial glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 30%, rgba(67,97,238,0.12) 0%, transparent 70%)',
      }} />

      <form onSubmit={handleSubmit} style={{
        position: 'relative', background: '#fff', padding: '40px 36px', borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: 380, zIndex: 1,
      }}>
        {/* Logo / brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #4361ee 0%, #7c3aed 100%)',
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 22, color: '#fff', fontWeight: 800 }}>A</span>
          </div>
          <h2 style={{
            margin: 0, fontSize: 22, fontWeight: 800, color: '#1a1a2e', letterSpacing: -0.5,
          }}>Админ-панель</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#999' }}>Channel Ads Dashboard</p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 10,
            marginBottom: 16, fontSize: 13, border: '1px solid #fecaca',
          }}>{error}</div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6, display: 'block' }}>Логин</label>
          <input
            type="text" placeholder="admin" value={username}
            onChange={e => setUsername(e.target.value)}
            style={inputStyle}
            onFocus={e => { e.target.style.borderColor = '#4361ee'; e.target.style.boxShadow = '0 0 0 3px rgba(67,97,238,0.1)'; }}
            onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6, display: 'block' }}>Пароль</label>
          <input
            type="password" placeholder="••••••••" value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
            onFocus={e => { e.target.style.borderColor = '#4361ee'; e.target.style.boxShadow = '0 0 0 3px rgba(67,97,238,0.1)'; }}
            onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
          />
        </div>

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: 14, border: 'none', borderRadius: 12,
          background: loading ? '#93a3f8' : 'linear-gradient(135deg, #4361ee 0%, #7c3aed 100%)',
          color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
          transition: 'all 0.2s', fontFamily: "'DM Sans', sans-serif",
          boxShadow: '0 4px 14px rgba(67,97,238,0.3)',
        }}>{loading ? 'Вход...' : 'Войти'}</button>
      </form>
    </div>
  );
}
