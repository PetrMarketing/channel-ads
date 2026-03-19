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
  const [addPlatform, setAddPlatform] = useState('telegram');
  const [unclaimedChannels, setUnclaimedChannels] = useState([]);
  const pollRef = useRef(null);
  const tgBotUsername = import.meta.env.VITE_TG_BOT_USERNAME || 'pkmarketing_rekl_bot';
  const maxBotId = import.meta.env.VITE_MAX_BOT_ID || '206603862';
  const maxBotUsername = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_3_bot';

  const loadStats = useCallback(async () => {
    try {
      const data = await api.get('/dashboard');
      if (data.success) setStats(data);
    } catch {}
  }, []);

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

  const openAddModal = useCallback(() => {
    const defaultPlatform = (user?.max_user_id && !user?.telegram_id) ? 'max' : 'telegram';
    setAddPlatform(defaultPlatform);
    setShowAddModal(true);
    loadUnclaimedChannels();
  }, [user, loadUnclaimedChannels]);

  // Poll for unclaimed channels while modal is open
  useEffect(() => {
    if (showAddModal) {
      pollRef.current = setInterval(loadUnclaimedChannels, 5000);
      return () => clearInterval(pollRef.current);
    }
  }, [showAddModal, loadUnclaimedChannels]);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 500 }}>Каналы</h2>
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
        <div className="grid-channels">
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
          {/* Platform Selector */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn ${addPlatform === 'telegram' ? 'btn-primary' : 'btn-outline'}`}
              style={addPlatform === 'telegram' ? { background: '#2AABEE', borderColor: '#2AABEE' } : {}}
              onClick={() => setAddPlatform('telegram')}
            >
              📱 Telegram
            </button>
            <button
              className={`btn ${addPlatform === 'max' ? 'btn-primary' : 'btn-outline'}`}
              style={addPlatform === 'max' ? { background: '#7B68EE', borderColor: '#7B68EE' } : {}}
              onClick={() => setAddPlatform('max')}
            >
              💬 MAX
            </button>
          </div>

          {/* Telegram */}
          {addPlatform === 'telegram' && (
            <div className="instruction-box" style={{ padding: '16px', background: 'var(--bg-glass)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              {!user?.telegram_id ? (
                <>
                  <h4 style={{ marginBottom: '8px' }}>Подключите Telegram</h4>
                  <p style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Чтобы добавлять Telegram-каналы, сначала авторизуйтесь через Telegram-бота.
                  </p>
                  <a href={`https://t.me/${tgBotUsername}?start=auth`} target="_blank" rel="noreferrer"
                    className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#2AABEE' }}>
                    📱 Открыть бота в Telegram
                  </a>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '10px' }}>
                    Нажмите кнопку — бот автоматически пришлёт ссылку для привязки аккаунта.
                  </p>
                </>
              ) : (
                <>
                  <h4 style={{ marginBottom: '8px' }}>Добавьте бота в канал</h4>
                  <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>Откройте ваш канал → <b>Настройки</b> → <b>Администраторы</b></li>
                    <li>Добавьте бота: <code style={{ cursor: 'pointer', padding: '2px 6px', background: 'var(--bg-glass)', borderRadius: '4px' }} onClick={() => { navigator.clipboard.writeText(`@${tgBotUsername}`); showToast('Скопировано'); }}>@{tgBotUsername}</code></li>
                    <li>Дайте права: <b>чтение сообщений</b> и <b>управление подписчиками</b></li>
                    <li>Вернитесь сюда — канал появится автоматически</li>
                  </ol>
                </>
              )}
            </div>
          )}

          {/* MAX */}
          {addPlatform === 'max' && (
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
                    <li>Откройте ваш канал → <b>Настройки</b> → <b>Администраторы</b></li>
                    <li>Добавьте бота: <code style={{ cursor: 'pointer', padding: '2px 6px', background: 'var(--bg-glass)', borderRadius: '4px' }} onClick={() => { navigator.clipboard.writeText(`@${maxBotUsername}`); showToast('Скопировано'); }}>@{maxBotUsername}</code></li>
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
              <label className="form-label">OAuth Token (Яндекс.Метрика)</label>
              <input
                className="form-input"
                placeholder="y0_AgAAAA..."
                value={editChannel.ym_oauth_token || ''}
                onChange={e => setEditChannel(p => ({ ...p, ym_oauth_token: e.target.value }))}
              />
              <div className="form-hint">Нужен для отправки целей в Метрику. Получите на oauth.yandex.ru с разрешением metrika:write.</div>
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
  return (
    <div
      className={`channel-card ${isSelected ? 'selected' : ''}`}
      style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px', cursor: 'pointer',
        transition: 'var(--transition)',
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '4px' }}>
            {ch.title || ch.channel_id || ch.tracking_code}
          </h3>
          <span style={{
            fontSize: '0.72rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
            background: ch.platform === 'max' ? '#7B68EE' : '#2AABEE', color: '#fff',
          }}>
            {ch.platform === 'max' ? 'MAX' : 'TG'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={(e) => { e.stopPropagation(); onSettings(); }}>
            ⚙️
          </button>
          <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            🗑️
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <span>Подписчики: {ch.subscribers_count || 0}</span>
        <span>Визиты: {ch.visits_count || 0}</span>
      </div>
      {ch.billing_active !== undefined && (
        <div style={{ marginTop: '8px', fontSize: '0.78rem' }}>
          {ch.billing_active ? (
            <span style={{ color: 'var(--success)' }}>
              ✅ Подписка активна ({ch.billing_days_left} дн.)
            </span>
          ) : (
            <span style={{ color: 'var(--error)' }}>
              ❌ Нет подписки
            </span>
          )}
        </div>
      )}
    </div>
  );
}
