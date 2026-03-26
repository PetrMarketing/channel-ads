import { useState, useEffect, useCallback } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';

const APP_URL = window.location.origin;

export default function LinksPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showMetrikaModal, setShowMetrikaModal] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [metrikaLink, setMetrikaLink] = useState(null);
  const [metrikaForm, setMetrikaForm] = useState({ ym_counter_id: '', ym_goal_name: '', vk_pixel_id: '', vk_goal_name: '' });
  const [form, setForm] = useState({ name: '', link_type: 'landing', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' });
  const [saving, setSaving] = useState(false);

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

  const openCreate = () => {
    setEditingLink(null);
    setForm({ name: '', link_type: 'landing', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' });
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
      if (editingLink) {
        data = await api.put(`/links/${tc}/${editingLink.id}`, form);
      } else {
        data = await api.post(`/links/${tc}`, form);
      }
      if (data.success) {
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
                        background: link.link_type === 'direct' ? 'rgba(59,130,246,0.15)' : 'rgba(139,92,246,0.15)',
                        color: link.link_type === 'direct' ? '#3b82f6' : '#8b5cf6',
                      }}>
                        {link.link_type === 'direct' ? 'Прямая' : 'Лендинг'}
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
                    <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <span>Визиты: <b>{link.visit_count ?? 0}</b></span>
                      <span>Подписки: <b>{link.sub_count ?? 0}</b></span>
                      {link.utm_source && <span>UTM: {link.utm_source}</span>}
                      {link.ym_counter_id && <span>YM: {link.ym_counter_id}</span>}
                      {link.vk_pixel_id && <span>VK: {link.vk_pixel_id}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline" style={btnSmall} onClick={() => copyLink(link.short_code)}>
                      Копировать
                    </button>
                    <button className="btn btn-outline" style={btnSmall} onClick={() => openEdit(link)}>
                      Ред.
                    </button>
                    {link.link_type === 'landing' && (
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
                </div>
              </div>
            )}
            {form.link_type === 'landing' && !editingLink && (
              <div style={{ padding: '12px', background: 'rgba(139,92,246,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Лендинг-ссылка откроет страницу подписки. Для отслеживания конверсий через Яндекс Метрику
                  укажите ID счётчика в настройках канала или на конкретной ссылке (кнопка «Метрика»).
                </p>
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
