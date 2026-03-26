import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import { api } from '../services/api';

export default function CommentsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;

  const [tab, setTab] = useState('comments');
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ primary_color: '#4F46E5', header_text: '' });
  const [savingSettings, setSavingSettings] = useState(false);

  const loadComments = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/comments/${tc}`);
      if (data.success) setComments(data.comments || []);
    } catch {}
    finally { setLoading(false); }
  }, [tc]);

  const loadSettings = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/comments/${tc}/settings`);
      if (data.success && data.settings) setSettings(s => ({ ...s, ...data.settings }));
    } catch {}
  }, [tc]);

  useEffect(() => {
    if (tab === 'comments') loadComments();
    if (tab === 'settings') loadSettings();
  }, [tab, tc]);

  const deleteComment = async (id) => {
    if (!window.confirm('Удалить комментарий?')) return;
    try {
      await api.delete(`/comments/${tc}/${id}`);
      showToast('Комментарий удалён');
      loadComments();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put(`/comments/${tc}/settings`, settings);
      showToast('Настройки сохранены');
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingSettings(false); }
  };

  if (!currentChannel) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📢</div>
          <h3>Выберите канал</h3>
        </div>
      </div>
    );
  }

  const colors = ['#4F46E5', '#7C3AED', '#2563EB', '#0891B2', '#059669', '#D97706', '#DC2626'];

  return (
    <div>
      <div className="page-header"><h1>Комментарии</h1></div>

      <div className="pc-tabs">
        <button className={`pc-tab ${tab === 'comments' ? 'active' : ''}`} onClick={() => setTab('comments')}>Комментарии</button>
        <button className={`pc-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Оформление</button>
      </div>

      {tab === 'comments' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Загрузка...</div>
          ) : comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
              Нет комментариев. Добавьте кнопку «Комментарии» к постам.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comments.map(c => {
                const color = colors[(c.user_name || '').charCodeAt(0) % colors.length];
                return (
                  <div key={c.id} style={{
                    display: 'flex', gap: 12, padding: '12px 16px',
                    background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', background: color, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
                    }}>
                      {(c.user_name || 'А')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '0.9rem' }}>{c.user_name || 'Аноним'}</strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: 8 }}>
                            {c.created_at ? new Date(c.created_at).toLocaleString('ru-RU') : ''}
                          </span>
                        </div>
                        <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => deleteComment(c.id)}>Удалить</button>
                      </div>
                      <div style={{ fontSize: '0.88rem', marginTop: 4, lineHeight: 1.5 }}>{c.comment_text}</div>
                      {c.post_title && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                          Пост: {c.post_title}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div style={{ maxWidth: 500 }}>
          <div className="pc-info-box" style={{ marginBottom: 16 }}>
            Настройте внешний вид мини-приложения комментариев. Эти настройки применяются ко всем постам канала.
          </div>
          <div className="form-group">
            <label className="form-label">Основной цвет</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={settings.primary_color || '#4F46E5'}
                onChange={e => setSettings(s => ({ ...s, primary_color: e.target.value }))}
                style={{ width: 40, height: 36, border: 'none', cursor: 'pointer' }} />
              <input className="form-input" value={settings.primary_color || ''}
                onChange={e => setSettings(s => ({ ...s, primary_color: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Заголовок</label>
            <input className="form-input" value={settings.header_text || ''}
              onChange={e => setSettings(s => ({ ...s, header_text: e.target.value }))}
              placeholder="Комментарии" />
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={saveSettings} disabled={savingSettings}>
            {savingSettings ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      )}
    </div>
  );
}
