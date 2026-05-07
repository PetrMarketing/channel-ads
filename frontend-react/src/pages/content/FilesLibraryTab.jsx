/**
 * Вкладка «Мои файлы» — 3 суб-таба:
 *  - Ваши файлы (вложения постов)
 *  - Генерации текста
 *  - Генерации фото
 * Лимит 50 на каждый таб.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const SUBTABS = [
  { id: 'files', label: 'Ваши файлы', emoji: '📎' },
  { id: 'text',  label: 'Генерации текста', emoji: '✏️' },
  { id: 'image', label: 'Генерации фото', emoji: '🖼' },
];

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} КБ`;
  return `${(b / 1024 / 1024).toFixed(1)} МБ`;
}

function fileTypeEmoji(t) {
  return t === 'photo' ? '📷' : t === 'video' ? '🎬' : t === 'video_note' ? '⭕' : t === 'voice' ? '🎤' : t === 'audio' ? '🎵' : '📄';
}

export default function FilesLibraryTab({ tc }) {
  const { showToast } = useToast();
  const [sub, setSub] = useState('files');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [textPreview, setTextPreview] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    setItems([]);
    try {
      const url = sub === 'files'
        ? `/files/${tc}/files`
        : sub === 'text'
          ? `/files/${tc}/text-generations`
          : `/files/${tc}/image-generations`;
      const data = await api.get(url);
      if (data?.success) setItems(data.items || []);
    } catch (e) {
      showToast(e.message || 'Ошибка загрузки', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc, sub, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirmDel) return;
    const id = confirmDel.id;
    setConfirmDel(null);
    try {
      const url = sub === 'text'
        ? `/files/${tc}/text-generations/${id}`
        : `/files/${tc}/image-generations/${id}`;
      const data = await api.delete(url);
      if (data?.success) {
        showToast('Удалено');
        load();
      }
    } catch (e) {
      showToast('Ошибка удаления: ' + (e.message || ''), 'error');
    }
  };

  return (
    <div style={{ animation: 'fxFade 0.3s ease' }}>
      <style>{`
        @keyframes fxFade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <div style={{
        display: 'flex', gap: 6, marginBottom: 18,
        padding: 4, borderRadius: 12,
        background: SOFT_BG, border: `1px solid ${BORDER}`,
        width: 'fit-content', flexWrap: 'wrap',
      }}>
        {SUBTABS.map(t => {
          const active = sub === t.id;
          return (
            <button key={t.id} onClick={() => setSub(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, border: 'none',
                cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600,
                color: active ? '#fff' : DARK,
                background: active ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` : 'transparent',
                boxShadow: active ? `0 3px 10px ${ACCENT}30` : 'none',
                transition: 'all .15s ease',
              }}>
              <span>{t.emoji}</span>{t.label}
            </button>
          );
        })}
      </div>

      {!tc && <Empty emoji="📺" text="Выберите канал в шапке" />}
      {tc && loading && <Empty emoji="⏳" text="Загружаем…" />}
      {tc && !loading && items.length === 0 && (
        <Empty emoji={SUBTABS.find(t => t.id === sub)?.emoji || '📁'}
               text={sub === 'files' ? 'У этого канала ещё нет файлов в постах' : sub === 'text' ? 'Пока нет сгенерированных текстов' : 'Пока нет сгенерированных картинок'} />
      )}

      {tc && !loading && items.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: '0.84rem', color: MUTED }}>
              Показано: <b style={{ color: DARK }}>{items.length}</b> {items.length === 50 && <span>(макс)</span>}
            </div>
            <div style={{ fontSize: '0.74rem', color: MUTED }}>
              Хранится последние 50 записей
            </div>
          </div>

          {sub === 'image' ? (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {items.map(it => (
                <ImageCard key={it.id} item={it} onPreview={() => setPreviewUrl(it.image_url)} onDelete={() => setConfirmDel({ id: it.id, label: 'эту картинку' })} />
              ))}
            </div>
          ) : sub === 'text' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map(it => (
                <TextCard key={it.id} item={it} onOpen={() => setTextPreview(it)} onDelete={() => setConfirmDel({ id: it.id, label: 'эту генерацию текста' })} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {items.map(it => (
                <FileCard key={it.id} item={it} onPreview={() => it.file_type === 'photo' && setPreviewUrl(it.file_url)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Image preview modal */}
      {previewUrl && (
        <div onClick={() => setPreviewUrl(null)} style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(26,26,46,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <img src={previewUrl} alt="" style={{ maxWidth: '95vw', maxHeight: '95vh', borderRadius: 12, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }} />
        </div>
      )}

      {/* Text preview modal */}
      <Modal isOpen={!!textPreview} onClose={() => setTextPreview(null)} title="Сгенерированный текст" wide>
        {textPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: SOFT_BG, border: `1px solid ${BORDER}`,
              fontSize: '0.82rem',
            }}>
              <div style={{ color: MUTED, fontWeight: 600, marginBottom: 4 }}>Промт:</div>
              <div style={{ color: DARK }}>{textPreview.prompt}</div>
            </div>
            <div>
              <div style={{ color: MUTED, fontWeight: 600, marginBottom: 4, fontSize: '0.82rem' }}>Текст:</div>
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                border: `1px solid ${BORDER}`, background: '#fff',
                fontSize: '0.92rem', lineHeight: 1.55, color: DARK,
                maxHeight: '50vh', overflowY: 'auto',
                whiteSpace: 'pre-wrap',
              }} dangerouslySetInnerHTML={{ __html: textPreview.text }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={async () => {
                try {
                  await navigator.clipboard.writeText(textPreview.text);
                  showToast('Скопировано');
                } catch {}
              }} style={{
                padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                background: '#fff', border: `1px solid ${BORDER}`, color: DARK,
                fontSize: '0.86rem', fontWeight: 600,
              }}>📋 Скопировать</button>
              <button onClick={() => setTextPreview(null)} style={{
                padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                color: '#fff', fontSize: '0.86rem', fontWeight: 700,
              }}>Закрыть</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Удалить запись?"
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={{
              padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
              background: '#fff', border: '1px solid #e5e7eb', color: DARK,
              fontSize: '0.88rem', fontWeight: 600,
            }}>Отмена</button>
            <button onClick={handleDelete} style={{
              padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #e63946, #b71c1c)',
              color: '#fff', fontSize: '0.88rem', fontWeight: 700,
              boxShadow: '0 4px 14px rgba(230,57,70,0.40)',
            }}>Удалить</button>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{
            flexShrink: 0, width: 44, height: 44, borderRadius: 11,
            background: 'rgba(230,57,70,0.10)', color: DANGER,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem',
          }}>⚠️</div>
          <p style={{ margin: 0, fontSize: '0.92rem', color: DARK, lineHeight: 1.5 }}>
            Вы точно хотите удалить {confirmDel?.label || 'эту запись'}? Она удалится безвозвратно.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function ImageCard({ item, onPreview, onDelete }) {
  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden',
      background: '#fff', border: `1px solid ${BORDER}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div onClick={onPreview} style={{
        cursor: 'pointer', position: 'relative',
        aspectRatio: '1 / 1', overflow: 'hidden',
        background: SOFT_BG,
      }}>
        {item.image_url ? (
          <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: '0.84rem' }}>
            нет файла
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div title={item.prompt} style={{
          fontSize: '0.78rem', color: DARK, lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{item.prompt || '—'}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: '0.7rem', color: MUTED }}>
            {fmtDate(item.created_at)} · −{item.tokens} ИИт
            {item.metadata?.format && <> · {item.metadata.format}</>}
          </div>
          <button onClick={onDelete} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: DANGER, fontSize: '0.92rem', padding: 0,
          }} title="Удалить">🗑</button>
        </div>
      </div>
    </div>
  );
}

function TextCard({ item, onOpen, onDelete }) {
  const preview = (item.text || '').replace(/<[^>]+>/g, '').slice(0, 220);
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: '#fff', border: `1px solid ${BORDER}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div title={item.prompt} style={{
        fontSize: '0.78rem', color: ACCENT, fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        🪄 {item.prompt || '—'}
      </div>
      <div onClick={onOpen} style={{
        fontSize: '0.86rem', color: DARK, lineHeight: 1.5, cursor: 'pointer',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {preview || '—'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: '0.72rem', color: MUTED }}>
          {fmtDate(item.created_at)} · −{item.tokens} ИИт
          {item.metadata?.use_channel_style && <> · в стиле канала</>}
          {item.metadata?.has_file && <> · файл</>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onOpen} style={{
            padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
            background: '#fff', border: `1px solid ${BORDER}`, color: DARK,
            fontSize: '0.74rem', fontWeight: 600,
          }}>Открыть</button>
          <button onClick={onDelete} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: DANGER, fontSize: '0.92rem', padding: 0,
          }} title="Удалить">🗑</button>
        </div>
      </div>
    </div>
  );
}

function FileCard({ item, onPreview }) {
  const isPhoto = item.file_type === 'photo';
  const statusMeta = {
    draft: { label: 'Черновик', color: WARNING, bg: 'rgba(245,158,11,0.10)' },
    scheduled: { label: 'Запланирован', color: ACCENT, bg: 'rgba(67,97,238,0.10)' },
    published: { label: 'Опубликован', color: SUCCESS, bg: 'rgba(16,185,129,0.10)' },
  }[item.status] || { label: item.status, color: MUTED, bg: SOFT_BG };
  return (
    <div style={{
      padding: 12, borderRadius: 12,
      background: '#fff', border: `1px solid ${BORDER}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex', gap: 10, alignItems: 'center',
    }}>
      {isPhoto && item.file_url ? (
        <img src={item.file_url} alt="" onClick={onPreview} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', cursor: 'pointer', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 56, height: 56, borderRadius: 10,
          background: SOFT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.6rem', flexShrink: 0,
        }}>{fileTypeEmoji(item.file_type)}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.86rem', fontWeight: 700, color: DARK,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title || '—'}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{
            padding: '2px 8px', borderRadius: 12,
            background: statusMeta.bg, color: statusMeta.color,
            fontSize: '0.66rem', fontWeight: 700,
          }}>{statusMeta.label}</span>
          <span style={{ fontSize: '0.7rem', color: MUTED }}>
            {fmtDate(item.created_at)}
            {item.size_bytes > 0 && <> · {fmtSize(item.size_bytes)}</>}
          </span>
        </div>
      </div>
      {item.file_url && (
        <a href={item.file_url} target="_blank" rel="noreferrer" style={{
          padding: '6px 12px', borderRadius: 8,
          background: '#fff', border: `1px solid ${BORDER}`, color: DARK,
          fontSize: '0.74rem', fontWeight: 600, textDecoration: 'none',
          flexShrink: 0,
        }}>Открыть</a>
      )}
    </div>
  );
}

function Empty({ emoji, text }) {
  return (
    <div style={{
      padding: '56px 32px', textAlign: 'center',
      borderRadius: 14, background: '#fff', border: `1px solid ${BORDER}`,
    }}>
      <div style={{ fontSize: '2.6rem', marginBottom: 10 }}>{emoji}</div>
      <div style={{ fontSize: '0.92rem', color: MUTED }}>{text}</div>
    </div>
  );
}
