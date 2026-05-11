/**
 * Универсальное поле "файл с превью" для админки.
 * При выборе файла грузит на /admin/upload и вызывает onChange(url, file_type).
 * Можно вписать URL вручную (для совместимости с существующими записями).
 */
import React, { useState, useRef } from 'react';
import { adminApi } from '../../services/adminApi';

export default function AdminFileInput({ value, onChange, accept = 'image/*,video/mp4', label = 'Файл' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const inputRef = useRef(null);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const d = await adminApi.upload('/upload', fd);
      if (d?.success && d.url) {
        onChange(d.url, d.file_type);
      } else {
        setErr(d?.error || 'Не удалось загрузить');
      }
    } catch (ex) {
      setErr(ex?.message || 'Ошибка загрузки');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const isImage = value && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(value);
  const isVideo = value && /\.(mp4|mov|webm)(\?|$)/i.test(value);

  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      {value && (
        <div style={preview}>
          {isImage ? (
            <img src={value} alt="" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, display: 'block' }} />
          ) : isVideo ? (
            <video src={value} controls style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8 }} />
          ) : (
            <div style={{ fontSize: 12, color: '#6b7280' }}>📎 {value}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
              style={smallBtn}>↻ Заменить</button>
            <button type="button" onClick={() => onChange('', null)} disabled={busy}
              style={{ ...smallBtn, color: '#dc2626', borderColor: '#fecaca' }}>× Убрать</button>
          </div>
        </div>
      )}
      {!value && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            style={uploadBtn}>
            {busy ? 'Загружаем…' : '📤 Выбрать файл'}
          </button>
          <input
            type="text"
            placeholder="или вставьте URL вручную"
            value={value || ''}
            onChange={e => onChange(e.target.value, null)}
            style={input}
          />
        </div>
      )}
      <input ref={inputRef} type="file" accept={accept} onChange={onFile} style={{ display: 'none' }} />
      {err && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>⚠️ {err}</div>}
    </div>
  );
}

const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 };
const input = { flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const uploadBtn = { padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px dashed #4361ee', background: '#eef2ff', color: '#4361ee', whiteSpace: 'nowrap' };
const smallBtn = { padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#1a1a2e' };
const preview = { padding: 10, border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb', marginBottom: 12 };
