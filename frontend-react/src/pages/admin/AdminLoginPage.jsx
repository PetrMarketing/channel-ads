import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { adminApi } from '../../services/adminApi';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { adminLogin, adminToken } = useAdminAuth();
  const navigate = useNavigate();

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7' }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        width: 360,
      }}>
        <h2 style={{ margin: '0 0 24px', textAlign: 'center', color: '#1a1a2e' }}>Админ-панель</h2>
        {error && <div style={{ background: '#fee', color: '#c00', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}</div>}
        <input type="text" placeholder="Логин" value={username} onChange={e => setUsername(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 12, border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 20, border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        <button type="submit" disabled={loading} style={{
          width: '100%', padding: 12, background: '#4361ee', color: '#fff', border: 'none',
          borderRadius: 6, fontSize: 14, cursor: 'pointer', fontWeight: 600,
        }}>{loading ? 'Вход...' : 'Войти'}</button>
      </form>
    </div>
  );
}
