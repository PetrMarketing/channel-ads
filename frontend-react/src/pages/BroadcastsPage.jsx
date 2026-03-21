import { useState, useEffect, useCallback, useRef } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import ButtonBuilder from '../components/ButtonBuilder';
import AttachmentPicker from '../components/AttachmentPicker';

const STATUS_LABELS = { draft: 'Черновик', scheduled: 'Запланировано', sending: 'Отправляется', completed: 'Отправлено' };
const STATUS_COLORS = { draft: '#888', scheduled: '#3b82f6', sending: '#f59e0b', completed: 'var(--success)' };

const FILTER_TYPE_LABELS = {
  all_leads: 'Все лиды',
  lead_magnet: 'Получил лид-магнит',
  registration_date: 'Дата регистрации',
  giveaway_participant: 'Участник розыгрыша',
};

const FILTER_TYPES = Object.keys(FILTER_TYPE_LABELS);

function defaultFilterValue(type) {
  if (type === 'lead_magnet') return { lead_magnet_id: '' };
  if (type === 'registration_date') return { date: '', direction: 'before' };
  if (type === 'giveaway_participant') return { giveaway_id: '' };
  return {};
}

function scrollToRef(ref) {
  if (ref?.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current.classList.add('field-shake');
    setTimeout(() => ref.current.classList.remove('field-shake'), 500);
  }
}

export default function BroadcastsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [broadcasts, setBroadcasts] = useState([]);
  const [leadMagnets, setLeadMagnets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingBc, setEditingBc] = useState(null);
  const [form, setForm] = useState({
    title: '', message_text: '', target_type: 'all_leads',
    target_lead_magnet_id: '', scheduled_at: '', inline_buttons: '', attach_type: '',
  });
  const [filterRules, setFilterRules] = useState([]);
  const [bcFile, setBcFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recipientCount, setRecipientCount] = useState(null);
  const [addFilterType, setAddFilterType] = useState('');
  const [giveaways, setGiveaways] = useState([]);
  const [errors, setErrors] = useState({});
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [modalTab, setModalTab] = useState('edit'); // 'edit' | 'preview'
  const [showEditSentModal, setShowEditSentModal] = useState(false);
  const [editSentBc, setEditSentBc] = useState(null);
  const [editSentText, setEditSentText] = useState('');
  const [editSentSaving, setEditSentSaving] = useState(false);

  const messageRef = useRef(null);
  const dropdownRef = useRef(null);

  const tc = currentChannel?.tracking_code;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadBroadcasts = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/broadcasts/${tc}`);
      if (data.success) setBroadcasts(data.broadcasts || []);
    } catch {
      showToast('Ошибка загрузки рассылок', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  const loadLeadMagnets = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/broadcasts/${tc}/lead-magnets`);
      if (data.success) setLeadMagnets(data.leadMagnets || []);
    } catch {}
  }, [tc]);

  const loadGiveaways = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/giveaways/${tc}`);
      if (data.success) setGiveaways(data.giveaways || []);
    } catch {}
  }, [tc]);

  useEffect(() => { loadBroadcasts(); loadLeadMagnets(); loadGiveaways(); }, [loadBroadcasts, loadLeadMagnets, loadGiveaways]);

  const resetForm = () => {
    setForm({ title: '', message_text: '', target_type: 'all_leads', target_lead_magnet_id: '', scheduled_at: '', inline_buttons: '', attach_type: '' });
    setFilterRules([]);
    setBcFile(null);
    setAddFilterType('');
    setErrors({});
    setModalTab('edit');
  };

  const loadRecipientCount = useCallback(async (bcId, rules) => {
    if (!tc) return;
    try {
      if (rules && rules.length > 0) {
        const data = await api.post(`/broadcasts/${tc}/count-recipients`, { filter_rules: rules });
        if (data.success) setRecipientCount(data.count);
      } else if (bcId) {
        const data = await api.get(`/broadcasts/${tc}/${bcId}/recipients-count`);
        if (data.success) setRecipientCount(data.count);
      } else {
        const data = await api.get(`/broadcasts/${tc}/total-recipients`);
        if (data.success) setRecipientCount(data.leads || 0);
      }
    } catch { setRecipientCount(null); }
  }, [tc]);

  // Recount when filters change
  useEffect(() => {
    if (!showModal) return;
    loadRecipientCount(editingBc?.id, filterRules);
  }, [filterRules, showModal]);

  const openCreate = () => {
    setEditingBc(null);
    resetForm();
    setRecipientCount(null);
    setShowModal(true);
    loadRecipientCount(null);
  };

  const openEdit = (bc) => {
    setEditingBc(bc);
    let btns = '';
    if (bc.inline_buttons) {
      try { btns = typeof bc.inline_buttons === 'string' ? bc.inline_buttons : JSON.stringify(bc.inline_buttons); } catch {}
    }
    let rules = [];
    if (bc.filter_rules) {
      try { rules = typeof bc.filter_rules === 'string' ? JSON.parse(bc.filter_rules) : bc.filter_rules; } catch {}
    }
    setForm({
      title: bc.title || '',
      message_text: bc.message_text || '',
      target_type: bc.target_type || 'all_leads',
      target_lead_magnet_id: bc.target_lead_magnet_id || '',
      scheduled_at: bc.scheduled_at ? bc.scheduled_at.slice(0, 16) : '',
      inline_buttons: btns,
      attach_type: bc.attach_type || '',
    });
    setFilterRules(Array.isArray(rules) ? rules : []);
    setBcFile(null);
    setAddFilterType('');
    setErrors({});
    setModalTab('edit');
    setRecipientCount(bc.total_count || null);
    setShowModal(true);
    loadRecipientCount(bc.id);
  };

  const deriveTargetType = (rules) => {
    if (!rules || rules.length === 0) return 'all_leads';
    if (rules.length === 1 && rules[0].type === 'lead_magnet' && !rules[0].negate && rules[0].value?.lead_magnet_id) {
      return 'specific_lead_magnet';
    }
    return 'custom_filter';
  };

  const validate = () => {
    const newErrors = {};
    if (!form.message_text.trim()) newErrors.message_text = 'Текст сообщения обязателен';
    setErrors(newErrors);
    if (newErrors.message_text) { scrollToRef(messageRef); }
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const defaultTitle = form.title.trim() || `Рассылка от ${new Date().toLocaleDateString('ru-RU')}`;
      const payload = {
        title: defaultTitle,
        message_text: form.message_text,
        target_type: deriveTargetType(filterRules),
        target_lead_magnet_id: form.target_lead_magnet_id || null,
        scheduled_at: form.scheduled_at || null,
        filter_rules: filterRules.length > 0 ? JSON.stringify(filterRules) : null,
        attach_type: form.attach_type || null,
      };

      if (form.inline_buttons && form.inline_buttons.trim()) {
        try { payload.inline_buttons = JSON.parse(form.inline_buttons); } catch {
          showToast('Неверный формат JSON для кнопок', 'error');
          setSaving(false);
          return;
        }
      }

      let data;
      if (bcFile) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          if (v !== null && v !== undefined) {
            fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
          }
        });
        fd.append('file', bcFile);
        if (editingBc) {
          data = await api.upload(`/broadcasts/${tc}/${editingBc.id}`, fd);
        } else {
          data = await api.upload(`/broadcasts/${tc}`, fd);
        }
      } else {
        if (editingBc) {
          data = await api.put(`/broadcasts/${tc}/${editingBc.id}`, payload);
        } else {
          data = await api.post(`/broadcasts/${tc}`, payload);
        }
      }

      if (data.success) {
        showToast(editingBc ? 'Рассылка обновлена' : 'Рассылка создана');
        setShowModal(false);
        loadBroadcasts();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!editingBc) {
      showToast('Сначала сохраните рассылку', 'error');
      return;
    }
    try {
      const data = await api.post(`/broadcasts/${tc}/${editingBc.id}/send-test`);
      if (data.success) {
        showToast('Тестовое сообщение отправлено');
      } else {
        showToast(data.error || 'Ошибка отправки', 'error');
      }
    } catch {
      showToast('Ошибка отправки тестового сообщения', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить рассылку?')) return;
    try {
      const data = await api.delete(`/broadcasts/${tc}/${id}`);
      if (data.success) { showToast('Рассылка удалена'); loadBroadcasts(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handleSend = async (bc) => {
    if (!window.confirm('Отправить рассылку сейчас?')) return;
    try {
      const data = await api.post(`/broadcasts/${tc}/${bc.id}/send`);
      if (data.success) {
        showToast(`Отправка начата (${data.total} получателей)`);
        loadBroadcasts();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch { showToast('Ошибка отправки', 'error'); }
  };

  const handleCopy = async (bc) => {
    try {
      const data = await api.post(`/broadcasts/${tc}/${bc.id}/copy`);
      if (data.success) {
        showToast('Рассылка скопирована');
        loadBroadcasts();
      } else {
        showToast(data.error || 'Ошибка копирования', 'error');
      }
    } catch {
      showToast('Ошибка копирования', 'error');
    }
  };

  const handleStats = async (bc) => {
    try {
      const data = await api.get(`/broadcasts/${tc}/${bc.id}/stats`);
      if (data.success) {
        setStatsData({ ...data, title: bc.title || `Рассылка #${bc.id}` });
        setShowStatsModal(true);
      } else {
        showToast(data.error || 'Ошибка загрузки статистики', 'error');
      }
    } catch {
      showToast('Ошибка загрузки статистики', 'error');
    }
  };

  const handleEditSentOpen = (bc) => {
    setEditSentBc(bc);
    setEditSentText(bc.message_text || '');
    setShowEditSentModal(true);
  };

  const handleEditSentSubmit = async () => {
    if (!editSentText.trim()) {
      showToast('Введите текст сообщения', 'error');
      return;
    }
    setEditSentSaving(true);
    try {
      const data = await api.post(`/broadcasts/${tc}/${editSentBc.id}/edit-sent`, { message_text: editSentText });
      if (data.success) {
        showToast(`Отредактировано: ${data.edited}, ошибок: ${data.failed}`);
        setShowEditSentModal(false);
        loadBroadcasts();
      } else {
        showToast(data.error || 'Ошибка редактирования', 'error');
      }
    } catch {
      showToast('Ошибка редактирования отправленных', 'error');
    } finally {
      setEditSentSaving(false);
    }
  };

  const handleDeleteSent = async (bc) => {
    if (!window.confirm('Удалить все отправленные сообщения этой рассылки у получателей?')) return;
    try {
      const data = await api.post(`/broadcasts/${tc}/${bc.id}/delete-sent`);
      if (data.success) {
        showToast(`Удалено: ${data.deleted}, ошибок: ${data.failed}`);
      } else {
        showToast(data.error || 'Ошибка удаления', 'error');
      }
    } catch {
      showToast('Ошибка удаления отправленных', 'error');
    }
  };

  /* --- Filter rules helpers --- */
  const addFilter = () => {
    if (!addFilterType) return;
    setFilterRules(prev => [...prev, { type: addFilterType, value: defaultFilterValue(addFilterType), negate: false }]);
    setAddFilterType('');
  };

  const updateFilter = (idx, patch) => {
    setFilterRules(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const updateFilterValue = (idx, valPatch) => {
    setFilterRules(prev => prev.map((r, i) => i === idx ? { ...r, value: { ...r.value, ...valPatch } } : r));
  };

  const removeFilter = (idx) => {
    setFilterRules(prev => prev.filter((_, i) => i !== idx));
  };

  const renderFilterTag = (rule, idx) => {
    const label = FILTER_TYPE_LABELS[rule.type] || rule.type;
    return (
      <div key={idx} style={filterTagStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* Negate toggle */}
          <button
            type="button"
            onClick={() => updateFilter(idx, { negate: !rule.negate })}
            style={{
              ...negateButtonStyle,
              background: rule.negate ? '#ef4444' : 'var(--bg-secondary)',
              color: rule.negate ? '#fff' : 'var(--text-secondary)',
            }}
            title={rule.negate ? 'Исключение активно' : 'Нажмите для исключения'}
          >
            НЕ
          </button>

          <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{label}</span>

          {/* Extra controls per type */}
          {rule.type === 'lead_magnet' && (
            <select
              style={filterSelectStyle}
              value={rule.value?.lead_magnet_id || ''}
              onChange={e => updateFilterValue(idx, { lead_magnet_id: e.target.value })}
            >
              <option value="">— Выберите —</option>
              {leadMagnets.map(lm => (
                <option key={lm.id} value={lm.id}>{lm.title}</option>
              ))}
            </select>
          )}

          {rule.type === 'giveaway_participant' && (
            <select
              style={filterSelectStyle}
              value={rule.value?.giveaway_id || ''}
              onChange={e => updateFilterValue(idx, { giveaway_id: e.target.value })}
            >
              <option value="">— Все розыгрыши —</option>
              {giveaways.map(g => (
                <option key={g.id} value={g.id}>{g.title || `Розыгрыш #${g.id}`}</option>
              ))}
            </select>
          )}

          {rule.type === 'registration_date' && (
            <>
              <select
                style={filterSelectStyle}
                value={rule.value?.direction || 'before'}
                onChange={e => updateFilterValue(idx, { direction: e.target.value })}
              >
                <option value="before">до</option>
                <option value="after">после</option>
              </select>
              <input
                type="date"
                style={filterSelectStyle}
                value={rule.value?.date || ''}
                onChange={e => updateFilterValue(idx, { date: e.target.value })}
              />
            </>
          )}

          <button type="button" onClick={() => removeFilter(idx)} style={removeButtonStyle} title="Удалить фильтр">
            &times;
          </button>
        </div>
      </div>
    );
  };

  const renderMoreDropdown = (b) => {
    const isOpen = openDropdownId === b.id;
    return (
      <div style={{ position: 'relative' }} ref={isOpen ? dropdownRef : null}>
        <button
          className="btn btn-outline"
          style={btnSmall}
          onClick={() => setOpenDropdownId(isOpen ? null : b.id)}
        >
          Ещё ▾
        </button>
        {isOpen && (
          <div style={dropdownMenuStyle}>
            <button
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); handleStats(b); }}
            >
              📊 Статистика
            </button>
            <button
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); handleCopy(b); }}
            >
              📋 Копировать
            </button>
            <button
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); openEdit(b); }}
            >
              ✏️ Редактировать
            </button>
            <button
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); handleEditSentOpen(b); }}
            >
              ✏️ Редактировать отправленные
            </button>
            <button
              style={{ ...dropdownItemStyle, color: '#ef4444' }}
              onClick={() => { setOpenDropdownId(null); handleDeleteSent(b); }}
            >
              🗑️ Удалить отправленные
            </button>
            <button
              style={{ ...dropdownItemStyle, color: '#ef4444' }}
              onClick={() => { setOpenDropdownId(null); handleDelete(b.id); }}
            >
              🗑️ Удалить
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderPreview = () => {
    let buttons = [];
    if (form.inline_buttons && form.inline_buttons.trim()) {
      try { buttons = JSON.parse(form.inline_buttons); } catch {}
    }
    return (
      <div style={previewContainerStyle}>
        <div style={previewBubbleStyle}>
          <div
            style={{ fontSize: '0.92rem', lineHeight: 1.55 }}
            dangerouslySetInnerHTML={{ __html: form.message_text || '<span style="color:#999">Нет текста</span>' }}
          />
          {Array.isArray(buttons) && buttons.length > 0 && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {buttons.map((row, ri) => (
                <div key={ri} style={{ display: 'flex', gap: '6px' }}>
                  {(Array.isArray(row) ? row : [row]).map((btn, bi) => (
                    <span key={bi} style={previewButtonStyle}>
                      {btn.text || btn.label || 'Кнопка'}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {bcFile && (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
            📎 {bcFile.name}
          </div>
        )}
      </div>
    );
  };

  return (
    <Paywall>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>Рассылки</h2>
          <button className="btn btn-primary" onClick={openCreate}>+ Создать рассылку</button>
        </div>

        {loading ? <Loading /> : broadcasts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            Нет рассылок. Создайте первую рассылку.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {broadcasts.map(b => (
              <div key={b.id} style={{
                background: 'var(--bg-glass)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      {b.title && <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{b.title}</span>}
                      <span style={{
                        fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px',
                        background: STATUS_COLORS[b.status] || '#888', color: '#fff',
                      }}>
                        {STATUS_LABELS[b.status] || b.status}
                      </span>
                    </div>
                    <div
                      style={{ fontSize: '0.88rem', marginBottom: '6px', maxHeight: '80px', overflowY: 'auto', lineHeight: 1.5 }}
                      dangerouslySetInnerHTML={{ __html: b.message_text || '' }}
                    />
                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {b.scheduled_at && <span>Запланировано: {new Date(b.scheduled_at).toLocaleString('ru-RU')}</span>}
                      {b.status === 'completed' && b.sent_count != null && <span>Отправлено: {b.sent_count}/{b.total_count}</span>}
                      {b.status !== 'completed' && b.target_type && <span>Цель: {b.target_type === 'all_leads' ? 'Все лиды' : b.target_type === 'specific_lead_magnet' ? 'По лид-магниту' : 'Фильтр'}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {b.status === 'draft' && (
                      <>
                        <button className="btn btn-outline" style={btnSmall} onClick={() => openEdit(b)}>Ред.</button>
                        <button className="btn btn-primary" style={btnSmall} onClick={() => handleSend(b)}>Отправить</button>
                        <button className="btn btn-danger" style={btnSmall} onClick={() => handleDelete(b.id)}>Удалить</button>
                      </>
                    )}
                    {b.status === 'scheduled' && (
                      <button className="btn btn-danger" style={btnSmall} onClick={() => handleDelete(b.id)}>Удалить</button>
                    )}
                    {b.status === 'completed' && renderMoreDropdown(b)}
                    {b.status === 'sending' && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Отправляется...</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Edit/Create Modal */}
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingBc ? 'Редактировать рассылку' : 'Создать рассылку'}>
          {/* Tab toggle */}
          <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setModalTab('edit')}
              style={{
                ...tabButtonStyle,
                borderBottom: modalTab === 'edit' ? '2px solid var(--primary)' : '2px solid transparent',
                color: modalTab === 'edit' ? 'var(--primary)' : 'var(--text-secondary)',
              }}
            >
              Редактирование
            </button>
            <button
              type="button"
              onClick={() => setModalTab('preview')}
              style={{
                ...tabButtonStyle,
                borderBottom: modalTab === 'preview' ? '2px solid var(--primary)' : '2px solid transparent',
                color: modalTab === 'preview' ? 'var(--primary)' : 'var(--text-secondary)',
              }}
            >
              Предпросмотр
            </button>
          </div>

          {modalTab === 'preview' ? (
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Так будет выглядеть сообщение для получателя:
              </div>
              {renderPreview()}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Title */}
              <div>
                <label className="form-label">Название</label>
                <input className="form-input" placeholder="Например: Акция на выходные" value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                <div className="form-hint">Для вашего удобства. Подписчики не увидят название.</div>
              </div>

              {/* Message text — RichTextEditor */}
              <div ref={messageRef}>
                <label className="form-label">Текст сообщения *</label>
                <div className={errors.message_text ? 'field-error-wrapper' : ''}>
                  <RichTextEditor
                    value={form.message_text}
                    onChange={val => { setForm(p => ({ ...p, message_text: val })); if (val.trim()) setErrors(e => ({ ...e, message_text: '' })); }}
                    placeholder="Текст рассылки... Поддерживает HTML: <b>жирный</b>, <i>курсив</i>, <a href='URL'>ссылка</a>"
                    rows={5}
                    showEmoji={true}
                    className={errors.message_text ? 'field-error' : ''}
                  />
                </div>
                {errors.message_text && <div className="field-error-text">{errors.message_text}</div>}
                <div className="form-hint">Этот текст получат подписчики. Поддерживается HTML-разметка Telegram/MAX.</div>
              </div>

              {/* File attachment */}
              <div>
                <label className="form-label">Вложение</label>
                <AttachmentPicker
                  file={bcFile}
                  onFileChange={setBcFile}
                  attachType={form.attach_type}
                  onAttachTypeChange={v => setForm(p => ({ ...p, attach_type: v }))}
                  existingFileInfo={editingBc?.file_type || ''}
                />
                <div className="form-hint">Фото, видео или документ. Макс. 50 МБ для Telegram, 100 МБ для MAX.</div>
              </div>

              {/* Recipient count */}
              {recipientCount !== null && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
                  background: recipientCount > 0 ? 'rgba(42,157,143,0.08)' : 'rgba(230,57,70,0.08)',
                  border: `1px solid ${recipientCount > 0 ? 'rgba(42,157,143,0.2)' : 'rgba(230,57,70,0.2)'}`,
                  fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span style={{ fontSize: '1.1rem' }}>{recipientCount > 0 ? '👥' : '⚠️'}</span>
                  <span>Получателей: <strong>{recipientCount}</strong></span>
                </div>
              )}

              {/* Recipient filters */}
              <div>
                <label className="form-label">Получатели (фильтры)</label>
                {/* Existing filter tags */}
                {filterRules.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                    {filterRules.map((rule, idx) => renderFilterTag(rule, idx))}
                    {filterRules.length > 1 && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Фильтры объединяются по логике И (AND)
                      </div>
                    )}
                  </div>
                )}
                {filterRules.length === 0 && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Нет фильтров — рассылка пойдёт всем лидам
                  </div>
                )}
                {/* Add filter control */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    className="form-input"
                    style={{ flex: 1 }}
                    value={addFilterType}
                    onChange={e => setAddFilterType(e.target.value)}
                  >
                    <option value="">+ Добавить фильтр...</option>
                    {FILTER_TYPES.map(ft => (
                      <option key={ft} value={ft}>{FILTER_TYPE_LABELS[ft]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '6px 14px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                    onClick={addFilter}
                    disabled={!addFilterType}
                  >
                    Добавить
                  </button>
                </div>
                <div className="form-hint">Фильтруйте получателей по лид-магнитам, дате регистрации или участию в розыгрышах.</div>
              </div>

              {/* Schedule */}
              <div>
                <label className="form-label">Запланировать отправку</label>
                <input className="form-input" type="datetime-local" value={form.scheduled_at}
                  onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))} />
                <div className="form-hint">Оставьте пустым для отправки вручную. Время — по Москве (UTC+3).</div>
              </div>

              {/* Inline buttons — ButtonBuilder */}
              <div>
                <label className="form-label">Инлайн-кнопки</label>
                <ButtonBuilder
                  value={form.inline_buttons}
                  onChange={val => setForm(p => ({ ...p, inline_buttons: val }))}
                  leadMagnets={leadMagnets}
                  showLeadMagnet={true}
                />
                <div className="form-hint">Кнопки под сообщением. Можно добавить ссылку или выдачу лид-магнита.</div>
              </div>
            </div>
          )}

          {/* Actions — always visible */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn btn-outline" onClick={() => setShowModal(false)}>Отмена</button>
            {editingBc && (
              <button className="btn btn-outline" onClick={handleSendTest} title="Отправить тестовое сообщение себе">
                Отправить себе
              </button>
            )}
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </Modal>

        {/* Stats Modal */}
        <Modal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} title={`Статистика: ${statsData?.title || ''}`}>
          {statsData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={statsRowStyle}>
                <span>Всего получателей:</span>
                <strong>{statsData.total_count ?? statsData.stats?.total_count ?? '—'}</strong>
              </div>
              <div style={statsRowStyle}>
                <span>Отправлено:</span>
                <strong>{statsData.sent_count ?? statsData.stats?.sent_count ?? '—'}</strong>
              </div>
              <div style={statsRowStyle}>
                <span>Доставлено:</span>
                <strong>{statsData.delivered_count ?? statsData.stats?.delivered_count ?? '—'}</strong>
              </div>
              <div style={statsRowStyle}>
                <span>Ошибки:</span>
                <strong>{statsData.error_count ?? statsData.stats?.error_count ?? '—'}</strong>
              </div>
              {(statsData.click_count != null || statsData.stats?.click_count != null) && (
                <div style={statsRowStyle}>
                  <span>Кликов по кнопкам:</span>
                  <strong>{statsData.click_count ?? statsData.stats?.click_count ?? '—'}</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button className="btn btn-outline" onClick={() => setShowStatsModal(false)}>Закрыть</button>
              </div>
            </div>
          )}
        </Modal>
        {/* Edit Sent Messages Modal */}
        <Modal isOpen={showEditSentModal} onClose={() => setShowEditSentModal(false)} title={`Редактировать отправленные: ${editSentBc?.title || ''}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Новый текст сообщения *</label>
              <RichTextEditor
                value={editSentText}
                onChange={setEditSentText}
                placeholder="Новый текст для всех отправленных сообщений..."
                rows={6}
                showEmoji={true}
              />
              <div className="form-hint">Этот текст заменит текущий текст во всех отправленных сообщениях.</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowEditSentModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleEditSentSubmit} disabled={editSentSaving}>
                {editSentSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Paywall>
  );
}

const btnSmall = { padding: '4px 10px', fontSize: '0.8rem' };

const filterTagStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '8px 12px',
  position: 'relative',
};

const negateButtonStyle = {
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '1px 6px',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
  lineHeight: 1.4,
};

const filterSelectStyle = {
  padding: '3px 8px',
  fontSize: '0.82rem',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
};

const removeButtonStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '1.1rem',
  lineHeight: 1,
  color: 'var(--text-secondary)',
  padding: '0 2px',
};

const dropdownMenuStyle = {
  position: 'absolute',
  right: 0,
  top: '100%',
  marginTop: '4px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  zIndex: 100,
  minWidth: '180px',
  overflow: 'hidden',
};

const dropdownItemStyle = {
  display: 'block',
  width: '100%',
  padding: '10px 14px',
  fontSize: '0.85rem',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

const tabButtonStyle = {
  background: 'none',
  border: 'none',
  padding: '8px 16px',
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'color 0.2s',
};

const previewContainerStyle = {
  padding: '20px',
  background: 'var(--bg-secondary)',
  borderRadius: '12px',
  minHeight: '120px',
};

const previewBubbleStyle = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '12px 16px',
  maxWidth: '400px',
};

const previewButtonStyle = {
  display: 'inline-block',
  padding: '6px 16px',
  fontSize: '0.82rem',
  borderRadius: '6px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  color: 'var(--primary, #3b82f6)',
  textAlign: 'center',
  flex: 1,
};

const statsRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: '0.9rem',
};
