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

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

const DEFAULT_DELAY = {
  delayType: 'after_seconds',
  delayValue: 60,
  delayUnit: 'minutes',
  delayDays: 1,
  delayTime: '10:00',
  delayWeekday: 1,
  delayDatetime: '',
};

function delayToMinutes(delayType, delayValue, delayUnit, delayDays, delayTime, delayWeekday, delayDatetime) {
  switch (delayType) {
    case 'after_seconds': {
      const v = delayValue || 0;
      if (delayUnit === 'seconds') return Math.max(1, Math.round(v / 60));
      if (delayUnit === 'minutes') return v;
      if (delayUnit === 'hours') return v * 60;
      if (delayUnit === 'days') return v * 1440;
      return v;
    }
    case 'at_day_time': {
      const d = delayDays || 1;
      const [h, m] = (delayTime || '10:00').split(':').map(Number);
      return d * 1440 + (h || 0) * 60 + (m || 0);
    }
    case 'at_weekday_time': {
      // Approximate: 1 week max
      return 1440;
    }
    case 'at_exact_date': {
      if (!delayDatetime) return 60;
      const diff = Math.round((new Date(delayDatetime).getTime() - Date.now()) / 60000);
      return Math.max(1, diff);
    }
    default:
      return 60;
  }
}

function buildDelayConfig(delayType, delayValue, delayUnit, delayDays, delayTime, delayWeekday, delayDatetime) {
  switch (delayType) {
    case 'after_seconds':
      return { type: 'after_seconds', value: delayValue || 0, unit: delayUnit || 'minutes' };
    case 'at_day_time':
      return { type: 'at_day_time', days: delayDays || 1, time: delayTime || '10:00' };
    case 'at_weekday_time':
      return { type: 'at_weekday_time', weekday: delayWeekday ?? 1, time: delayTime || '10:00' };
    case 'at_exact_date':
      return { type: 'at_exact_date', datetime: delayDatetime || '' };
    default:
      return { type: 'after_seconds', value: 60, unit: 'minutes' };
  }
}

function parseDelayConfig(step) {
  if (step.delay_config) {
    const cfg = typeof step.delay_config === 'string' ? JSON.parse(step.delay_config) : step.delay_config;
    switch (cfg.type) {
      case 'after_seconds':
        return {
          delayType: 'after_seconds',
          delayValue: cfg.value ?? 60,
          delayUnit: cfg.unit || 'minutes',
          delayDays: DEFAULT_DELAY.delayDays,
          delayTime: DEFAULT_DELAY.delayTime,
          delayWeekday: DEFAULT_DELAY.delayWeekday,
          delayDatetime: DEFAULT_DELAY.delayDatetime,
        };
      case 'at_day_time':
        return {
          delayType: 'at_day_time',
          delayValue: DEFAULT_DELAY.delayValue,
          delayUnit: DEFAULT_DELAY.delayUnit,
          delayDays: cfg.days ?? 1,
          delayTime: cfg.time || '10:00',
          delayWeekday: DEFAULT_DELAY.delayWeekday,
          delayDatetime: DEFAULT_DELAY.delayDatetime,
        };
      case 'at_weekday_time':
        return {
          delayType: 'at_weekday_time',
          delayValue: DEFAULT_DELAY.delayValue,
          delayUnit: DEFAULT_DELAY.delayUnit,
          delayDays: DEFAULT_DELAY.delayDays,
          delayTime: cfg.time || '10:00',
          delayWeekday: cfg.weekday ?? 1,
          delayDatetime: DEFAULT_DELAY.delayDatetime,
        };
      case 'at_exact_date':
        return {
          delayType: 'at_exact_date',
          delayValue: DEFAULT_DELAY.delayValue,
          delayUnit: DEFAULT_DELAY.delayUnit,
          delayDays: DEFAULT_DELAY.delayDays,
          delayTime: DEFAULT_DELAY.delayTime,
          delayWeekday: DEFAULT_DELAY.delayWeekday,
          delayDatetime: cfg.datetime || '',
        };
      default:
        break;
    }
  }
  // Fallback: convert old delay_minutes
  const mins = step.delay_minutes ?? 60;
  let unit = 'minutes';
  let value = mins;
  if (mins >= 1440 && mins % 1440 === 0) { unit = 'days'; value = mins / 1440; }
  else if (mins >= 60 && mins % 60 === 0) { unit = 'hours'; value = mins / 60; }
  return { ...DEFAULT_DELAY, delayValue: value, delayUnit: unit };
}

function scrollToRef(ref) {
  if (ref?.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current.classList.add('field-shake');
    setTimeout(() => ref.current.classList.remove('field-shake'), 500);
  }
}

export default function FunnelsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [funnels, setFunnels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingStep, setEditingStep] = useState(null);
  const [selectedLm, setSelectedLm] = useState(null);
  const [leadMagnets, setLeadMagnets] = useState([]);
  const [form, setForm] = useState({ message_text: '', inline_buttons: '', attach_type: '' });
  const [delayType, setDelayType] = useState(DEFAULT_DELAY.delayType);
  const [delayValue, setDelayValue] = useState(DEFAULT_DELAY.delayValue);
  const [delayUnit, setDelayUnit] = useState(DEFAULT_DELAY.delayUnit);
  const [delayDays, setDelayDays] = useState(DEFAULT_DELAY.delayDays);
  const [delayTime, setDelayTime] = useState(DEFAULT_DELAY.delayTime);
  const [delayWeekday, setDelayWeekday] = useState(DEFAULT_DELAY.delayWeekday);
  const [delayDatetime, setDelayDatetime] = useState(DEFAULT_DELAY.delayDatetime);
  const [stepFile, setStepFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  const messageRef = useRef(null);

  const tc = currentChannel?.tracking_code;

  const loadFunnels = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/funnels/${tc}`);
      if (data.success) setFunnels(data.funnels || []);
    } catch {
      showToast('Ошибка загрузки воронок', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  const loadLeadMagnets = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/pins/${tc}/lead-magnets`);
      if (data.success) setLeadMagnets(data.lead_magnets || data.leadMagnets || []);
    } catch {
      // silent
    }
  }, [tc]);

  useEffect(() => { loadFunnels(); }, [loadFunnels]);
  useEffect(() => { loadLeadMagnets(); }, [loadLeadMagnets]);

  const resetDelayState = () => {
    setDelayType(DEFAULT_DELAY.delayType);
    setDelayValue(DEFAULT_DELAY.delayValue);
    setDelayUnit(DEFAULT_DELAY.delayUnit);
    setDelayDays(DEFAULT_DELAY.delayDays);
    setDelayTime(DEFAULT_DELAY.delayTime);
    setDelayWeekday(DEFAULT_DELAY.delayWeekday);
    setDelayDatetime(DEFAULT_DELAY.delayDatetime);
  };

  const openCreateStep = (lm) => {
    setSelectedLm(lm);
    setEditingStep(null);
    setForm({ message_text: '', inline_buttons: '', attach_type: '' });
    resetDelayState();
    setStepFile(null);
    setErrors({});
    setShowPreview(false);
    setShowModal(true);
  };

  const openEditStep = (lm, step) => {
    setSelectedLm(lm);
    setEditingStep(step);
    let btns = '';
    if (step.inline_buttons) {
      try {
        btns = typeof step.inline_buttons === 'string' ? step.inline_buttons : JSON.stringify(step.inline_buttons, null, 2);
      } catch { btns = ''; }
    }
    setForm({
      message_text: step.message_text || '',
      inline_buttons: btns,
      attach_type: step.attach_type || '',
    });
    const parsed = parseDelayConfig(step);
    setDelayType(parsed.delayType);
    setDelayValue(parsed.delayValue);
    setDelayUnit(parsed.delayUnit);
    setDelayDays(parsed.delayDays);
    setDelayTime(parsed.delayTime);
    setDelayWeekday(parsed.delayWeekday);
    setDelayDatetime(parsed.delayDatetime);
    setStepFile(null);
    setErrors({});
    setShowPreview(false);
    setShowModal(true);
  };

  const validate = () => {
    const newErrors = {};
    if (!form.message_text.trim()) newErrors.message_text = 'Текст сообщения обязателен';
    if (delayType === 'at_exact_date' && !delayDatetime) newErrors.datetime = 'Укажите дату и время отправки';
    setErrors(newErrors);
    if (newErrors.message_text) scrollToRef(messageRef);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (!selectedLm) return;
    setSaving(true);
    try {
      const computedMinutes = delayToMinutes(delayType, delayValue, delayUnit, delayDays, delayTime, delayWeekday, delayDatetime);
      const delayConfig = buildDelayConfig(delayType, delayValue, delayUnit, delayDays, delayTime, delayWeekday, delayDatetime);

      let inlineButtons = null;
      if (form.inline_buttons && form.inline_buttons.trim()) {
        try {
          inlineButtons = JSON.parse(form.inline_buttons);
        } catch {
          showToast('Неверный формат кнопок', 'error');
          setSaving(false);
          return;
        }
      }

      let data;
      if (stepFile) {
        const fd = new FormData();
        fd.append('message_text', form.message_text);
        fd.append('delay_minutes', computedMinutes);
        fd.append('delay_config', JSON.stringify(delayConfig));
        if (inlineButtons) fd.append('inline_buttons', JSON.stringify(inlineButtons));
        if (form.attach_type) fd.append('attach_type', form.attach_type);
        fd.append('file', stepFile);

        if (editingStep) {
          data = await api.upload(`/funnels/${tc}/${selectedLm.id}/steps/${editingStep.id}`, fd, 'PUT');
        } else {
          data = await api.upload(`/funnels/${tc}/${selectedLm.id}/steps`, fd);
        }
      } else {
        const payload = {
          message_text: form.message_text,
          delay_minutes: computedMinutes,
          delay_config: delayConfig,
        };
        if (inlineButtons) payload.inline_buttons = inlineButtons;
        if (form.attach_type) payload.attach_type = form.attach_type;

        if (editingStep) {
          data = await api.put(`/funnels/${tc}/${selectedLm.id}/steps/${editingStep.id}`, payload);
        } else {
          data = await api.post(`/funnels/${tc}/${selectedLm.id}/steps`, payload);
        }
      }

      if (data.success) {
        showToast(editingStep ? 'Шаг обновлён' : 'Шаг создан');
        setShowModal(false);
        loadFunnels();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStep = async (lm, step) => {
    if (!window.confirm('Удалить шаг воронки?')) return;
    try {
      const data = await api.delete(`/funnels/${tc}/${lm.id}/steps/${step.id}`);
      if (data.success) { showToast('Шаг удалён'); loadFunnels(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handleCopyStep = async (lm, step) => {
    try {
      const data = await api.post(`/funnels/${tc}/${lm.id}/steps/${step.id}/copy`);
      if (data.success) { showToast('Шаг скопирован'); loadFunnels(); }
      else showToast(data.error || 'Ошибка копирования', 'error');
    } catch { showToast('Ошибка копирования', 'error'); }
    setOpenDropdownId(null);
  };

  const formatDelay = (minutes, delayCfg) => {
    if (delayCfg) {
      const cfg = typeof delayCfg === 'string' ? (() => { try { return JSON.parse(delayCfg); } catch { return null; } })() : delayCfg;
      if (cfg) {
        switch (cfg.type) {
          case 'after_seconds': {
            const v = cfg.value || 0;
            const u = cfg.unit || 'minutes';
            const labels = { seconds: 'сек.', minutes: 'мин.', hours: 'ч.', days: 'дн.' };
            return `${v} ${labels[u] || u}`;
          }
          case 'at_day_time':
            return `через ${cfg.days} дн. в ${cfg.time}`;
          case 'at_weekday_time':
            return `${WEEKDAYS[cfg.weekday] || '?'} в ${cfg.time}`;
          case 'at_exact_date':
            if (cfg.datetime) {
              const d = new Date(cfg.datetime);
              return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            }
            return 'дата не задана';
          default:
            break;
        }
      }
    }
    // Fallback for old steps without delay_config
    if (minutes < 60) return `${minutes} мин.`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} ч.`;
    return `${Math.round(minutes / 1440)} дн.`;
  };

  return (
    <Paywall>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>Воронки сообщений</h2>
        </div>

        {loading ? <Loading /> : funnels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            <p>Нет лид-магнитов. Воронки привязаны к лид-магнитам.</p>
            <p style={{ fontSize: '0.85rem' }}>Создайте лид-магнит в разделе «Пин-посты» для настройки воронки.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {funnels.map(lm => (
              <div key={lm.id} style={{
                background: 'var(--bg-glass)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '20px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>{lm.title}</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Код: {lm.code}</span>
                  </div>
                  <button className="btn btn-primary" style={btnSmall} onClick={() => openCreateStep(lm)}>
                    + Шаг
                  </button>
                </div>

                {(lm.steps || []).length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0' }}>
                    Нет шагов. Добавьте первый шаг воронки.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(lm.steps || []).map((step) => (
                      <div key={step.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                        padding: '12px', background: 'var(--bg)', borderRadius: '8px',
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 600, fontSize: '0.85rem', flexShrink: 0,
                        }}>
                          {step.step_number}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{ fontSize: '0.88rem', marginBottom: '4px', maxHeight: '60px', overflowY: 'auto', lineHeight: 1.5 }}
                            dangerouslySetInnerHTML={{ __html: step.message_text || '' }}
                          />
                          <div style={{ display: 'flex', gap: '12px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            <span>Задержка: {formatDelay(step.delay_minutes, step.delay_config)}</span>
                            {step.inline_buttons && <span>Кнопки: есть</span>}
                            {step.file_url && <span>Файл: есть</span>}
                            {step.is_active === false && <span style={{ color: 'var(--error)' }}>Неактивен</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                          <button className="btn btn-outline" style={btnSmall} onClick={() => openEditStep(lm, step)}>Ред.</button>
                          <div style={{ position: 'relative' }}>
                            <button className="btn btn-outline" style={btnSmall} onClick={() => setOpenDropdownId(openDropdownId === step.id ? null : step.id)}>
                              Ещё ⋮
                            </button>
                            {openDropdownId === step.id && (
                              <div style={{
                                position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                                background: 'var(--bg)', border: '1px solid var(--border)',
                                borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                zIndex: 100, minWidth: '180px', overflow: 'hidden',
                              }}>
                                <button
                                  style={dropdownItem}
                                  onClick={() => handleCopyStep(lm, step)}
                                >
                                  📋 Копировать шаг
                                </button>
                                <button
                                  style={{ ...dropdownItem, color: 'var(--error)' }}
                                  onClick={() => { setOpenDropdownId(null); handleDeleteStep(lm, step); }}
                                >
                                  🗑️ Удалить
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingStep ? 'Редактировать шаг' : `Добавить шаг: ${selectedLm?.title || ''}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Message text */}
            <div ref={messageRef}>
              <label className="form-label">Текст сообщения *</label>
              <div className={errors.message_text ? 'field-error-wrapper' : ''}>
                <RichTextEditor
                  value={form.message_text}
                  onChange={(val) => { setForm(p => ({ ...p, message_text: val })); if (val.trim()) setErrors(e => ({ ...e, message_text: '' })); }}
                  placeholder="Текст сообщения воронки... Поддерживает HTML: <b>, <i>, <a href>"
                  rows={5}
                  showEmoji={true}
                  className={errors.message_text ? 'field-error' : ''}
                />
              </div>
              {errors.message_text && <div className="field-error-text">{errors.message_text}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <div className="form-hint" style={{ margin: 0 }}>Это сообщение будет отправлено подписчику после задержки. Поддерживается HTML.</div>
                <button
                  type="button"
                  className={`btn ${showPreview ? 'btn-primary' : 'btn-outline'}`}
                  style={btnSmall}
                  onClick={() => setShowPreview(p => !p)}
                >
                  Предпросмотр
                </button>
              </div>
              {showPreview && (
                <div style={{
                  background: '#1e1e2e', color: '#e0e0e0', borderRadius: '12px',
                  padding: '16px', maxWidth: '400px', marginTop: '8px',
                  fontSize: '0.9rem', lineHeight: 1.6, wordBreak: 'break-word',
                }}>
                  {form.message_text.trim()
                    ? <div dangerouslySetInnerHTML={{ __html: form.message_text }} />
                    : <span style={{ color: '#888' }}>Введите текст для предпросмотра</span>
                  }
                </div>
              )}
            </div>

            {/* File attachment */}
            <div>
              <label className="form-label">Вложение (опционально)</label>
              <AttachmentPicker
                file={stepFile}
                onFileChange={setStepFile}
                attachType={form.attach_type}
                onAttachTypeChange={v => setForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={editingStep?.file_url ? 'файл прикреплён' : ''}
              />
            </div>

            {/* Delay settings */}
            <div>
              <label className="form-label">Задержка отправки</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                {/* Radio buttons */}
                <label style={radioLabel}>
                  <input type="radio" name="delayType" value="after_seconds" checked={delayType === 'after_seconds'}
                    onChange={() => setDelayType('after_seconds')} />
                  <span>Через N секунд/минут/часов/дней</span>
                </label>
                <label style={radioLabel}>
                  <input type="radio" name="delayType" value="at_day_time" checked={delayType === 'at_day_time'}
                    onChange={() => setDelayType('at_day_time')} />
                  <span>Через N дней в HH:MM</span>
                </label>
                <label style={radioLabel}>
                  <input type="radio" name="delayType" value="at_weekday_time" checked={delayType === 'at_weekday_time'}
                    onChange={() => setDelayType('at_weekday_time')} />
                  <span>В день недели в HH:MM</span>
                </label>
                <label style={radioLabel}>
                  <input type="radio" name="delayType" value="at_exact_date" checked={delayType === 'at_exact_date'}
                    onChange={() => setDelayType('at_exact_date')} />
                  <span>В конкретную дату и время</span>
                </label>
              </div>

              {/* Type-specific fields */}
              <div style={{ marginTop: '10px', padding: '12px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                {delayType === 'after_seconds' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Через</span>
                    <input className="form-input" type="number" min={1} value={delayValue}
                      onChange={e => setDelayValue(parseInt(e.target.value) || 1)}
                      style={{ width: '80px' }} />
                    <select className="form-input" value={delayUnit} onChange={e => setDelayUnit(e.target.value)}
                      style={{ width: 'auto', minWidth: '110px' }}>
                      <option value="seconds">секунды</option>
                      <option value="minutes">минуты</option>
                      <option value="hours">часы</option>
                      <option value="days">дни</option>
                    </select>
                  </div>
                )}

                {delayType === 'at_day_time' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Через</span>
                    <input className="form-input" type="number" min={1} value={delayDays}
                      onChange={e => setDelayDays(parseInt(e.target.value) || 1)}
                      style={{ width: '70px' }} />
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>дн. в</span>
                    <input className="form-input" type="time" value={delayTime}
                      onChange={e => setDelayTime(e.target.value)}
                      style={{ width: 'auto' }} />
                  </div>
                )}

                {delayType === 'at_weekday_time' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>В</span>
                    <select className="form-input" value={delayWeekday} onChange={e => setDelayWeekday(parseInt(e.target.value))}
                      style={{ width: 'auto', minWidth: '140px' }}>
                      {WEEKDAYS.map((name, i) => (
                        <option key={i} value={i}>{name}</option>
                      ))}
                    </select>
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>в</span>
                    <input className="form-input" type="time" value={delayTime}
                      onChange={e => setDelayTime(e.target.value)}
                      style={{ width: 'auto' }} />
                  </div>
                )}

                {delayType === 'at_exact_date' && (
                  <div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Дата и время:</span>
                      <input className={`form-input${errors.datetime ? ' field-error' : ''}`} type="datetime-local" value={delayDatetime}
                        onChange={e => { setDelayDatetime(e.target.value); if (e.target.value) setErrors(er => ({ ...er, datetime: '' })); }}
                        style={{ width: 'auto', flex: 1 }} />
                    </div>
                    {errors.datetime && <div className="field-error-text">{errors.datetime}</div>}
                  </div>
                )}
              </div>
              <div className="form-hint">Задержка отсчитывается от момента получения лид-магнита подписчиком.</div>
            </div>

            {/* Inline buttons */}
            <div>
              <label className="form-label">Инлайн-кнопки (опционально)</label>
              <ButtonBuilder
                value={form.inline_buttons}
                onChange={(val) => setForm(p => ({ ...p, inline_buttons: val }))}
                leadMagnets={leadMagnets}
                showLeadMagnet={true}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
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
const radioLabel = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' };
const dropdownItem = {
  display: 'block', width: '100%', padding: '10px 14px', border: 'none',
  background: 'none', textAlign: 'left', fontSize: '0.85rem', cursor: 'pointer',
  color: 'inherit', whiteSpace: 'nowrap',
};
