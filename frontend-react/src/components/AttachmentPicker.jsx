import { useRef } from 'react';

export default function AttachmentPicker({ file, onFileChange, existingFileInfo }) {
  const fileInputRef = useRef(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        ref={fileInputRef}
        type="file"
        className="form-input"
        accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,image/tiff"
        onChange={e => onFileChange(e.target.files?.[0] || null)}
        style={{ padding: '8px' }}
      />
      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
        Только фото: JPG, PNG, GIF, WebP. Рекомендуемый размер: 1280×720 px (16:9).
      </p>
      {file && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{file.name} ({(file.size / 1024).toFixed(1)} КБ)</span>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '2px 6px', fontSize: '0.75rem' }}
            onClick={() => {
              onFileChange(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          >
            x
          </button>
        </div>
      )}
      {!file && existingFileInfo && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
          Текущий файл прикреплён ({existingFileInfo}). Загрузите новый для замены.
        </p>
      )}
    </div>
  );
}
