import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import ButtonBuilder from '../components/ButtonBuilder';
import AttachmentPicker from '../components/AttachmentPicker';
import MessagePreview from '../components/MessagePreview';

const STATUS_LABELS = { draft: 'Черновик', scheduled: 'Запланировано', published: 'Опубликовано' };
const STATUS_COLORS = { draft: '#888', scheduled: '#3b82f6', published: 'var(--success)' };

const btnSmall = { padding: '4px 10px', fontSize: '0.8rem' };

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // getDay() returns 0=Sun..6=Sat; convert to 0=Mon..6=Sun
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  const days = [];

  // Previous month days
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    days.push({ day: prevMonthLast - i, month: month - 1, year, otherMonth: true });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ day: d, month, year, otherMonth: false });
  }

  // Next month days to fill remaining cells (complete last row)
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      days.push({ day: d, month: month + 1, year, otherMonth: true });
    }
  }

  return days;
}

function toDateKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function scrollToRef(ref) {
  if (ref?.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current.classList.add('field-shake');
    setTimeout(() => ref.current.classList.remove('field-shake'), 500);
  }
}

export default function ContentPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [form, setForm] = useState({ title: '', message_text: '', scheduled_at: '', inline_buttons: '', attach_type: '' });
  const [postFile, setPostFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [leadMagnets, setLeadMagnets] = useState([]);
  const [viewMode, setViewMode] = useState('calendar'); // 'list' | 'calendar'
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [errors, setErrors] = useState({});

  const messageRef = useRef(null);

  const tc = currentChannel?.tracking_code;

  const loadPosts = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/content/${tc}`);
      if (data.success) setPosts(data.posts || []);
    } catch {
      showToast('Ошибка загрузки контента', 'error');
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
      // silently ignore
    }
  }, [tc]);

  useEffect(() => { loadPosts(); loadLeadMagnets(); }, [loadPosts, loadLeadMagnets]);

  const openCreate = (prefillDate) => {
    setEditingPost(null);
    setPostFile(null);
    setErrors({});
    const scheduledAt = prefillDate
      ? `${prefillDate}T10:00`
      : '';
    setForm({ title: '', message_text: '', scheduled_at: scheduledAt, inline_buttons: '', attach_type: '' });
    setShowModal(true);
  };

  const openEdit = (post) => {
    setEditingPost(post);
    setPostFile(null);
    setErrors({});
    let btns = '';
    if (post.inline_buttons) {
      try { btns = typeof post.inline_buttons === 'string' ? post.inline_buttons : JSON.stringify(post.inline_buttons, null, 2); } catch {}
    }
    setForm({
      title: post.title || '',
      message_text: post.message_text || '',
      scheduled_at: post.scheduled_at ? post.scheduled_at.slice(0, 16) : '',
      inline_buttons: btns,
      attach_type: post.attach_type || '',
    });
    setShowModal(true);
  };

  const validate = () => {
    const newErrors = {};
    if (!form.message_text.trim()) newErrors.message_text = 'Текст поста обязателен';
    setErrors(newErrors);
    if (newErrors.message_text) scrollToRef(messageRef);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const defaultTitle = form.title.trim() || `Публикация от ${new Date().toLocaleDateString('ru-RU')}`;
      let parsedButtons = null;
      if (form.inline_buttons && form.inline_buttons.trim()) {
        try {
          parsedButtons = JSON.parse(form.inline_buttons);
        } catch {
          showToast('Неверный формат JSON для кнопок', 'error');
          setSaving(false);
          return;
        }
      }

      let data;

      if (postFile) {
        // Use FormData for file upload
        const fd = new FormData();
        fd.append('title', defaultTitle);
        fd.append('message_text', form.message_text);
        fd.append('scheduled_at', form.scheduled_at || '');
        if (parsedButtons) {
          fd.append('inline_buttons', JSON.stringify(parsedButtons));
        }
        if (form.attach_type) fd.append('attach_type', form.attach_type);
        fd.append('file', postFile);

        if (editingPost) {
          data = await api.upload(`/content/${tc}/${editingPost.id}`, fd, 'PUT');
        } else {
          data = await api.upload(`/content/${tc}`, fd);
        }
      } else {
        const payload = {
          title: defaultTitle,
          message_text: form.message_text,
          scheduled_at: form.scheduled_at || null,
        };
        if (parsedButtons) {
          payload.inline_buttons = parsedButtons;
        }
        if (form.attach_type) payload.attach_type = form.attach_type;

        if (editingPost) {
          data = await api.put(`/content/${tc}/${editingPost.id}`, payload);
        } else {
          data = await api.post(`/content/${tc}`, payload);
        }
      }

      if (data.success) {
        showToast(editingPost ? 'Пост обновлён' : 'Пост создан');
        setShowModal(false);
        loadPosts();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить пост?')) return;
    try {
      const data = await api.delete(`/content/${tc}/${id}`);
      if (data.success) { showToast('Пост удалён'); loadPosts(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handlePublish = async (post) => {
    if (!window.confirm('Опубликовать пост в канал?')) return;
    try {
      const data = await api.post(`/content/${tc}/${post.id}/publish`);
      if (data.success) { showToast('Пост опубликован'); loadPosts(); }
      else showToast(data.error || 'Ошибка публикации', 'error');
    } catch { showToast('Ошибка публикации', 'error'); }
  };

  // Calendar helpers
  const calendarDays = useMemo(() => getCalendarDays(calYear, calMonth), [calYear, calMonth]);

  const postsByDate = useMemo(() => {
    const map = {};
    posts.forEach(post => {
      const key = toDateKey(post.scheduled_at) || toDateKey(post.published_at) || toDateKey(post.created_at);
      if (key) {
        if (!map[key]) map[key] = [];
        map[key].push(post);
      }
    });
    return map;
  }, [posts]);

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
    return fmt.format(new Date(calYear, calMonth, 1));
  }, [calYear, calMonth]);

  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const renderListView = () => {
    if (loading) return <Loading />;
    if (posts.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Нет постов. Создайте первую публикацию.
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {posts.map(post => (
          <div key={post.id} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  {post.title && <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{post.title}</span>}
                  <span style={{
                    fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px',
                    background: STATUS_COLORS[post.status] || '#888', color: '#fff',
                  }}>
                    {STATUS_LABELS[post.status] || post.status}
                  </span>
                  {post.ai_generated ? (
                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                      AI
                    </span>
                  ) : null}
                </div>
                <div
                  style={{ fontSize: '0.88rem', marginBottom: '6px', maxHeight: '80px', overflowY: 'auto', lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: post.message_text || '' }}
                />
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {post.scheduled_at && <span>Запланировано: {new Date(post.scheduled_at).toLocaleString('ru-RU')}</span>}
                  {post.published_at && <span>Опубликовано: {new Date(post.published_at).toLocaleString('ru-RU')}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {post.status !== 'published' && (
                  <>
                    <button className="btn btn-outline" style={btnSmall} onClick={() => openEdit(post)}>Ред.</button>
                    <button className="btn btn-primary" style={btnSmall} onClick={() => handlePublish(post)}>Опубликовать</button>
                  </>
                )}
                <button className="btn btn-danger" style={btnSmall} onClick={() => handleDelete(post.id)}>Удалить</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCalendarView = () => {
    if (loading) return <Loading />;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <button className="btn btn-outline" style={btnSmall} onClick={prevMonth}>&larr;</button>
          <span style={{ fontWeight: 600, fontSize: '1.05rem', textTransform: 'capitalize' }}>{monthLabel}</span>
          <button className="btn btn-outline" style={btnSmall} onClick={nextMonth}>&rarr;</button>
        </div>
        <div className="calendar-grid">
          {WEEKDAYS.map(wd => (
            <div key={wd} className="calendar-header-cell">{wd}</div>
          ))}
          {calendarDays.map((cell, idx) => {
            const normalizedDate = new Date(cell.year, cell.month, cell.day);
            const nKey = `${normalizedDate.getFullYear()}-${String(normalizedDate.getMonth() + 1).padStart(2, '0')}-${String(normalizedDate.getDate()).padStart(2, '0')}`;

            const dayPosts = postsByDate[nKey] || [];
            const isToday = nKey === today;

            return (
              <div
                key={idx}
                className={`calendar-cell${cell.otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}`}
                onClick={() => openCreate(nKey)}
              >
                <div className="day-number">{cell.day}</div>
                {dayPosts.map(post => (
                  <div
                    key={post.id}
                    className="post-title"
                    style={{
                      background: STATUS_COLORS[post.status] || '#888',
                      color: '#fff',
                      borderRadius: '3px',
                      padding: '1px 4px',
                      fontSize: '0.68rem',
                      marginTop: '2px',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={post.title || post.message_text?.slice(0, 50)}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(post);
                    }}
                  >
                    {post.title || post.message_text?.slice(0, 20) || 'Пост'}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Paywall>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h2>Контент-календарь</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ display: 'flex', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button
                className={viewMode === 'list' ? 'btn btn-primary' : 'btn btn-outline'}
                style={{ borderRadius: 0, ...btnSmall }}
                onClick={() => setViewMode('list')}
              >
                Список
              </button>
              <button
                className={viewMode === 'calendar' ? 'btn btn-primary' : 'btn btn-outline'}
                style={{ borderRadius: 0, ...btnSmall }}
                onClick={() => setViewMode('calendar')}
              >
                Календарь
              </button>
            </div>
            <button className="btn btn-primary" onClick={() => openCreate()}>+ Создать пост</button>
          </div>
        </div>

        {viewMode === 'list' ? renderListView() : renderCalendarView()}

        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingPost ? 'Редактировать пост' : 'Создать пост'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Заголовок</label>
              <input className="form-input" placeholder="Заголовок поста (необязательно)" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              <div className="form-hint">Внутренний заголовок для навигации. В канал отправляется только текст поста.</div>
            </div>
            <div ref={messageRef}>
              <label className="form-label">Текст поста *</label>
              <div className={errors.message_text ? 'field-error-wrapper' : ''}>
                <RichTextEditor
                  value={form.message_text}
                  onChange={val => { setForm(p => ({ ...p, message_text: val })); if (val.trim()) setErrors(e => ({ ...e, message_text: '' })); }}
                  placeholder="Текст публикации... Поддерживает HTML: <b>жирный</b>, <i>курсив</i>, <a href='URL'>ссылка</a>"
                  rows={6}
                  showEmoji={true}
                  className={errors.message_text ? 'field-error' : ''}
                />
              </div>
              {errors.message_text && <div className="field-error-text">{errors.message_text}</div>}
            </div>
            <div>
              <label className="form-label">Вложение</label>
              <AttachmentPicker
                file={postFile}
                onFileChange={setPostFile}
                attachType={form.attach_type}
                onAttachTypeChange={v => setForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={editingPost?.file_type || ''}
                existingFileUrl={editingPost?.file_path ? '/uploads/' + editingPost.file_path.split('/uploads/').pop() : ''}
              />
              <div className="form-hint">Фото, видео или документ. Telegram: макс. 50 МБ, MAX: макс. 100 МБ.</div>
            </div>
            <div>
              <label className="form-label">Дата публикации</label>
              <input className="form-input" type="datetime-local" value={form.scheduled_at}
                onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))} />
              <div className="form-hint">Пост будет опубликован автоматически в указанное время. Оставьте пустым для публикации вручную.</div>
            </div>
            <div>
              <label className="form-label">Инлайн-кнопки</label>
              <ButtonBuilder
                value={form.inline_buttons}
                onChange={val => setForm(p => ({ ...p, inline_buttons: val }))}
                leadMagnets={leadMagnets}
                showLeadMagnet={leadMagnets.length > 0}
              />
              <div className="form-hint">Кнопки под постом: ссылки, выдача лид-магнитов и др.</div>
            </div>
            <MessagePreview
              messageText={form.message_text}
              buttons={form.inline_buttons}
              file={postFile}
              fileUrl={!postFile && editingPost?.file_path ? '/uploads/' + editingPost.file_path.split('/uploads/').pop() : ''}
              tc={tc}
              entityType="content"
              entityId={editingPost?.id}
            />
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
