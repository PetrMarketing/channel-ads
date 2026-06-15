import { useEffect, useState, useMemo, useRef } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import StreamFormModal from './content/StreamFormModal';

// Встроенный мини-плеер для preview в админке — играет наш HLS через hls.js
function StreamPreview({ stream }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let hls = null;
    let src = '';
    if (stream.stream_type === 'encoder' && stream.stream_key) {
      src = `/hls/${stream.stream_key}.m3u8`;
    } else if (stream.embed_url || stream.stream_url) {
      // Внешние iframe-плееры — preview не покажем
      return;
    }
    if (!src) return;
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src; v.play().catch(() => {});
      return;
    }
    const attach = () => {
      if (!window.Hls || !window.Hls.isSupported()) return;
      hls = new window.Hls();
      hls.loadSource(src);
      hls.attachMedia(v);
    };
    if (window.Hls) attach();
    else {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1';
      s.onload = attach;
      document.head.appendChild(s);
    }
    return () => { if (hls) { try { hls.destroy(); } catch {} } };
  }, [stream.stream_key, stream.stream_type, stream.embed_url, stream.stream_url]);

  if (stream.stream_type !== 'encoder') {
    if (stream.embed_url) {
      return (
        <iframe src={stream.embed_url} title="preview"
          style={{ width: '100%', aspectRatio: '16/9', border: 0, borderRadius: 10, background: '#000' }}
          allowFullScreen allow="autoplay; encrypted-media" />
      );
    }
    return (
      <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10, background: '#0f172a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 13 }}>
        Плеер не настроен
      </div>
    );
  }

  return (
    <video ref={videoRef} controls autoPlay muted playsInline
      style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10, background: '#000' }} />
  );
}

const TYPE_LABELS = {
  vk: { label: 'VK', icon: '🅥' },
  kinescope: { label: 'Kinescope', icon: '🎞' },
  rutube: { label: 'RUTUBE', icon: '🎬' },
  browser: { label: 'Браузер', icon: '🌐' },
  encoder: { label: 'Видеокодер', icon: '🎛' },
  youtube: { label: 'YouTube', icon: '▶' },
};

const cardStyle = {
  background: '#fff', borderRadius: 14, padding: 16,
  border: '1px solid rgba(67,97,238,0.08)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', gap: 14,
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
const tabBtn = (active) => ({
  padding: '8px 16px', borderRadius: 10, border: 'none',
  background: active ? '#4361ee' : 'transparent',
  color: active ? '#fff' : '#6b7280', cursor: 'pointer',
  fontWeight: active ? 700 : 500, fontSize: 13,
});

function fmtDt(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function Countdown({ iso }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return <span style={{ color: '#16a34a', fontWeight: 700 }}>🔴 LIVE</span>;
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  let txt = '';
  if (d > 0) txt = `${d}д ${h}ч ${m}м`;
  else if (h > 0) txt = `${h}ч ${m}м ${s}с`;
  else txt = `${m}м ${s}с`;
  return <span style={{ color: '#d97706', fontWeight: 600 }}>через {txt}</span>;
}

export default function StreamsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;
  const [tab, setTab] = useState('scheduled'); // scheduled | finished
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const d = await api.get(`/streams/${tc}`);
      if (d?.success) setStreams(d.streams || []);
    } catch (e) { showToast('Ошибка загрузки эфиров'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [tc]);

  const filtered = useMemo(() => {
    if (tab === 'finished') return streams.filter(s => s.status === 'finished');
    return streams.filter(s => s.status !== 'finished');
  }, [streams, tab]);

  // Полл статуса эфиров каждые 5с — чтобы LIVE-индикатор включался автоматически
  useEffect(() => {
    if (!tc) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [tc]);

  const [previewId, setPreviewId] = useState(null);

  const onSaved = () => { setEditing(null); load(); };

  const remove = async (s) => {
    if (!confirm(`Удалить эфир «${s.title}»?`)) return;
    try {
      await api.delete(`/streams/${tc}/${s.id}`);
      load();
    } catch (e) { showToast('Ошибка удаления'); }
  };

  const finish = async (s) => {
    try {
      await api.put(`/streams/${tc}/${s.id}`, { status: 'finished' });
      load();
    } catch (e) { showToast('Ошибка'); }
  };

  if (!tc) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666' }}>
        Выберите канал в верхнем меню.
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <style>{`@keyframes liveBlink { 0%,100%{opacity:1} 50%{opacity:.6} }`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1a1a2e' }}>🎬 Эфиры</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
            Анонсируйте прямые трансляции, собирайте зрителей и принимайте комментарии.
          </p>
        </div>
        <button style={btnPrimary} onClick={() => setEditing({})}>+ Создать эфир</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button style={tabBtn(tab === 'scheduled')} onClick={() => setTab('scheduled')}>
          Готовятся ({streams.filter(s => s.status !== 'finished').length})
        </button>
        <button style={tabBtn(tab === 'finished')} onClick={() => setTab('finished')}>
          Завершённые ({streams.filter(s => s.status === 'finished').length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', padding: 50, borderRadius: 14, textAlign: 'center', color: '#999' }}>
          {tab === 'scheduled' ? 'Пока нет запланированных эфиров. Создайте первый.' : 'Нет завершённых эфиров.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(s => {
            const tp = TYPE_LABELS[s.stream_type] || { label: s.stream_type, icon: '🎬' };
            return (
              <div key={s.id} style={cardStyle}>
                {/* Preview / cover */}
                <div style={{
                  width: 120, height: 80, borderRadius: 10, flexShrink: 0,
                  background: s.bg_image_url
                    ? `linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.45)),url(${s.bg_image_url}) center/cover`
                    : 'linear-gradient(135deg,#1a1a2e,#16162a)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, position: 'relative',
                }}>
                  {tp.icon}
                  {s.status === 'live' && (
                    <span style={{
                      position: 'absolute', top: 6, left: 6,
                      background: '#dc2626', color: '#fff', padding: '2px 6px',
                      borderRadius: 5, fontSize: 10, fontWeight: 700,
                    }}>● LIVE</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 15, color: '#1a1a2e' }}>{s.title}</b>
                    <span style={{
                      background: 'rgba(67,97,238,0.10)', color: '#3a4cc7',
                      padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    }}>{tp.icon} {tp.label}</span>
                    {s.status === 'live' && (
                      <span style={{
                        background: '#dc2626', color: '#fff',
                        padding: '2px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        animation: 'liveBlink 1.6s ease-in-out infinite',
                      }}>● LIVE</span>
                    )}
                    {s.status === 'scheduled' && (
                      <span style={{
                        background: 'rgba(107,114,128,0.10)', color: '#6b7280',
                        padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      }}>⏸ Не идёт</span>
                    )}
                    {s.status === 'finished' && (
                      <span style={{
                        background: 'rgba(107,114,128,0.10)', color: '#6b7280',
                        padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      }}>✓ Завершён</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>
                    📅 {fmtDt(s.starts_at)} · {s.status === 'finished'
                      ? <span style={{ color: '#6b7280' }}>завершён</span>
                      : <Countdown iso={s.starts_at} />}
                  </div>
                  {s.description && (
                    <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>
                      {s.description.slice(0, 200)}{s.description.length > 200 ? '…' : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button style={btnOutline} onClick={() => setPreviewId(previewId === s.id ? null : s.id)}>
                      {previewId === s.id ? '⌃ Скрыть превью' : '👁 Превью'}
                    </button>
                    <button style={btnOutline} onClick={() => setEditing(s)}>Изменить</button>
                    <a style={{ ...btnOutline, textDecoration: 'none', color: '#4361ee' }}
                       href={`/streams-app/stream_${s.id}`} target="_blank" rel="noopener">
                      Как видят зрители ↗
                    </a>
                    {s.status !== 'finished' && (
                      <button style={btnOutline} onClick={() => finish(s)}>Завершить</button>
                    )}
                    <button style={{ ...btnOutline, color: '#dc2626' }} onClick={() => remove(s)}>×</button>
                  </div>
                  {previewId === s.id && (
                    <div style={{ marginTop: 12, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
                      <StreamPreview stream={s} />
                      <div style={{ padding: '8px 12px', background: '#0f172a', color: '#9ca3af', fontSize: 12 }}>
                        {s.status === 'live'
                          ? '🔴 Поток идёт. Так же видят зрители.'
                          : '⏸ Поток не идёт. Запустите трансляцию в OBS чтобы увидеть видео.'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <StreamFormModal
          tc={tc}
          stream={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
