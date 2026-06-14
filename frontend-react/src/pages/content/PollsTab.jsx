import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

const cardStyle = {
  background: '#fff', borderRadius: 14, padding: '16px 18px',
  border: '1px solid rgba(67,97,238,0.08)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
};
const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
  boxSizing: 'border-box', outline: 'none',
};
const btnPrimary = {
  padding: '10px 18px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #4361ee 0%, #7b68ee 100%)',
  color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
const btnOutline = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db',
  background: '#fff', cursor: 'pointer', fontSize: 13,
};

export default function PollsTab({ tc }) {
  const { showToast } = useToast();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // {poll | null}
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const d = await api.get(`/polls/${tc}`);
      if (d?.success) setPolls(d.polls || []);
    } catch (e) { showToast('Ошибка загрузки опросов'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [tc]);

  const openCreate = () => {
    setEditing({
      question: '', options: ['', ''],
      is_anonymous: true, allow_multiple: false, is_closed: false,
    });
    setShowModal(true);
  };
  const openEdit = (poll) => {
    setEditing({
      id: poll.id,
      question: poll.question,
      options: (poll.options || []).map(o => o.text),
      is_anonymous: poll.is_anonymous,
      allow_multiple: poll.allow_multiple,
      is_closed: poll.is_closed,
      hasVotes: (poll.total_votes || 0) > 0,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!editing) return;
    const body = {
      question: editing.question.trim(),
      options: editing.options.map(o => (o || '').trim()).filter(Boolean),
      is_anonymous: editing.is_anonymous,
      allow_multiple: editing.allow_multiple,
      is_closed: editing.is_closed,
    };
    if (!body.question) { showToast('Укажите вопрос'); return; }
    if (body.options.length < 2 && !editing.hasVotes) { showToast('Минимум 2 варианта'); return; }
    try {
      if (editing.id) {
        await api.put(`/polls/${tc}/${editing.id}`, body);
      } else {
        await api.post(`/polls/${tc}`, body);
      }
      setShowModal(false);
      setEditing(null);
      load();
    } catch (e) {
      showToast(e.message || 'Ошибка сохранения');
    }
  };

  const remove = async (poll) => {
    if (!confirm(`Удалить опрос «${poll.question}»? Все голоса будут потеряны.`)) return;
    try {
      await api.delete(`/polls/${tc}/${poll.id}`);
      load();
    } catch (e) {
      showToast('Ошибка удаления');
    }
  };

  const updateOption = (idx, val) => {
    setEditing(prev => {
      const opts = [...prev.options];
      opts[idx] = val;
      return { ...prev, options: opts };
    });
  };
  const addOption = () => {
    setEditing(prev => prev.options.length >= 10 ? prev : { ...prev, options: [...prev.options, ''] });
  };
  const removeOption = (idx) => {
    setEditing(prev => prev.options.length <= 2 ? prev : { ...prev, options: prev.options.filter((_, i) => i !== idx) });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Опросы</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
            Создайте опрос — потом прикрепите его к посту в виде кнопок выбора.
          </p>
        </div>
        <button style={btnPrimary} onClick={openCreate}>+ Создать опрос</button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Загрузка…</div>
      ) : polls.length === 0 ? (
        <div style={{ ...cardStyle, padding: 50, textAlign: 'center', color: '#999' }}>
          Пока нет опросов. Создайте первый — например, «Какую тему разобрать на эфире?»
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {polls.map(p => (
            <div key={p.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>📊</span>
                    <b style={{ fontSize: 15 }}>{p.question}</b>
                    {p.is_closed && (
                      <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                        Закрыт
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {(p.options || []).map(o => (
                      <span key={o.id} style={{
                        fontSize: 12, padding: '4px 10px',
                        borderRadius: 999, background: 'rgba(67,97,238,0.08)',
                        color: '#3a4cc7', fontWeight: 500,
                      }}>
                        {o.text}
                        {p.total_votes > 0 && (
                          <span style={{ marginLeft: 6, color: '#666', fontSize: 11 }}>
                            {o.votes} · {o.percent}%
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {p.total_votes} {p.total_votes === 1 ? 'голос' : p.total_votes < 5 && p.total_votes > 0 ? 'голоса' : 'голосов'}
                    {' · '}
                    {p.is_anonymous ? 'анонимный' : 'открытый'}
                    {p.allow_multiple && ' · мульти-выбор'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={btnOutline} onClick={() => openEdit(p)}>Изменить</button>
                  <button style={{ ...btnOutline, color: '#dc2626' }} onClick={() => remove(p)}>×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && editing && (
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing.id ? 'Редактировать опрос' : 'Новый опрос'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>
                Вопрос
              </label>
              <input style={inputStyle} value={editing.question}
                onChange={e => setEditing({ ...editing, question: e.target.value })}
                placeholder="Какой формат контента вам интереснее?" />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>
                Варианты ответа
                {editing.hasVotes && (
                  <span style={{ color: '#d97706', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                    (опрос уже имеет голоса — варианты нельзя менять)
                  </span>
                )}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {editing.options.map((opt, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input style={inputStyle} value={opt}
                      disabled={editing.hasVotes}
                      onChange={e => updateOption(idx, e.target.value)}
                      placeholder={`Вариант ${idx + 1}`} />
                    {!editing.hasVotes && editing.options.length > 2 && (
                      <button style={{ ...btnOutline, padding: '8px 10px' }} onClick={() => removeOption(idx)}>×</button>
                    )}
                  </div>
                ))}
                {!editing.hasVotes && editing.options.length < 10 && (
                  <button style={{ ...btnOutline, alignSelf: 'flex-start', marginTop: 4 }} onClick={addOption}>
                    + Добавить вариант
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={editing.is_anonymous}
                  onChange={e => setEditing({ ...editing, is_anonymous: e.target.checked })} />
                Анонимный опрос (не показывать кто как проголосовал)
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={editing.allow_multiple}
                  onChange={e => setEditing({ ...editing, allow_multiple: e.target.checked })} />
                Можно выбрать несколько вариантов
              </label>
              {editing.id && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.is_closed}
                    onChange={e => setEditing({ ...editing, is_closed: e.target.checked })} />
                  Закрыть опрос (запретить голосовать)
                </label>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button style={btnOutline} onClick={() => setShowModal(false)}>Отмена</button>
              <button style={btnPrimary} onClick={save}>{editing.id ? 'Сохранить' : 'Создать'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
