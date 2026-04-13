import { useRef, useState } from 'react';
import { api } from '../services/api';

export default function ImageUploadField({ value, onChange, uploadUrl, placeholder = 'https://example.com/image.jpg', label = 'Изображение' }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Максимум 10 МБ');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api${uploadUrl}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      const data = await res.json();
      if (data.success && data.url) {
        onChange(data.url);
      } else {
        alert(data.detail || 'Ошибка загрузки');
      }
    } catch (err) {
      alert('Ошибка: ' + (err.message || ''));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      {label && <label className="form-label">{label}</label>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="form-input"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, margin: 0 }}
        />
        <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
        <button
          type="button"
          className="btn btn-outline"
          style={{ whiteSpace: 'nowrap', padding: '8px 14px', fontSize: '0.82rem' }}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '...' : 'Выбрать файл'}
        </button>
      </div>
      {value && (
        <img src={value} alt="" style={{ marginTop: 8, maxWidth: '100%', maxHeight: 120, borderRadius: 8, objectFit: 'cover' }} />
      )}
    </div>
  );
}
