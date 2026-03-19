import { useAuth } from '../contexts/AuthContext';
import { useChannels } from '../contexts/ChannelContext';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';

export default function Header({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { channels, currentChannel, selectChannel } = useChannels();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleChannelChange = (e) => {
    const ch = channels.find(c => c.tracking_code === e.target.value);
    if (ch) selectChannel(ch);
  };

  return (
    <header className="header">
      <div className="header-left">
        <button className="sidebar-toggle" onClick={onToggleSidebar}>&#9776;</button>
        <h1>&#128226; Реклама канала</h1>
        {channels.length > 0 && (
          <div className="global-channel-selector">
            <select
              value={currentChannel?.tracking_code || ''}
              onChange={handleChannelChange}
            >
              <option value="">Выберите канал</option>
              {channels.map(ch => (
                <option key={ch.tracking_code} value={ch.tracking_code}>
                  {ch.title || ch.channel_id || ch.tracking_code}
                </option>
              ))}
            </select>
          </div>
        )}
        {user && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {user.first_name || user.username || ''}
          </span>
        )}
        {user && (
          <span style={{ fontSize: '0.8rem', marginLeft: '8px' }}>
            {user.telegram_id && (
              <span style={{ background: '#2AABEE', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, marginRight: '4px' }}>TG</span>
            )}
            {user.max_user_id && (
              <span style={{ background: '#7B68EE', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600 }}>MAX</span>
            )}
          </span>
        )}
      </div>
      <div className="header-right">
        <ThemeToggle />
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          + Добавить канал
        </button>
        <button className="btn btn-outline" onClick={handleLogout} title="Выйти">
          &#128682; Выйти
        </button>
      </div>
    </header>
  );
}
