import { useState, useEffect, useCallback, useRef } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api, API_BASE } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import AttachmentPicker from '../components/AttachmentPicker';
import RichTextEditor from '../components/RichTextEditor';
import MessagePreview from '../components/MessagePreview';

const STATUS_LABELS = { draft: 'Черновик', active: 'Активен', finished: 'Завершён' };
const STATUS_COLORS = { draft: '#888', active: 'var(--success)', finished: '#3b82f6' };

const DEFAULT_FORM = {
  title: '',
  message_text: '',
  erid: '',
  legal_info: '',
  prizes: [''],
  conditions: { subscribe: true },
  ends_at: '',
  winner_count: 1,
};

function scrollToRef(ref) {
  if (ref?.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current.classList.add('field-shake');
    setTimeout(() => ref.current.classList.remove('field-shake'), 500);
  }
}

export default function GiveawaysPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [giveaways, setGiveaways] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [gwImage, setGwImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [publishing, setPublishing] = useState(null);

  const titleRef = useRef(null);
  const messageRef = useRef(null);

  const tc = currentChannel?.tracking_code;

  const loadGiveaways = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/giveaways/${tc}`);
      if (data.success) setGiveaways(data.giveaways || []);
    } catch {
      showToast('Ошибка загрузки розыгрышей', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => { loadGiveaways(); }, [loadGiveaways]);

  const parsePrizes = (raw) => {
    if (!raw) return [''];
    if (Array.isArray(raw)) return raw.length ? raw : [''];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : [''];
    } catch {
      return raw ? [raw] : [''];
    }
  };

  const parseConditions = (raw) => {
    if (!raw) return { subscribe: true };
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return { subscribe: true };
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ...DEFAULT_FORM, prizes: [''] });
    setGwImage(null);
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      title: item.title || '',
      message_text: item.message_text || '',
      erid: item.erid || '',
      legal_info: item.legal_info || '',
      prizes: parsePrizes(item.prizes),
      conditions: parseConditions(item.conditions),
      ends_at: item.ends_at ? item.ends_at.slice(0, 16) : '',
      winner_count: item.winner_count || 1,
    });
    setGwImage(null);
    setErrors({});
    setShowModal(true);
  };

  const validate = () => {
    if (!form.title.trim()) {
      const defaultTitle = `Розыгрыш от ${new Date().toLocaleDateString('ru-RU')}`;
      setForm(p => ({ ...p, title: defaultTitle }));
      form.title = defaultTitle;
    }
    const newErrors = {};
    if (!form.message_text.replace(/<[^>]*>/g, '').trim()) newErrors.message_text = 'Текст поста обязателен — он будет опубликован в канале';
    setErrors(newErrors);
    if (newErrors.title) { scrollToRef(titleRef); }
    else if (newErrors.message_text) { scrollToRef(messageRef); }
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        prizes: form.prizes.filter(p => p.trim()),
        ends_at: form.ends_at || null,
      };

      let data;
      if (gwImage) {
        const fd = new FormData();
        fd.append('title', payload.title);
        fd.append('message_text', payload.message_text);
        fd.append('erid', payload.erid);
        fd.append('legal_info', payload.legal_info);
        fd.append('prizes', JSON.stringify(payload.prizes));
        fd.append('conditions', JSON.stringify(payload.conditions));
        if (payload.ends_at) fd.append('ends_at', payload.ends_at);
        fd.append('winner_count', String(payload.winner_count));
        fd.append('image', gwImage);
        if (editingItem) {
          data = await api.upload(`/giveaways/${tc}/${editingItem.id}`, fd, 'PUT');
        } else {
          data = await api.upload(`/giveaways/${tc}`, fd);
        }
      } else {
        if (editingItem) {
          data = await api.put(`/giveaways/${tc}/${editingItem.id}`, payload);
        } else {
          data = await api.post(`/giveaways/${tc}`, payload);
        }
      }
      if (data.success) {
        showToast(editingItem ? 'Розыгрыш обновлён' : 'Розыгрыш создан');
        setShowModal(false);
        loadGiveaways();
      } else {
        showToast(data.detail || data.error || 'Ошибка сохранения', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить розыгрыш?')) return;
    try {
      const data = await api.delete(`/giveaways/${tc}/${id}`);
      if (data.success) { showToast('Розыгрыш удалён'); loadGiveaways(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handlePublish = async (g) => {
    if (!window.confirm('Опубликовать розыгрыш в канал?')) return;
    setPublishing(g.id);
    try {
      const data = await api.post(`/giveaways/${tc}/${g.id}/publish`);
      if (data.success) { showToast('Розыгрыш опубликован'); loadGiveaways(); }
      else showToast(data.error || 'Ошибка публикации', 'error');
    } catch { showToast('Ошибка публикации', 'error'); }
    finally { setPublishing(null); }
  };

  const handleDraw = async (g) => {
    if (!window.confirm('Определить победителя?')) return;
    try {
      const data = await api.post(`/giveaways/${tc}/${g.id}/draw`);
      if (data.success) {
        const w = data.winner;
        showToast(`Победитель: ${w.first_name || w.username || w.telegram_id}`);
        loadGiveaways();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch { showToast('Ошибка определения победителя', 'error'); }
  };

  // Prize management
  const addPrize = () => setForm(p => ({ ...p, prizes: [...p.prizes, ''] }));
  const removePrize = (idx) => setForm(p => ({ ...p, prizes: p.prizes.filter((_, i) => i !== idx) }));
  const updatePrize = (idx, val) => setForm(p => ({ ...p, prizes: p.prizes.map((pr, i) => i === idx ? val : pr) }));

  const getPrizesDisplay = (g) => {
    try {
      const list = JSON.parse(g.prizes || '[]');
      if (Array.isArray(list) && list.length) return list.filter(Boolean).join(', ');
    } catch { /* ignore */ }
    return g.prize || '';
  };

  const imagePreviewUrl = gwImage
    ? URL.createObjectURL(gwImage)
    : editingItem?.image_path
      ? `${API_BASE.replace('/api', '')}${editingItem.image_path}`
      : null;

  return (
    <Paywall>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>Розыгрыши</h2>
          <button className="btn btn-primary" onClick={openCreate}>+ Создать розыгрыш</button>
        </div>

        {loading ? <Loading /> : giveaways.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🎁</div>
            Нет розыгрышей. Создайте первый розыгрыш.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {giveaways.map(g => (
              <div key={g.id} style={{
                background: 'var(--bg-glass)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '18px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>{g.title}</h3>
                      <span style={{
                        fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px',
                        background: STATUS_COLORS[g.status] || '#888', color: '#fff',
                      }}>
                        {STATUS_LABELS[g.status] || g.status || 'Черновик'}
                      </span>
                      {g.erid && (
                        <span style={{
                          fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
                          background: '#6366f1', color: '#fff', fontWeight: 500,
                        }}>
                          ERID: {g.erid}
                        </span>
                      )}
                    </div>
                    {getPrizesDisplay(g) && (
                      <p style={{ fontSize: '0.88rem', marginBottom: '8px' }}>Призы: <b>{getPrizesDisplay(g)}</b></p>
                    )}
                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.82rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                      <span>Участников: {g.participant_count ?? 0}</span>
                      {g.winner_count > 1 && <span>Победителей: {g.winner_count}</span>}
                      {g.deep_link_code && <span>Код: {g.deep_link_code}</span>}
                      {g.ends_at && <span>Итоги: {new Date(g.ends_at).toLocaleString('ru')}</span>}
                    </div>
                    {g.winner_first_name && (
                      <div style={{ fontSize: '0.88rem', marginTop: '8px', color: 'var(--success)', fontWeight: 600 }}>
                        Победитель: {g.winner_first_name} {g.winner_username ? `(@${g.winner_username})` : ''}
                      </div>
                    )}
                  </div>
                  {g.image_path && (
                    <div style={{ width: '120px', height: '80px', flexShrink: 0 }}>
                      <img
                        src={`${API_BASE.replace('/api', '')}${g.image_path}`}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }}
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(!g.status || g.status === 'draft') && (
                      <>
                        <button className="btn btn-outline" style={btnSmall} onClick={() => openEdit(g)}>Ред.</button>
                        <button className="btn btn-primary" style={btnSmall} onClick={() => handlePublish(g)} disabled={publishing === g.id}>{publishing === g.id ? 'Публикация...' : 'Опубликовать'}</button>
                      </>
                    )}
                    {g.status === 'active' && (
                      <button className="btn btn-primary" style={btnSmall} onClick={() => handleDraw(g)}>Определить победителя</button>
                    )}
                    <button className="btn btn-danger" style={btnSmall} onClick={() => handleDelete(g.id)}>Удалить</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingItem ? 'Редактировать розыгрыш' : 'Создать розыгрыш'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div ref={titleRef}>
              <label className="form-label">Название розыгрыша *</label>
              <input className={`form-input${errors.title ? ' field-error' : ''}`} placeholder="Например: Новогодний розыгрыш iPhone 16" value={form.title}
                onChange={e => { setForm(p => ({ ...p, title: e.target.value })); if (e.target.value.trim()) setErrors(er => ({ ...er, title: '' })); }} />
              {errors.title && <div className="field-error-text">{errors.title}</div>}
              <div className="form-hint">Внутреннее название. Подписчики увидят текст поста ниже.</div>
            </div>
            <div ref={messageRef}>
              <label className="form-label">Текст поста *</label>
              <div className={errors.message_text ? 'field-error-wrapper' : ''}>
                <RichTextEditor
                  value={form.message_text}
                  onChange={val => { setForm(p => ({ ...p, message_text: val })); if (val.replace(/<[^>]*>/g, '').trim()) setErrors(er => ({ ...er, message_text: '' })); }}
                  placeholder="Текст розыгрыша, который увидят подписчики в канале..."
                  rows={6}
                  showEmoji={true}
                />
              </div>
              {errors.message_text && <div className="field-error-text">{errors.message_text}</div>}
              <div className="form-hint">Этот текст будет опубликован в канале при запуске розыгрыша.</div>
            </div>
            <div>
              <label className="form-label">Картинка</label>
              <AttachmentPicker
                file={gwImage}
                onFileChange={setGwImage}
                existingFileInfo={editingItem?.image_type || ''}
              />
              {imagePreviewUrl && (
                <div style={{ marginTop: '10px', maxWidth: '320px' }}>
                  <img src={imagePreviewUrl} alt="Предпросмотр" style={{ width: '100%', borderRadius: '6px', display: 'block' }} />
                </div>
              )}
              <div className="form-hint">Рекомендуемый размер: 1280x720 px (16:9). JPG или PNG.</div>
            </div>
            <div>
              <label className="form-label">Призы</label>
              {form.prizes.map((prize, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                  <input className="form-input" placeholder={idx === 0 ? 'Например: iPhone 15 Pro' : 'Ещё один приз'} value={prize} style={{ flex: 1 }}
                    onChange={e => updatePrize(idx, e.target.value)} />
                  {form.prizes.length > 1 && (
                    <button type="button" className="btn btn-outline" style={{ padding: '4px 10px' }} onClick={() => removePrize(idx)}>&#10005;</button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-outline" style={{ fontSize: '0.85rem' }} onClick={addPrize}>+ Добавить приз</button>
              <div className="form-hint">Укажите призы — они отобразятся участникам розыгрыша.</div>
            </div>
            <div>
              <label className="form-label">Условия участия</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'normal', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.conditions.subscribe}
                    onChange={e => setForm(p => ({ ...p, conditions: { ...p.conditions, subscribe: e.target.checked } }))} />
                  Подписка на канал
                </label>
              </div>
              <div className="form-hint">Условия, которые должен выполнить участник для участия в розыгрыше.</div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Кол-во победителей</label>
                <input type="number" className="form-input" value={form.winner_count} min="1" max="100"
                  onChange={e => setForm(p => ({ ...p, winner_count: parseInt(e.target.value) || 1 }))} />
                <div className="form-hint">Сколько победителей будет выбрано случайным образом.</div>
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Дата подведения итогов</label>
                <input type="datetime-local" className="form-input" value={form.ends_at}
                  onChange={e => setForm(p => ({ ...p, ends_at: e.target.value }))} />
                <div className="form-hint">Необязательно. Итоги можно подвести вручную.</div>
              </div>
            </div>
            <div>
              <label className="form-label">ERID (рекламный идентификатор)</label>
              <input className="form-input" placeholder="Например: 2Vtzqx..." value={form.erid}
                onChange={e => setForm(p => ({ ...p, erid: e.target.value }))} />
              <div className="form-hint">Обязателен по ФЗ о рекламе, если розыгрыш содержит рекламу. Получите в ОРД.</div>
            </div>
            <div>
              <label className="form-label">Юр. информация</label>
              <textarea className="form-input" rows={2} placeholder="ИНН, наименование рекламодателя..." value={form.legal_info}
                onChange={e => setForm(p => ({ ...p, legal_info: e.target.value }))} />
              <div className="form-hint">Юридические данные рекламодателя (ИНН, название). Требуется по закону при рекламе.</div>
            </div>
            <MessagePreview
              messageText={form.message_text}
              file={gwImage}
              fileUrl={!gwImage && editingItem?.image_path ? `${API_BASE.replace('/api', '')}${editingItem.image_path}` : ''}
              tc={tc}
              entityType="giveaway"
              entityId={editingItem?.id}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : editingItem ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Paywall>
  );
}

const btnSmall = { padding: '4px 10px', fontSize: '0.8rem' };
