import { useRef } from 'react';

const ATTACH_TYPES = [
  { id: 'photo', label: '📷 Фото', accept: 'image/jpeg,image/png,image/gif,image/webp', maxMb: 10, hint: 'JPG, PNG, GIF, WebP. До 10 МБ.' },
  { id: 'video', label: '🎬 Видео', accept: 'video/mp4,video/quicktime,video/webm', maxMb: 20, hint: 'MP4, MOV, WebM. До 20 МБ.' },
  { id: 'file', label: '📎 Файл', accept: '*/*', maxMb: 50, hint: 'Любой файл. До 50 МБ.' },
  { id: 'voice', label: '🎤 Голосовое', accept: 'audio/ogg,audio/mpeg,audio/mp4,audio/*', maxMb: 10, hint: 'OGG, MP3. До 10 МБ.' },
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
      {!file && existingFileInfo && (
        <div style={{ padding: '8px 12px', background: 'var(--bg-glass)', borderRadius: 6, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{existingFileInfo === 'photo' ? '📷' : existingFileInfo === 'video' ? '🎬' : existingFileInfo === 'voice' ? '🎤' : '📎'}</span>
              <span>Прикреплён файл ({existingFileInfo})</span>
            </div>
            {onRemoveExisting && (
              <button type="button" className="btn btn-danger"
                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                onClick={onRemoveExisting}>
                Удалить
              </button>
            )}
          </div>
          {existingFileUrl && existingFileInfo === 'photo' && (
            <img src={existingFileUrl} alt="" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 6, marginTop: 6 }} />
          )}
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Загрузите новый файл для замены или удалите текущий
          </p>
        </div>
      )}
    </div>
  );
}
