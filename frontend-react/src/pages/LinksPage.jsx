import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';

const APP_URL = window.location.origin;

export default function LinksPage() {
  const navigate = useNavigate();
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showMetrikaModal, setShowMetrikaModal] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [metrikaLink, setMetrikaLink] = useState(null);
  const [metrikaForm, setMetrikaForm] = useState({ ym_counter_id: '', ym_goal_name: '', vk_pixel_id: '', vk_goal_name: '' });
  const [form, setForm] = useState({ name: '', link_type: 'landing', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', lm_title: '', lm_description: '', lm_description_align: 'left', lm_button_text: 'Получить бесплатно', lm_lead_magnet_id: '' });
  const [saving, setSaving] = useState(false);
  const [leadMagnets, setLeadMagnets] = useState([]);
  const [lmImageFile, setLmImageFile] = useState(null);
  const [aiLandings, setAiLandings] = useState([]);
  const [expandedStats, setExpandedStats] = useState({});
  const [dailyStats, setDailyStats] = useState({});

  const tc = currentChannel?.tracking_code;

  const loadLinks = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/links/${tc}`);
      if (data.success) setLinks(data.links || []);
    } catch {
      showToast('Ошибка загрузки ссылок', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => { loadLinks(); }, [loadLinks]);
  useEffect(() => {
    if (!tc) return;
    api.get(`/pins/${tc}/lead-magnets`).then(d => { if (d.success) setLeadMagnets(d.lead_magnets || d.leadMagnets || []); }).catch(() => {});
    api.get(`/ai-landing/${tc}/landings`).then(d => { if (d.success) setAiLandings((d.landings || []).filter(l => l.status === 'generated' || l.status === 'published')); }).catch(() => {});
  }, [tc]);

  const openCreate = () => {
    setEditingLink(null);
    setLmImageFile(null);
    setForm({ name: '', link_type: 'landing', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', lm_title: '', lm_description: '', lm_description_align: 'left', lm_button_text: 'Получить бесплатно', lm_lead_magnet_id: '' });
    setShowModal(true);
  };

  const openEdit = (link) => {
    setEditingLink(link);
    setForm({
      name: link.name || '',
      link_type: link.link_type || 'landing',
      utm_source: link.utm_source || '',
      utm_medium: link.utm_medium || '',
      utm_campaign: link.utm_campaign || '',
      utm_content: link.utm_content || '',
      utm_term: link.utm_term || '',
      lm_title: link.lm_title || '',
      lm_description: link.lm_description || '',
      lm_description_align: link.lm_description_align || 'left',
      lm_button_text: link.lm_button_text || 'Получить бесплатно',
      lm_lead_magnet_id: link.lm_lead_magnet_id || '',
    });
    setShowModal(true);
  };

  const openMetrika = (link) => {
    setMetrikaLink(link);
    setMetrikaForm({
      ym_counter_id: link.ym_counter_id || currentChannel?.yandex_metrika_id || '',
      ym_goal_name: link.ym_goal_name || 'subscribe_channel',
      vk_pixel_id: link.vk_pixel_id || currentChannel?.vk_pixel_id || '',
      vk_goal_name: link.vk_goal_name || 'subscribe_channel',
    });
    setShowMetrikaModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Введите название ссылки', 'error');
      return;
    }
    setSaving(true);
    try {
      let data;
      const cleanForm = { ...form };
      if (editingLink) {
        data = await api.put(`/links/${tc}/${editingLink.id}`, cleanForm);
      } else {
        data = await api.post(`/links/${tc}`, cleanForm);
      }
      if (data.success) {
        // Upload image if selected
        const linkId = data.link?.id || editingLink?.id;
        if (lmImageFile && linkId) {
          try {
            const fd = new FormData(); fd.append('file', lmImageFile);
            await api.upload(`/links/${tc}/${linkId}/lm-image`, fd);
          } catch {}
          setLmImageFile(null);
        }
        showToast(editingLink ? 'Ссылка обновлена' : 'Ссылка создана');
        setShowModal(false);
        loadLinks();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMetrika = async () => {
    if (!metrikaLink) return;
    setSaving(true);
    try {
      const data = await api.put(`/links/${tc}/${metrikaLink.id}/metrika`, metrikaForm);
      if (data.success) {
        showToast('Метрика обновлена');
        setShowMetrikaModal(false);
        loadLinks();
      }
    } catch {
      showToast('Ошибка сохранения метрики', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async (link) => {
    try {
      const data = await api.patch(`/links/${tc}/${link.id}/pause`);
      if (data.success) {
        showToast(data.is_paused ? 'Ссылка приостановлена' : 'Ссылка активирована');
        loadLinks();
      }
    } catch {
      showToast('Ошибка', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить ссылку?')) return;
    try {
      const data = await api.delete(`/links/${tc}/${id}`);
      if (data.success) {
        showToast('Ссылка удалена');
        loadLinks();
      }
    } catch {
      showToast('Ошибка удаления', 'error');
    }
  };

  const copyLink = (shortCode) => {
    const url = `${APP_URL}/go/${shortCode}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Ссылка скопирована');
    }).catch(() => {
      showToast('Не удалось скопировать', 'error');
    });
  };

  return (
    <Paywall>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h2>Трекинг-ссылки</h2>
          <button className="btn btn-primary" onClick={openCreate}>+ Создать ссылку</button>
        </div>

        {loading ? <Loading /> : links.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            Нет ссылок. Создайте первую трекинг-ссылку.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {links.map(link => (
              <div key={link.id} style={{
                background: 'var(--bg-glass)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '16px',
                opacity: link.is_paused ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{link.name || '—'}</span>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '12px',
                        fontSize: '0.72rem', fontWeight: 500,
                        background: link.link_type === 'direct' ? 'rgba(59,130,246,0.15)' : link.link_type === 'lm_landing' ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.15)',
                        color: link.link_type === 'direct' ? '#3b82f6' : link.link_type === 'lm_landing' ? '#22c55e' : '#8b5cf6',
                      }}>
                        {link.link_type === 'direct' ? 'Прямая' : link.link_type === 'lm_landing' ? 'Лид-магнит' : 'Лендинг'}
                      </span>
                      {link.is_paused ? (
                        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                          Пауза
                        </span>
                      ) : null}
                    </div>
                    <code style={{ fontSize: '0.8rem', cursor: 'pointer', color: 'var(--primary)' }}
                      onClick={() => copyLink(link.short_code)} title="Нажмите чтобы скопировать">
                      {APP_URL}/go/{link.short_code}
                    </code>
                    {link.link_type === 'direct' && currentChannel?.platform === 'max' && (
                      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <code style={{ fontSize: '0.75rem', cursor: 'pointer', color: '#7B68EE' }}
                          onClick={() => { navigator.clipboard.writeText(`https://max.ru/${import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot'}?startapp=go_${link.short_code}`); showToast('Ссылка для ПК скопирована'); }}
                          title="MiniApp ссылка (ПК)">
                          ПК: max.ru/{import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot'}?startapp=go_{link.short_code}
                        </code>
                        <code style={{ fontSize: '0.75rem', cursor: 'pointer', color: '#9B7DFF' }}
                          onClick={() => { navigator.clipboard.writeText(`https://max.ru/${import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot'}?start=go_${link.short_code}`); showToast('Ссылка для мобильного скопирована'); }}
                          title="Бот-ссылка (мобильное)">
                          Моб: max.ru/{import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot'}?start=go_{link.short_code}
                        </code>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>Визиты: <b>{link.visit_count ?? 0}</b></span>
                      <span>Подписки: <b>{link.sub_count ?? 0}</b></span>
                      {link.utm_source && <span>UTM: {link.utm_source}</span>}
                      {link.ym_counter_id && <span>YM: {link.ym_counter_id}</span>}
                      {link.vk_pixel_id && <span>VK: {link.vk_pixel_id}</span>}
                      <button onClick={async () => {
                        const isOpen = expandedStats[link.id];
                        setExpandedStats(p => ({ ...p, [link.id]: !isOpen }));
                        if (!isOpen && !dailyStats[link.id]) {
                          try {
                            const data = await api.get(`/links/${tc}/${link.id}/daily-stats`);
                            if (data.success) setDailyStats(p => ({ ...p, [link.id]: data.days || [] }));
                          } catch {}
                        }
                      }} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 500,
                      }}>
                        {expandedStats[link.id] ? 'Скрыть статистику ▲' : 'По дням ▼'}
                      </button>
                    </div>
                    {expandedStats[link.id] && (
                      <div style={{ marginTop: 10, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                        {!(dailyStats[link.id]?.length) ? (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Нет данных</span>
                        ) : <DailyChart data={dailyStats[link.id]} />}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline" style={btnSmall} onClick={() => copyLink(link.short_code)}>
                      Копировать
                    </button>
                    <button className="btn btn-outline" style={btnSmall} onClick={() => openEdit(link)}>
                      Ред.
                    </button>
                    {(link.link_type === 'landing' || link.link_type === 'lm_landing') && (
                      <button className="btn btn-outline" style={btnSmall} onClick={() => openMetrika(link)}>
                        Пиксели
                      </button>
                    )}
                    <button className="btn btn-outline" style={btnSmall} onClick={() => handleTogglePause(link)}>
                      {link.is_paused ? 'Вкл' : 'Пауза'}
                    </button>
                    <button className="btn btn-danger" style={btnSmall} onClick={() => handleDelete(link.id)}>
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AI Landings */}
        {aiLandings.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>ИИ Лендинги</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {aiLandings.map(l => {
                const url = `${APP_URL}/land/${l.slug}`;
                return (
                  <div key={`ail_${l.id}`} style={{
                    background: 'var(--bg-glass)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{l.niche || 'ИИ Лендинг'}</span>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: '12px',
                            fontSize: '0.72rem', fontWeight: 500,
                            background: 'rgba(123,104,238,0.15)', color: '#7B68EE',
                          }}>ИИ Лендинг</span>
                          <span style={{
                            fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px',
                            background: l.published ? 'rgba(16,185,129,0.15)' : 'rgba(244,162,97,0.15)',
                            color: l.published ? '#10B981' : '#f4a261',
                          }}>{l.published ? 'Опубликован' : 'Готов'}</span>
                        </div>
                        <code style={{ fontSize: '0.8rem', cursor: 'pointer', color: 'var(--primary)' }}
                          onClick={() => { navigator.clipboard.writeText(url); showToast('Ссылка скопирована'); }}
                          title="Нажмите чтобы скопировать">
                          {url}
                        </code>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {l.design_style && <span>Стиль: {l.design_style}</span>}
                          <span>{l.created_at ? new Date(l.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button className="btn btn-outline" style={btnSmall}
                          onClick={() => { navigator.clipboard.writeText(url); showToast('Ссылка скопирована'); }}>
                          Копировать
                        </button>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="btn btn-outline" style={{ ...btnSmall, textDecoration: 'none' }}>
                          Открыть
                        </a>
                        <button className="btn btn-outline" style={btnSmall}
                          onClick={() => navigate('/ai-landing')}>
                          Редактировать
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Create/Edit Link Modal */}
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingLink ? 'Редактировать ссылку' : 'Создать ссылку'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Название ссылки *</label>
              <input className="form-input" placeholder="Рекламный пост в канале" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            {!editingLink && (
              <div>
                <label className="form-label">Тип ссылки</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <label style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: '14px 10px', borderRadius: 'var(--radius)',
                    border: `2px solid ${form.link_type === 'landing' ? 'var(--primary)' : 'var(--border)'}`,
                    cursor: 'pointer', background: form.link_type === 'landing' ? 'rgba(139,92,246,0.08)' : 'transparent',
                    transition: 'all 0.2s',
                  }}>
                    <input type="radio" name="link_type" value="landing" checked={form.link_type === 'landing'}
                      onChange={() => setForm(p => ({ ...p, link_type: 'landing' }))} style={{ display: 'none' }} />
                    <span style={{ fontSize: '1.5rem' }}>&#128196;</span>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Лендинг</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Страница подписки + Яндекс Метрика
                    </span>
                  </label>
                  <label style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: '14px 10px', borderRadius: 'var(--radius)',
                    border: `2px solid ${form.link_type === 'direct' ? 'var(--primary)' : 'var(--border)'}`,
                    cursor: 'pointer', background: form.link_type === 'direct' ? 'rgba(59,130,246,0.08)' : 'transparent',
                    transition: 'all 0.2s',
                  }}>
                    <input type="radio" name="link_type" value="direct" checked={form.link_type === 'direct'}
                      onChange={() => setForm(p => ({ ...p, link_type: 'direct' }))} style={{ display: 'none' }} />
                    <span style={{ fontSize: '1.5rem' }}>&#128279;</span>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Прямая</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Переход в канал, внутренняя статистика
                    </span>
                  </label>
                  <label style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: '14px 10px', borderRadius: 'var(--radius)',
                    border: `2px solid ${form.link_type === 'lm_landing' ? 'var(--primary)' : 'var(--border)'}`,
                    cursor: 'pointer', background: form.link_type === 'lm_landing' ? 'rgba(34,197,94,0.08)' : 'transparent',
                    transition: 'all 0.2s',
                  }}>
                    <input type="radio" name="link_type" value="lm_landing" checked={form.link_type === 'lm_landing'}
                      onChange={() => setForm(p => ({ ...p, link_type: 'lm_landing' }))} style={{ display: 'none' }} />
                    <span style={{ fontSize: '1.5rem' }}>🎁</span>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Лид-магнит</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Страница с подарком + подписка
                    </span>
                  </label>
                  <div onClick={() => { setShowModal(false); navigate('/ai-landing'); }} style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: '14px 10px', borderRadius: 'var(--radius)',
                    border: '2px solid var(--border)',
                    cursor: 'pointer', background: 'transparent',
                    transition: 'all 0.2s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#7B68EE'; e.currentTarget.style.background = 'rgba(123,104,238,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ fontSize: '1.5rem' }}>🌐</span>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>ИИ Лендинг</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Генерация HTML страницы с ИИ
                    </span>
                  </div>
                </div>
              </div>
            )}
            {form.link_type === 'landing' && !editingLink && (
              <div style={{ padding: '12px', background: 'rgba(139,92,246,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Лендинг-ссылка откроет страницу подписки. Для отслеживания конверсий через Яндекс Метрику
                  укажите ID счётчика в настройках канала или на конкретной ссылке (кнопка «Пиксели»).
                </p>
              </div>
            )}
            {form.link_type === 'lm_landing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px', background: 'rgba(34,197,94,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Страница с описанием лид-магнита. После подписки на канал пользователь получает материал через бота.
                </p>
                <div>
                  <label className="form-label">Изображение</label>
                  {(editingLink?.lm_image_url) && (
                    <img src={editingLink.lm_image_url} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 8, border: '1px solid var(--border)' }} />
                  )}
                  {lmImageFile && (
                    <img src={URL.createObjectURL(lmImageFile)} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 8, border: '1px solid var(--border)' }} />
                  )}
                  <input type="file" accept="image/*" className="form-input" style={{ padding: 8 }}
                    onChange={e => setLmImageFile(e.target.files?.[0] || null)} />
                  <div className="form-hint">JPG, PNG, WebP. Отображается вверху страницы лид-магнита.</div>
                </div>
                <div>
                  <label className="form-label">Заголовок</label>
                  <input className="form-input" placeholder="Бесплатный гайд по маркетингу" value={form.lm_title || ''}
                    onChange={e => setForm(p => ({ ...p, lm_title: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Описание</label>
                  <textarea className="form-input" rows={4} placeholder="Описание того, что получит пользователь..." value={form.lm_description || ''}
                    onChange={e => setForm(p => ({ ...p, lm_description: e.target.value }))} />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    {['left', 'center', 'right'].map(a => (
                      <button key={a} type="button" className={`btn ${(form.lm_description_align || 'left') === a ? 'btn-primary' : 'btn-outline'}`}
                        style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                        onClick={() => setForm(p => ({ ...p, lm_description_align: a }))}>
                        {a === 'left' ? '⬅' : a === 'center' ? '⬛' : '➡'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="form-label">Текст на кнопке</label>
                  <input className="form-input" placeholder="Получить бесплатно" value={form.lm_button_text || ''}
                    onChange={e => setForm(p => ({ ...p, lm_button_text: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Лид-магнит (выдаётся после подписки)</label>
                  <select className="form-input" value={form.lm_lead_magnet_id || ''}
                    onChange={e => setForm(p => ({ ...p, lm_lead_magnet_id: e.target.value }))}>
                    <option value="">— Выберите лид-магнит —</option>
                    {leadMagnets.map(lm => (
                      <option key={lm.id} value={lm.id}>{lm.title} ({lm.code})</option>
                    ))}
                  </select>
                  <div className="form-hint">Создайте лид-магнит в разделе «Закрепы → Лид-магниты»</div>
                </div>
              </div>
            )}
            <div>
              <label className="form-label">UTM Source</label>
              <input className="form-input" placeholder="telegram" value={form.utm_source}
                onChange={e => setForm(p => ({ ...p, utm_source: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">UTM Medium</label>
              <input className="form-input" placeholder="post" value={form.utm_medium}
                onChange={e => setForm(p => ({ ...p, utm_medium: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">UTM Campaign</label>
              <input className="form-input" placeholder="spring_sale" value={form.utm_campaign}
                onChange={e => setForm(p => ({ ...p, utm_campaign: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">UTM Content</label>
              <input className="form-input" placeholder="banner_1" value={form.utm_content}
                onChange={e => setForm(p => ({ ...p, utm_content: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">UTM Term</label>
              <input className="form-input" placeholder="keyword" value={form.utm_term}
                onChange={e => setForm(p => ({ ...p, utm_term: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Metrika Settings Modal */}
        <Modal isOpen={showMetrikaModal} onClose={() => setShowMetrikaModal(false)} title="Аналитика и пиксели">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px', background: 'rgba(139,92,246,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                Счётчики автоматически устанавливаются на страницу подписки. При подписке отправляется событие (цель).
              </p>
            </div>

            <h4 style={{ margin: '4px 0 0', fontSize: '0.9rem' }}>Яндекс Метрика</h4>
            <div>
              <label className="form-label">ID счётчика</label>
              <input className="form-input" placeholder="12345678" value={metrikaForm.ym_counter_id}
                onChange={e => setMetrikaForm(p => ({ ...p, ym_counter_id: e.target.value }))} />
              {currentChannel?.yandex_metrika_id && !metrikaForm.ym_counter_id && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Используется счётчик канала: {currentChannel.yandex_metrika_id}
                </p>
              )}
            </div>
            <div>
              <label className="form-label">Название цели</label>
              <input className="form-input" placeholder="subscribe_channel" value={metrikaForm.ym_goal_name}
                onChange={e => setMetrikaForm(p => ({ ...p, ym_goal_name: e.target.value }))} />
            </div>

            <h4 style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>Пиксель VK Рекламы</h4>
            <div>
              <label className="form-label">ID пикселя VK</label>
              <input className="form-input" placeholder="3751584" value={metrikaForm.vk_pixel_id}
                onChange={e => setMetrikaForm(p => ({ ...p, vk_pixel_id: e.target.value }))} />
              {currentChannel?.vk_pixel_id && !metrikaForm.vk_pixel_id && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Используется пиксель канала: {currentChannel.vk_pixel_id}
                </p>
              )}
            </div>
            <div>
              <label className="form-label">Название цели VK</label>
              <input className="form-input" placeholder="subscribe_channel" value={metrikaForm.vk_goal_name}
                onChange={e => setMetrikaForm(p => ({ ...p, vk_goal_name: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowMetrikaModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSaveMetrika} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Paywall>
  );
}

const btnSmall = { padding: '4px 10px', fontSize: '0.8rem' };

function DailyChart({ data }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [hover, setHover] = useState(null);
  const chartRef = useRef(null);

  // Текущий отображаемый месяц
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = viewDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

  // Заполняем все дни месяца
  const dataMap = {};
  data.forEach(d => { if (d.day) dataMap[d.day.slice(0, 10)] = d; });

  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const d = dataMap[key];
    days.push({ day: i, visits: d?.visits || 0, subs: d?.subs || 0 });
  }

  const maxVal = Math.max(...days.map(d => Math.max(d.visits, d.subs)), 1);
  const totalV = days.reduce((a, d) => a + d.visits, 0);
  const totalS = days.reduce((a, d) => a + d.subs, 0);
  const cr = totalV > 0 ? ((totalS / totalV) * 100).toFixed(1) : '0';

  // SVG line chart
  const w = 500;
  const h = 100;
  const pad = { top: 4, bottom: 4, left: 0, right: 0 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const toX = (i) => pad.left + (i / (daysInMonth - 1)) * cw;
  const toY = (v) => pad.top + ch - (v / maxVal) * ch;

  const makePath = (key) => {
    return days.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(' ');
  };
  const makeArea = (key) => {
    const line = days.map((d, i) => `${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(' L');
    return `M${toX(0).toFixed(1)},${(pad.top + ch).toFixed(1)} L${line} L${toX(daysInMonth - 1).toFixed(1)},${(pad.top + ch).toFixed(1)} Z`;
  };

  const visitPath = makePath('visits');
  const subsPath = makePath('subs');
  const visitArea = makeArea('visits');
  const subsArea = makeArea('subs');

  // Даты для оси X
  const xLabels = [1, Math.ceil(daysInMonth / 4), Math.ceil(daysInMonth / 2), Math.ceil(daysInMonth * 3 / 4), daysInMonth];

  return (
    <div>
      {/* Переключатель месяца + сводка */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setMonthOffset(p => p + 1)} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', color: 'var(--text-secondary)',
          }}>&#8249;</button>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, minWidth: 130, textAlign: 'center', textTransform: 'capitalize' }}>{monthLabel}</span>
          <button onClick={() => setMonthOffset(p => Math.max(0, p - 1))} disabled={monthOffset === 0} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: monthOffset === 0 ? 0.3 : 1,
          }}>&#8250;</button>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          <span>Визиты: <b style={{ color: '#7B68EE' }}>{totalV}</b></span>
          <span>Подписки: <b style={{ color: '#10B981' }}>{totalS}</b></span>
          <span>CR: <b>{cr}%</b></span>
        </div>
      </div>

      {/* SVG график */}
      <div ref={chartRef} style={{ position: 'relative' }}
        onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${w} ${h + 16}`} style={{ width: '100%', height: 'auto', maxHeight: 130, display: 'block' }}
          onMouseMove={e => {
            const rect = chartRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = ((e.clientX - rect.left) / rect.width) * w;
            const idx = Math.round(((x - pad.left) / cw) * (daysInMonth - 1));
            if (idx >= 0 && idx < daysInMonth && days[idx]) {
              const pct = (e.clientX - rect.left) / rect.width * 100;
              setHover({ idx, pct });
            }
          }}>
          <defs>
            <linearGradient id="gVisit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7B68EE" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#7B68EE" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gSubs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map(r => (
            <line key={r} x1={pad.left} x2={w - pad.right} y1={pad.top + ch * (1 - r)} y2={pad.top + ch * (1 - r)}
              stroke="var(--border, #e0e0e0)" strokeWidth="0.5" strokeDasharray="4,4" />
          ))}
          <path d={visitArea} fill="url(#gVisit)" />
          <path d={subsArea} fill="url(#gSubs)" />
          <path d={visitPath} fill="none" stroke="#7B68EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={subsPath} fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Hover vertical line */}
          {hover && (
            <line x1={toX(hover.idx)} x2={toX(hover.idx)} y1={pad.top} y2={pad.top + ch}
              stroke="var(--text-secondary, #999)" strokeWidth="0.8" strokeDasharray="3,3" />
          )}
          {/* Dots */}
          {days.map((d, i) => {
            const isHovered = hover?.idx === i;
            return [
              d.visits > 0 && <circle key={`v${i}`} cx={toX(i)} cy={toY(d.visits)} r={isHovered ? 4 : 2.5} fill="#7B68EE" opacity={isHovered ? 1 : 0.8} />,
              d.subs > 0 && <circle key={`s${i}`} cx={toX(i)} cy={toY(d.subs)} r={isHovered ? 4 : 2.5} fill="#10B981" opacity={isHovered ? 1 : 0.8} />,
              isHovered && d.visits === 0 && <circle key={`vh${i}`} cx={toX(i)} cy={toY(0)} r={3} fill="#7B68EE" opacity={0.4} />,
              isHovered && d.subs === 0 && <circle key={`sh${i}`} cx={toX(i)} cy={toY(0)} r={3} fill="#10B981" opacity={0.4} />,
            ];
          })}
          {xLabels.map(d => (
            <text key={d} x={toX(d - 1)} y={h + 12} textAnchor="middle" fontSize="9" fill="var(--text-secondary, #aaa)">{d}</text>
          ))}
        </svg>
        {/* Tooltip */}
        {hover && days[hover.idx] && (
          <div style={{
            position: 'absolute', top: 0,
            left: `${hover.pct}%`, transform: hover.pct > 75 ? 'translateX(-100%)' : 'translateX(-50%)',
            background: 'var(--bg-primary, #fff)', border: '1px solid var(--border, #e0e0e0)',
            borderRadius: 8, padding: '6px 10px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            fontSize: '0.75rem', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>
              {days[hover.idx].day} {monthLabel}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: '#7B68EE' }}>Визиты: <b>{days[hover.idx].visits}</b></span>
              <span style={{ color: '#10B981' }}>Подписки: <b>{days[hover.idx].subs}</b></span>
            </div>
          </div>
        )}
      </div>

      {/* Легенда */}
      <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 2, borderRadius: 1, background: '#7B68EE', display: 'inline-block' }} /> Визиты
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 2, borderRadius: 1, background: '#10B981', display: 'inline-block' }} /> Подписки
        </span>
      </div>
    </div>
  );
}
