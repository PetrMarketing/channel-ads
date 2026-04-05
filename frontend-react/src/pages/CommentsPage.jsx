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
  const [replyTo, setReplyTo] = useState(null); // { id, user_name }
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [settings, setSettings] = useState({
    primary_color: '#4F46E5', header_text: '',
    header_text_color: '#ffffff', page_text_color: '#1f2937',
    // Header bg
    bg_type: 'color', bg_color: '#4F46E5',
    gradient_from: '#4F46E5', gradient_to: '#7C3AED', gradient_direction: '135deg',
    bg_image_url: '', overlay_opacity: 40, overlay_color: '#000000', blur: 0,
    // Page bg
    page_bg_type: 'color', page_bg_color: '#ffffff',
    page_gradient_from: '#f5f5f5', page_gradient_to: '#e0e7ff', page_gradient_direction: '180deg',
    page_bg_image_url: '', page_overlay_opacity: 20, page_blur: 0,
  });
  const [bgFile, setBgFile] = useState(null);
  const [pageBgFile, setPageBgFile] = useState(null);
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
      if (data.success && data.settings) {
        // Filter out numeric keys (corrupted data)
        const clean = {};
        for (const [k, v] of Object.entries(data.settings)) {
          if (!/^\d+$/.test(k)) clean[k] = v;
        }
        setSettings(s => ({ ...s, ...clean }));
      }
    } catch {}
  }, [tc]);

  useEffect(() => {
    if (tab === 'comments') loadComments();
  }, [tab, tc]);

  // Always load settings on mount
  useEffect(() => { loadSettings(); }, [loadSettings]);

  const deleteComment = async (id) => {
    if (!window.confirm('Удалить комментарий?')) return;
    try {
      await api.delete(`/comments/${tc}/${id}`);
      showToast('Комментарий удалён');
      loadComments();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const sendReply = async () => {
    if (!replyTo || !replyText.trim()) return;
    setReplying(true);
    try {
      await api.post(`/comments/${tc}/${replyTo.id}/reply`, { text: replyText });
      showToast('Ответ отправлен');
      setReplyTo(null);
      setReplyText('');
      loadComments();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setReplying(false); }
  };

  const saveSettings = async () => {
    if (!tc) { showToast('Канал не выбран', 'error'); return; }
    setSavingSettings(true);
    try {
      // Upload bg files first if needed
      if (bgFile) {
        const fd = new FormData(); fd.append('file', bgFile); fd.append('target', 'header');
        const r = await api.upload(`/comments/${tc}/settings/upload-bg`, fd);
        if (r.success) { setSettings(s => ({ ...s, bg_image_url: r.url })); settings.bg_image_url = r.url; }
        setBgFile(null);
      }
      if (pageBgFile) {
        const fd = new FormData(); fd.append('file', pageBgFile); fd.append('target', 'page');
        const r = await api.upload(`/comments/${tc}/settings/upload-bg`, fd);
        if (r.success) { setSettings(s => ({ ...s, page_bg_image_url: r.url })); settings.page_bg_image_url = r.url; }
        setPageBgFile(null);
      }
      // Save settings JSON (without file objects)
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
                      {c.reply_to_name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          ↩ Ответ для {c.reply_to_name}
                        </div>
                      )}
                      <div style={{ fontSize: '0.88rem', marginTop: 4, lineHeight: 1.5 }}>{c.comment_text}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {c.post_title && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Пост: {c.post_title}
                          </span>
                        )}
                        <button style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                          onClick={() => { setReplyTo({ id: c.id, user_name: c.user_name }); setReplyText(''); }}>
                          Ответить
                        </button>
                      </div>
                      {replyTo?.id === c.id && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                          <input className="form-input" style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }}
                            placeholder={`Ответ для ${c.user_name}...`}
                            value={replyText} onChange={e => setReplyText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
                            autoFocus />
                          <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                            onClick={sendReply} disabled={replying || !replyText.trim()}>
                            {replying ? '...' : '→'}
                          </button>
                          <button className="btn btn-outline" style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                            onClick={() => setReplyTo(null)}>✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notification toggle */}
          <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={settings.notify_comments || false}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    setSettings(s => ({ ...s, notify_comments: val }));
                    try { await api.put(`/comments/${tc}/settings`, { ...settings, notify_comments: val }); showToast(val ? 'Уведомления включены' : 'Уведомления выключены'); } catch {}
                  }} />
                Уведомлять о новых комментариях
              </label>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2, marginLeft: 24 }}>
                Новые комментарии будут приходить в MAX бота
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'settings' && (() => {
        const s = settings;
        const bgStyle = s.bg_type === 'gradient'
          ? { background: `linear-gradient(${s.gradient_direction || '135deg'}, ${s.gradient_from || '#4F46E5'}, ${s.gradient_to || '#7C3AED'})` }
          : s.bg_type === 'image' && (bgFile || s.bg_image_url)
            ? { backgroundImage: `url(${bgFile ? URL.createObjectURL(bgFile) : s.bg_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: s.bg_color || '#ffffff' };
        const hexToRgb = (hex) => { const m = (hex||'#000000').replace('#','').match(/.{2}/g); return m ? m.map(x=>parseInt(x,16)).join(',') : '0,0,0'; };
        const overlayStyle = s.bg_type === 'image' ? {
          position: 'absolute', inset: 0, background: `rgba(${hexToRgb(s.overlay_color)},${(s.overlay_opacity || 40) / 100})`,
          backdropFilter: s.blur ? `blur(${s.blur}px)` : 'none', WebkitBackdropFilter: s.blur ? `blur(${s.blur}px)` : 'none',
        } : null;
        const colorSwatch = (val, onChange) => (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 6, background: val, border: '1px solid var(--border)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
              <input type="color" value={val} onChange={onChange}
                style={{ position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', cursor: 'pointer', opacity: 0 }} />
            </div>
            <input className="form-input" value={val} onChange={onChange} style={{ width: 100 }} />
          </div>
        );
        return (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <div className="pc-info-box" style={{ marginBottom: 16 }}>
                Настройте внешний вид мини-приложения комментариев.
              </div>

              <div className="form-group">
                <label className="form-label">Заголовок</label>
                <input className="form-input" value={s.header_text || ''}
                  onChange={e => setSettings(p => ({ ...p, header_text: e.target.value }))}
                  placeholder="Комментарии" />
              </div>

              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Основной цвет (кнопки, акценты)</label>
                {colorSwatch(s.primary_color || '#4F46E5', e => setSettings(p => ({ ...p, primary_color: e.target.value })))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div className="form-group">
                  <label className="form-label">Цвет текста шапки</label>
                  {colorSwatch(s.header_text_color || '#ffffff', e => setSettings(p => ({ ...p, header_text_color: e.target.value })))}
                </div>
                <div className="form-group">
                  <label className="form-label">Цвет текста страницы</label>
                  {colorSwatch(s.page_text_color || '#1f2937', e => setSettings(p => ({ ...p, page_text_color: e.target.value })))}
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Тип фона шапки</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ id: 'color', label: 'Цвет' }, { id: 'gradient', label: 'Градиент' }, { id: 'image', label: 'Изображение' }].map(t => (
                    <button key={t.id} className={`btn ${s.bg_type === t.id ? 'btn-primary' : 'btn-outline'}`}
                      style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                      onClick={() => setSettings(p => ({ ...p, bg_type: t.id }))}>{t.label}</button>
                  ))}
                </div>
              </div>

              {s.bg_type === 'color' && (
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Цвет фона</label>
                  {colorSwatch(s.bg_color || '#ffffff', e => setSettings(p => ({ ...p, bg_color: e.target.value })))}
                </div>
              )}

              {s.bg_type === 'gradient' && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Цвет 1</label>
                    {colorSwatch(s.gradient_from || '#4F46E5', e => setSettings(p => ({ ...p, gradient_from: e.target.value })))}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Цвет 2</label>
                    {colorSwatch(s.gradient_to || '#7C3AED', e => setSettings(p => ({ ...p, gradient_to: e.target.value })))}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Направление</label>
                    <select className="form-input" value={s.gradient_direction || '135deg'}
                      onChange={e => setSettings(p => ({ ...p, gradient_direction: e.target.value }))}>
                      <option value="0deg">Сверху вниз</option>
                      <option value="90deg">Слева направо</option>
                      <option value="135deg">По диагонали</option>
                      <option value="180deg">Снизу вверх</option>
                      <option value="45deg">Обратная диагональ</option>
                    </select>
                  </div>
                </div>
              )}

              {s.bg_type === 'image' && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Фоновое изображение</label>
                    <input type="file" accept="image/*" className="form-input" style={{ padding: 8 }}
                      onChange={e => setBgFile(e.target.files?.[0] || null)} />
                    {s.bg_image_url && !bgFile && (
                      <img src={s.bg_image_url} alt="" style={{ width: 120, height: 60, objectFit: 'cover', borderRadius: 6, marginTop: 6 }} />
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Цвет затемнения</label>
                    {colorSwatch(s.overlay_color || '#000000', e => setSettings(p => ({ ...p, overlay_color: e.target.value })))}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Интенсивность затемнения: {s.overlay_opacity || 40}%</label>
                    <input type="range" min="20" max="100" value={s.overlay_opacity || 40}
                      onChange={e => setSettings(p => ({ ...p, overlay_opacity: parseInt(e.target.value) }))}
                      style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      <span>20%</span><span>100%</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Размытие: {s.blur || 0}%</label>
                    <input type="range" min="0" max="100" value={Math.round((s.blur || 0) / 20 * 100)}
                      onChange={e => setSettings(p => ({ ...p, blur: Math.round(parseInt(e.target.value) / 100 * 20) }))}
                      style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      <span>0%</span><span>100%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Page background */}
              <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: '0.95rem' }}>Фон страницы</h4>
              <div className="form-group">
                <label className="form-label">Тип фона</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ id: 'color', label: 'Цвет' }, { id: 'gradient', label: 'Градиент' }, { id: 'image', label: 'Изображение' }].map(t => (
                    <button key={t.id} className={`btn ${s.page_bg_type === t.id ? 'btn-primary' : 'btn-outline'}`}
                      style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                      onClick={() => setSettings(p => ({ ...p, page_bg_type: t.id }))}>{t.label}</button>
                  ))}
                </div>
              </div>
              {s.page_bg_type === 'color' && (
                <div className="form-group" style={{ marginTop: 8 }}>
                  <label className="form-label">Цвет фона</label>
                  {colorSwatch(s.page_bg_color || '#ffffff', e => setSettings(p => ({ ...p, page_bg_color: e.target.value })))}
                </div>
              )}
              {s.page_bg_type === 'gradient' && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="form-group">
                    <label className="form-label">Цвет 1</label>
                    {colorSwatch(s.page_gradient_from || '#f5f5f5', e => setSettings(p => ({ ...p, page_gradient_from: e.target.value })))}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Цвет 2</label>
                    {colorSwatch(s.page_gradient_to || '#e0e7ff', e => setSettings(p => ({ ...p, page_gradient_to: e.target.value })))}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Направление</label>
                    <select className="form-input" value={s.page_gradient_direction || '180deg'}
                      onChange={e => setSettings(p => ({ ...p, page_gradient_direction: e.target.value }))}>
                      <option value="0deg">Сверху вниз</option>
                      <option value="90deg">Слева направо</option>
                      <option value="135deg">По диагонали</option>
                      <option value="180deg">Снизу вверх</option>
                      <option value="45deg">Обратная диагональ</option>
                    </select>
                  </div>
                </div>
              )}
              {s.page_bg_type === 'image' && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="form-group">
                    <label className="form-label">Изображение</label>
                    <input type="file" accept="image/*" className="form-input" style={{ padding: 8 }}
                      onChange={e => setPageBgFile(e.target.files?.[0] || null)} />
                    {(pageBgFile || s.page_bg_image_url) && (
                      <img src={pageBgFile ? URL.createObjectURL(pageBgFile) : s.page_bg_image_url} alt=""
                        style={{ width: 120, height: 60, objectFit: 'cover', borderRadius: 6, marginTop: 6 }} />
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Затемнение: {s.page_overlay_opacity || 20}%</label>
                    <input type="range" min="0" max="80" value={s.page_overlay_opacity || 20}
                      onChange={e => setSettings(p => ({ ...p, page_overlay_opacity: parseInt(e.target.value) }))} style={{ width: '100%' }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Размытие: {s.page_blur || 0}px</label>
                    <input type="range" min="0" max="20" value={s.page_blur || 0}
                      onChange={e => setSettings(p => ({ ...p, page_blur: parseInt(e.target.value) }))} style={{ width: '100%' }} />
                  </div>
                </div>
              )}

              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={saveSettings} disabled={savingSettings}>
                {savingSettings ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>

            {/* Preview */}
            <div style={{ width: 280, flexShrink: 0 }}>
              <label className="form-label" style={{ marginBottom: 8 }}>Предпросмотр</label>
              {(() => {
                const pageBgImg = pageBgFile ? URL.createObjectURL(pageBgFile) : s.page_bg_image_url;
                const pageBg = s.page_bg_type === 'gradient'
                  ? { background: `linear-gradient(${s.page_gradient_direction || '180deg'}, ${s.page_gradient_from || '#f5f5f5'}, ${s.page_gradient_to || '#e0e7ff'})` }
                  : s.page_bg_type === 'image' && pageBgImg
                    ? { backgroundImage: `url(${pageBgImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: s.page_bg_color || '#ffffff' };
                const pageOverlay = s.page_bg_type === 'image' && pageBgImg ? {
                  position: 'absolute', inset: 0, background: `rgba(0,0,0,${(s.page_overlay_opacity || 20) / 100})`,
                  backdropFilter: s.page_blur ? `blur(${s.page_blur}px)` : 'none',
                } : null;
                return (
              <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                {/* Header */}
                <div style={{ ...bgStyle, padding: '20px 16px', textAlign: 'center', color: s.header_text_color || '#fff', position: 'relative', minHeight: 70 }}>
                  {overlayStyle && <div style={overlayStyle} />}
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{s.header_text || 'Комментарии'}</div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{currentChannel?.title || 'Канал'}</div>
                  </div>
                </div>
                {/* Comments preview */}
                <div style={{ ...pageBg, minHeight: 120, position: 'relative' }}>
                  {pageOverlay && <div style={pageOverlay} />}
                  <div style={{ position: 'relative', zIndex: 1, padding: 12 }}>
                  {[{ name: 'Иван', text: 'Отличная статья!', color: '#4F46E5' }, { name: 'Мария', text: 'Спасибо за контент', color: '#059669' }].map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{c.name[0]}</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: s.page_text_color || '#1f2937' }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: s.page_text_color ? s.page_text_color + 'aa' : '#666' }}>{c.text}</div>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
                {/* Compose bar */}
                <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderTop: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}>
                  <div style={{ flex: 1, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 20, fontSize: 12, color: '#999', background: '#fff' }}>Написать...</div>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: s.primary_color || '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>→</div>
                </div>
              </div>
                );
              })()}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
