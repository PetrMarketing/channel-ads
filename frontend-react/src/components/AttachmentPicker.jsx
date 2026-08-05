import { useRef } from 'react';

const ATTACH_TYPES = [
  { id: 'photo', label: '📷 Фото', accept: 'image/jpeg,image/png,image/gif,image/webp', maxMb: 50, hint: 'JPG, PNG, GIF, WebP. До 50 МБ.' },
  { id: 'video', label: '🎬 Видео', accept: 'video/mp4,video/quicktime,video/webm', maxMb: 50, hint: 'MP4, MOV, WebM. До 50 МБ.' },
  { id: 'video_note', label: '⭕ Кружок', accept: 'video/mp4,video/quicktime,video/webm', maxMb: 50, hint: 'Видеосообщение (кружок). MP4, до 50 МБ. До 1 минуты.' },
  { id: 'file', label: '📎 Файл', accept: '*/*', maxMb: 50, hint: 'Любой файл. До 50 МБ.' },
  { id: 'voice', label: '🎤 Голосовое', accept: 'audio/ogg,audio/mpeg,audio/mp4,audio/*', maxMb: 50, hint: 'OGG, MP3. До 50 МБ.' },
];

export default function AttachmentPicker({ file, onFileChange, attachType, onAttachTypeChange, existingFileInfo, existingFileUrl, photoOnly, onRemoveExisting }) {
  const fileInputRef = useRef(null);
  const types = photoOnly ? ATTACH_TYPES.filter(t => t.id === 'photo') : ATTACH_TYPES;
  const currentType = types.find(t => t.id === attachType) || types[0];

  const handleTypeChange = (typeId) => {
    if (onAttachTypeChange) onAttachTypeChange(typeId);
    // Reset file when type changes
    onFileChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const maxBytes = currentType.maxMb * 1024 * 1024;
    if (f.size > maxBytes) {
      alert(`Файл слишком большой. Максимум ${currentType.maxMb} МБ.`);
      e.target.value = '';
      return;
    }
    onFileChange(f);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Type selector */}
      {!photoOnly && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {types.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTypeChange(t.id)}
              style={{
                padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px', cursor: 'pointer',
                border: '1px solid var(--border)',
                background: (attachType || 'photo') === t.id ? 'var(--primary)' : 'transparent',
                color: (attachType || 'photo') === t.id ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* File input */}
      <input
        ref={fileInputRef}
        type="file"
        className="form-input"
        accept={currentType.accept}
        onChange={handleFileChange}
        style={{ padding: '8px' }}
      />
      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>
        {currentType.hint}
      </p>

      {/* Selected file info */}
      {file && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{file.name} ({(file.size / 1024 / 1024).toFixed(1)} МБ)</span>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '2px 6px', fontSize: '0.75rem' }}
            onClick={() => {
              onFileChange(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          >
            ✕
          </button>
        </div>
      )}
      {!file && (existingFileInfo || existingFileUrl) && (() => {
        const t = existingFileInfo || 'file';
        const isPhoto = t === 'photo';
        const iconMap = { photo: '📷', video: '🎬', video_note: '⭕', voice: '🎤', audio: '🎵', document: '📄', file: '📎' };
        const labelMap = { photo: 'Фото', video: 'Видео', video_note: 'Кружок', voice: 'Голосовое', audio: 'Аудио', document: 'Документ', file: 'Файл' };
        return (
          <div style={{ padding: '10px 12px', background: 'var(--bg-glass)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isPhoto && existingFileUrl ? (
                <img src={existingFileUrl} alt="" style={{
                  width: 64, height: 64, objectFit: 'cover', borderRadius: 6,
                  border: '1px solid var(--border)', flexShrink: 0,
                }} onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{
                  width: 64, height: 64, borderRadius: 6, background: 'var(--bg)',
                  border: '1px solid var(--border)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0,
                }}>{iconMap[t] || '📎'}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {labelMap[t] || 'Файл'} прикреплён
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Загрузите новый файл чтобы заменить
                </div>
              </div>
              {onRemoveExisting && (
                <button type="button" title="Удалить вложение"
                  onClick={onRemoveExisting}
                  style={{
                    width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                    background: 'var(--bg)', color: 'var(--text-secondary)',
                    fontSize: '1rem', cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
