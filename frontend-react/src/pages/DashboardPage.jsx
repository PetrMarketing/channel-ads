import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useChannels } from '../contexts/ChannelContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import Loading from '../components/Loading';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { channels, loadChannels, selectChannel, currentChannel } = useChannels();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editChannel, setEditChannel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addPlatform, setAddPlatform] = useState('max');
  const [unclaimedChannels, setUnclaimedChannels] = useState([]);
  const pollRef = useRef(null);
  const tgBotUsername = import.meta.env.VITE_TG_BOT_USERNAME || 'PKAds_bot';
  const maxBotId = import.meta.env.VITE_MAX_BOT_ID || '206603862';
  const maxBotUsername = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';
  const maxBotName = import.meta.env.VITE_MAX_BOT_NAME || 'PKMarketing';

  const loadStats = useCallback(async () => {
    try {
      const tc = currentChannel?.tracking_code;
      const url = tc ? `/dashboard?tc=${tc}` : '/dashboard';
      const data = await api.get(url);
      if (data.success) setStats(data);
    } catch {}
  }, [currentChannel]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const loadUnclaimedChannels = useCallback(async () => {
    try {
      const data = await api.get('/channels/unclaimed/list');
      if (data.success) {
        setUnclaimedChannels(data.channels || []);
      }
    } catch {}
  }, []);

  const claimChannel = async (trackingCode) => {
    try {
      const data = await api.post(`/channels/${trackingCode}/claim`);
      if (data.success) {
        showToast('Канал привязан к вашему аккаунту');
        loadChannels();
        loadUnclaimedChannels();
      } else {
        showToast(data.error || 'Ошибка привязки', 'error');
      }
    } catch {
      showToast('Ошибка привязки канала', 'error');
    }
  };

  const openAddModal = useCallback(async () => {
    const defaultPlatform = (user?.max_user_id && !user?.telegram_id) ? 'max' : 'telegram';
    setAddPlatform(defaultPlatform);
    setShowAddModal(true);
    // Scan for channels that bot was added to (catches missed bot_added events)
    try { await api.post('/channels/scan'); } catch {}
    loadUnclaimedChannels();
    loadChannels(true);
  }, [user, loadUnclaimedChannels, loadChannels]);

  // Poll for unclaimed channels while modal is open + scan for new
  useEffect(() => {
    if (showAddModal) {
      pollRef.current = setInterval(async () => {
        try { await api.post('/channels/scan'); } catch {}
        loadUnclaimedChannels();
        loadChannels(true);
      }, 5000);
      return () => clearInterval(pollRef.current);
    }
  }, [showAddModal, loadUnclaimedChannels, loadChannels]);

  const handleSaveSettings = async () => {
    if (!editChannel) return;
    setSaving(true);
    try {
      const data = await api.put(`/channels/${editChannel.tracking_code}`, {
        yandex_metrika_id: editChannel.yandex_metrika_id,
        vk_pixel_id: editChannel.vk_pixel_id,
        ym_oauth_token: editChannel.ym_oauth_token,
        join_link: editChannel.join_link,
      });
      if (data.success) {
        showToast('Настройки сохранены');
        setShowSettingsModal(false);
        loadChannels();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChannel = async (trackingCode) => {
    if (!window.confirm('Удалить канал? Все данные будут потеряны.')) return;
    try {
      const data = await api.delete(`/channels/${trackingCode}`);
      if (data.success) {
        showToast('Канал удалён');
        loadChannels();
      }
    } catch {
      showToast('Ошибка удаления', 'error');
    }
  };

  const openSettings = (ch) => {
    setEditChannel({ ...ch });
    setShowSettingsModal(true);
  };

  return (
    <div>
      {/* Dashboard Stats */}
      {stats && (
        <div style={{ marginBottom: '25px' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <StatCard label="Визиты" value={stats.visits} onClick={() => navigate('/links')} />
            <StatCard label="Подписки" value={stats.subscribers} onClick={() => navigate('/links')} />
            <StatCard label="Лиды" value={stats.leads} onClick={() => navigate('/pins')} />
            <StatCard label="Публикации" value={stats.scheduledPosts} onClick={() => navigate('/content')} />
          </div>
        </div>
      )}

      {/* Channel List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 500, margin: 0 }}>Каналы</h2>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          + Добавить канал
        </button>
      </div>

      {channels.length === 0 ? (
        <div className="empty-state" style={{
          textAlign: 'center', padding: '60px 20px',
          background: 'var(--bg-glass)', borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📢</div>
          <h3 style={{ marginBottom: '8px' }}>Нет каналов</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Добавьте свой первый канал для начала работы
          </p>
          <button className="btn btn-primary btn-large" onClick={openAddModal}>
            + Добавить канал
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {channels.map(ch => (
            <ChannelCard
              key={ch.tracking_code}
              channel={ch}
              isSelected={currentChannel?.tracking_code === ch.tracking_code}
              onSelect={() => selectChannel(ch)}
              onSettings={() => openSettings(ch)}
              onDelete={() => handleDeleteChannel(ch.tracking_code)}
            />
          ))}
        </div>
      )}

      {/* Add Channel Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Добавить канал">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* MAX */}
          {(
            <div className="instruction-box" style={{ padding: '16px', background: 'var(--bg-glass)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              {!user?.max_user_id ? (
                <>
                  <h4 style={{ marginBottom: '8px' }}>Подключите MAX</h4>
                  <p style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Чтобы добавлять MAX-каналы, сначала авторизуйтесь через MAX-бота.
                  </p>
                  <a href={`https://max.ru/${maxBotUsername}?start=auth`} target="_blank" rel="noreferrer"
                    className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#7B68EE' }}>
                    💬 Открыть бота в MAX
                  </a>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '10px' }}>
                    Нажмите кнопку — бот автоматически пришлёт ссылку для привязки аккаунта.
                  </p>
                </>
              ) : (
                <>
                  <h4 style={{ marginBottom: '8px' }}>Добавьте бота в канал</h4>
                  <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>Добавьте бота в подписчики канала: <code style={{ cursor: 'pointer', padding: '2px 6px', background: 'var(--bg-glass)', borderRadius: '4px' }} onClick={() => { navigator.clipboard.writeText(`@${maxBotUsername}`); showToast('Скопировано'); }}>@{maxBotUsername}</code> или по имени <code style={{ cursor: 'pointer', padding: '2px 6px', background: 'var(--bg-glass)', borderRadius: '4px' }} onClick={() => { navigator.clipboard.writeText(maxBotName); showToast('Скопировано'); }}>{maxBotName}</code></li>
                    <li>Откройте ваш канал → <b>Настройки</b> → <b>Администраторы</b> → назначьте бота администратором</li>
                    <li>Канал появится автоматически в списке каналов</li>
                  </ol>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '10px' }}>
                    Каналы добавляются автоматически при добавлении бота
                  </p>
                </>
              )}
            </div>
          )}

          {/* Unclaimed channels */}
          {unclaimedChannels.length > 0 && (
            <div style={{ padding: '12px', background: 'var(--bg-glass)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: '10px' }}>Обнаруженные каналы:</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {unclaimedChannels.map(ch => (
                  <div key={ch.tracking_code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg)', borderRadius: '6px' }}>
                    <div>
                      <span>{ch.platform === 'max' ? '💬' : '📱'} {ch.title}</span>
                      <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Код: {ch.tracking_code}</span>
                    </div>
                    <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.85rem' }} onClick={() => claimChannel(ch.tracking_code)}>
                      Привязать
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={() => setShowAddModal(false)}>Закрыть</button>
          </div>
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="Настройки канала">
        {editChannel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Яндекс.Метрика ID</label>
              <input
                className="form-input"
                placeholder="12345678"
                value={editChannel.yandex_metrika_id || ''}
                onChange={e => setEditChannel(p => ({ ...p, yandex_metrika_id: e.target.value }))}
              />
              <div className="form-hint">Числовой ID счётчика. Найдите его в Метрике: Настройка → Счётчик → ID (только цифры).</div>
            </div>
            <div>
              <label className="form-label">VK Pixel ID</label>
              <input
                className="form-input"
                placeholder="VK-RTRG-xxxxxx-xxxxx"
                value={editChannel.vk_pixel_id || ''}
                onChange={e => setEditChannel(p => ({ ...p, vk_pixel_id: e.target.value }))}
              />
              <div className="form-hint">Формат: VK-RTRG-XXXXXX-XXXXX. Создайте пиксель в рекламном кабинете VK.</div>
            </div>
            <div>
              <label className="form-label">Ссылка для подписки (join link)</label>
              <input
                className="form-input"
                placeholder="https://t.me/+xxxx или https://max.ru/join/xxxx"
                value={editChannel.join_link || ''}
                onChange={e => setEditChannel(p => ({ ...p, join_link: e.target.value }))}
              />
              <div className="form-hint">Invite-ссылка канала. Подписчики перейдут по ней после трекинг-ссылки. Для Telegram: Настройки канала → Ссылка-приглашение.</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowSettingsModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSaveSettings} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}

function StatCard({ label, value, color, onClick }) {
  return (
    <div
      className="stat-card"
      style={{ padding: '15px', cursor: 'pointer' }}
      onClick={onClick}
    >
      <div className="stat-value" style={{ fontSize: '1.8rem', color: color || 'inherit' }}>
        {value ?? 0}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ChannelCard({ channel, isSelected, onSelect, onSettings, onDelete }) {
  const ch = channel;
  const isDisconnected = ch.is_active === 0 || ch.is_active === false;
  const tgBotUsername = import.meta.env.VITE_TG_BOT_USERNAME || 'PKAds_bot';
  const maxBotUsername = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';
  const maxBotName = import.meta.env.VITE_MAX_BOT_NAME || 'PKMarketing';
  const platformColor = ch.platform === 'max' ? '#7B68EE' : '#2AABEE';
  const firstLetter = (ch.title || ch.channel_id || 'C')[0].toUpperCase();

  const channelLink = ch.platform === 'max'
    ? (ch.join_link || '')
    : (ch.join_link || (ch.username ? `t.me/${ch.username}` : ''));

  return (
    <div
      className={`channel-card ${isSelected ? 'selected' : ''}`}
      style={{
        background: isSelected ? 'rgba(var(--primary-rgb, 99,102,241), 0.06)' : 'var(--bg-glass)',
        border: isDisconnected
          ? '1px solid var(--error)'
          : isSelected
            ? '1px solid var(--primary)'
            : '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '12px 16px',
        cursor: 'pointer',
        transition: 'var(--transition)',
        opacity: isDisconnected ? 0.8 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
      }}
      onClick={!isDisconnected ? onSelect : undefined}
    >
      {/* Avatar */}
      {ch.avatar_url ? (
        <img src={ch.avatar_url} alt="" style={{
          width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
        }} />
      ) : (
        <div style={{
          width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
          background: platformColor, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.1rem', fontWeight: 700,
        }}>
          {firstLetter}
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ch.title || ch.channel_id || ch.tracking_code}
        </div>
        {channelLink && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {channelLink}
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
          {isDisconnected ? (
            <span style={{
              fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 600,
              background: 'var(--error)', color: '#fff',
            }}>
              Отключен
            </span>
          ) : ch.billing_active !== undefined ? (
            ch.billing_active ? (
              <span style={{
                fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px',
                background: 'rgba(42,157,143,0.1)', color: 'var(--success, #2a9d8f)', fontWeight: 500,
              }}>
                Активна · {ch.billing_days_left} дн.
              </span>
            ) : (
              <span style={{
                fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px',
                background: 'rgba(230,57,70,0.1)', color: 'var(--error, #e63946)', fontWeight: 500,
              }}>
                Нет подписки
              </span>
            )
          ) : null}
        </div>
        {isDisconnected && (
          <div style={{ marginTop: '6px' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>
              1. Добавьте бота в подписчики:{' '}
              <b
                style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                title="Нажмите, чтобы скопировать"
                onClick={(e) => { e.stopPropagation(); const name = ch.platform === 'max' ? `@${maxBotUsername}` : `@${tgBotUsername}`; navigator.clipboard.writeText(name); }}
              >{ch.platform === 'max' ? `@${maxBotUsername}` : `@${tgBotUsername}`}</b>
              {ch.platform === 'max' && <span> или по имени <code style={{ cursor: 'pointer', padding: '2px 6px', background: 'var(--bg-glass)', borderRadius: '4px' }} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(maxBotName); }}>{maxBotName}</code></span>}
              <br />2. Канал → Настройки → Администраторы → назначьте бота администратором
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {ch.join_link && (
                <a href={ch.join_link} target="_blank" rel="noreferrer" className="btn btn-primary"
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                  onClick={(e) => e.stopPropagation()}>
                  Открыть канал
                </a>
              )}
              <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                Удалить из списка
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {!isDisconnected && (
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button className="btn btn-outline" style={{ padding: '6px 8px', fontSize: '0.85rem', lineHeight: 1 }}
            onClick={(e) => { e.stopPropagation(); onSettings(); }}>
            ⚙️
          </button>
          <button className="btn btn-danger" style={{ padding: '6px 8px', fontSize: '0.85rem', lineHeight: 1 }}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}
