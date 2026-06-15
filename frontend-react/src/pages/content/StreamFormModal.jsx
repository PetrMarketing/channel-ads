import { useState } from 'react';
import { api } from '../../services/api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

const STREAM_TYPES = [
  {
    key: 'vk', title: 'VK',
    desc: 'Подходит для крупных школ. Без ограничения по времени и количеству зрителей. Через браузер или OBS.',
    hint: 'Вставьте URL встраивания плеера VK (https://vk.com/video_ext.php?…).',
  },
  {
    key: 'kinescope', title: 'Kinescope',
    desc: 'Оптимально для больших школ. Нет ограничений по времени и количеству зрителей. Трансляции через OBS.',
    hint: 'URL встраивания Kinescope (https://kinescope.io/embed/…).',
  },
  {
    key: 'rutube', title: 'RUTUBE',
    desc: 'Трансляция через сервис RUTUBE с помощью OBS или других специальных программ.',
    hint: 'URL встраивания RUTUBE (https://rutube.ru/play/embed/…).',
  },
  {
    key: 'encoder', title: 'Видеокодер',
    desc: 'Трансляция через OBS или другую программу-кодировщик. RTMP-ссылка и ключ генерируются автоматически — скопируйте их в OBS.',
    hint: 'Эти данные вставьте в OBS → Настройки → Вещание.',
  },
  {
    key: 'youtube', title: 'YouTube',
    desc: 'Трансляция через сервера YouTube. Возможность трансляции через браузер или видеокодер.',
    hint: 'URL встраивания YouTube (https://www.youtube.com/embed/…).',
  },
];

const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
  boxSizing: 'border-box', outline: 'none',
};
const labelStyle = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' };
const btnPrimary = {
  padding: '10px 18px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #4361ee 0%, #7b68ee 100%)',
  color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
const btnOutline = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db',
  background: '#fff', cursor: 'pointer', fontSize: 13,
};

function toLocal(iso) {
  if (!iso) return '';
  try { return new Date(iso).toISOString().slice(0, 16); } catch { return ''; }
}

export default function StreamFormModal({ tc, stream, onClose, onSaved }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(() => ({
    title: stream?.title || '',
    description: stream?.description || '',
    starts_at: toLocal(stream?.starts_at) || '',
    bg_image_url: stream?.bg_image_url || '',
    stream_type: stream?.stream_type || 'vk',
    embed_url: stream?.embed_url || '',
    stream_url: stream?.stream_url || '',
    stream_key: stream?.stream_key || '',
  }));
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const copy = (text) => {
    try { navigator.clipboard.writeText(text); showToast('Скопировано'); }
    catch { showToast('Не удалось скопировать'); }
  };

  const regenerateKey = async () => {
    if (!stream?.id) { showToast('Сначала сохраните эфир'); return; }
    if (!confirm('Перевыпустить RTMP ключ? Старый перестанет работать.')) return;
    try {
      const d = await api.post(`/streams/${tc}/${stream.id}/regenerate-key`);
      if (d?.success) {
        set('stream_url', d.stream_url);
        set('stream_key', d.stream_key);
        showToast('Ключ обновлён');
      }
    } catch (e) { showToast('Ошибка'); }
  };

  const save = async () => {
    if (!form.title.trim()) { showToast('Укажите заголовок'); return; }
    if (!form.starts_at) { showToast('Укажите дату начала'); return; }
    setSaving(true);
    try {
      const body = { ...form };
      if (stream?.id) {
        await api.put(`/streams/${tc}/${stream.id}`, body);
      } else {
        await api.post(`/streams/${tc}`, body);
      }
      onSaved();
    } catch (e) {
      showToast(e.message || 'Ошибка сохранения');
    } finally { setSaving(false); }
  };

  const currentType = STREAM_TYPES.find(t => t.key === form.stream_type);

  return (
    <Modal isOpen={true} onClose={onClose} title={stream?.id ? 'Редактировать эфир' : 'Создать эфир'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto', paddingRight: 6 }}>
        <div>
          <label style={labelStyle}>Заголовок</label>
          <input style={inputStyle} value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Заголовок для зрителей" />
        </div>

        <div>
          <label style={labelStyle}>Описание (необязательно)</label>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="О чём будет эфир" />
        </div>

        <div>
          <label style={labelStyle}>Дата начала</label>
          <input style={inputStyle} type="datetime-local"
            value={form.starts_at}
            onChange={e => set('starts_at', e.target.value)} />
        </div>

        <div>
          <label style={labelStyle}>Фон для страницы анонса</label>
          <input style={inputStyle} value={form.bg_image_url}
            onChange={e => set('bg_image_url', e.target.value)}
            placeholder="URL картинки — иначе чёрный фон с названием" />
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            Если указана картинка — она будет размыта и приглушена чёрным на 50%.
          </div>
          {form.bg_image_url && (
            <div style={{
              marginTop: 8, height: 100, borderRadius: 10,
              background: `linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)),url(${form.bg_image_url}) center/cover`,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              filter: 'blur(0)', fontWeight: 700, fontSize: 16, textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            }}>
              {form.title || 'Превью фона'}
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Тип трансляции</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STREAM_TYPES.map(t => {
              const isSel = form.stream_type === t.key;
              return (
                <div key={t.key}
                  onClick={() => set('stream_type', t.key)}
                  style={{
                    border: `2px solid ${isSel ? '#4361ee' : '#e5e7eb'}`,
                    borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                    background: isSel ? 'rgba(67,97,238,0.04)' : '#fff',
                    transition: 'all .15s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <b style={{ fontSize: 14 }}>{t.title}</b>
                    <span style={{
                      padding: '2px 10px', borderRadius: 999,
                      background: isSel ? '#4361ee' : 'transparent',
                      color: isSel ? '#fff' : '#4361ee',
                      border: `1px solid #4361ee`, fontSize: 12, fontWeight: 600,
                    }}>{isSel ? 'Выбран' : 'Выбрать'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{t.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {form.stream_type !== 'encoder' && (
          <div>
            <label style={labelStyle}>URL встраивания (embed)</label>
            <input style={inputStyle} value={form.embed_url}
              onChange={e => set('embed_url', e.target.value)}
              placeholder={currentType?.hint || 'https://…'} />
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{currentType?.hint}</div>
          </div>
        )}

        {form.stream_type === 'encoder' && (
          <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <b style={{ fontSize: 14 }}>🎛 Настройки OBS</b>
              {stream?.id && (
                <button type="button" onClick={regenerateKey}
                  style={{ ...btnOutline, fontSize: 12, padding: '4px 10px',
                           background: 'transparent', borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                  Перевыпустить ключ
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
              Откройте OBS → Настройки → Вещание → Сервис: Custom — и вставьте эти данные.
              {!stream?.id && ' RTMP-ссылка и ключ сгенерируются автоматически после сохранения.'}
            </div>
            {form.stream_url && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Сервер (URL)</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input readOnly value={form.stream_url}
                    style={{ ...inputStyle, background: 'rgba(255,255,255,0.05)', color: '#fff', borderColor: 'rgba(255,255,255,0.1)', fontFamily: 'monospace', fontSize: 13 }} />
                  <button type="button" onClick={() => copy(form.stream_url)}
                    style={{ ...btnOutline, background: '#4361ee', color: '#fff', border: 'none' }}>📋</button>
                </div>
              </div>
            )}
            {form.stream_key && (
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Ключ потока</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input readOnly value={form.stream_key}
                    style={{ ...inputStyle, background: 'rgba(255,255,255,0.05)', color: '#fff', borderColor: 'rgba(255,255,255,0.1)', fontFamily: 'monospace', fontSize: 13 }} />
                  <button type="button" onClick={() => copy(form.stream_key)}
                    style={{ ...btnOutline, background: '#4361ee', color: '#fff', border: 'none' }}>📋</button>
                </div>
              </div>
            )}
            {!form.stream_url && !form.stream_key && (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontStyle: 'italic' }}>
                Сохраните эфир — данные для OBS появятся здесь.
              </div>
            )}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>URL встраивания для зрителей (опционально)</div>
              <input style={inputStyle} value={form.embed_url}
                onChange={e => set('embed_url', e.target.value)}
                placeholder="https://… (если хотите, чтобы зрители смотрели в miniapp)" />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6, position: 'sticky', bottom: 0, background: '#fff', paddingTop: 10 }}>
          <button style={btnOutline} onClick={onClose} disabled={saving}>Отмена</button>
          <button style={btnPrimary} onClick={save} disabled={saving}>
            {saving ? 'Сохранение…' : (stream?.id ? 'Сохранить' : 'Создать эфир')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
