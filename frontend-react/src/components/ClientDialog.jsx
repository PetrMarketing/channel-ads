/**
 * Диалог с клиентом: заметки + каналы Wazzup.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { useChannels } from '../contexts/ChannelContext';

const TRANSPORT_LABELS = { whatsapp: 'WA', telegram: 'TG', tgapi: 'TG', instagram: 'IG', vk: 'VK', viber: 'VB', avito: 'AV', waba: 'WA' };
const TRANSPORT_COLORS = { whatsapp: '#25D366', telegram: '#2AABEE', tgapi: '#2AABEE', instagram: '#E4405F', vk: '#4C75A3', viber: '#7360F2', avito: '#00AAFF', waba: '#25D366' };

const SYSTEM_OPTION = { value: 'system', label: 'Заметка', color: '#6366F1', badge: 'SYS' };

function WazzupSetup({ tc, onSaved }) {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!token.trim()) return;
    setSaving(true);
    try {
      const data = await api.post(`/clients/${tc}/wazzup-settings`, { api_token: token.trim(), is_active: true });
      if (data.success) onSaved(data.channels || []);
    } catch (e) { alert(e.message || 'Ошибка'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{
      padding: 12, background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)',
      borderRadius: 8, marginBottom: 10,
    }}>
      <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>Подключить Wazzup</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
        Получите API-ключ в личном кабинете <a href="https://wazzup24.com" target="_blank" rel="noopener noreferrer" style={{ color: '#25D366' }}>wazzup24.com</a> → Интеграции → API
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={token} onChange={e => setToken(e.target.value)}
          placeholder="API-ключ Wazzup" style={{
            flex: 1, border: '1px solid var(--border)', borderRadius: 6,
            padding: '6px 10px', fontSize: '0.82rem', outline: 'none',
            background: 'var(--bg-primary, #fff)', color: 'inherit',
          }} />
        <button onClick={handleSave} disabled={saving || !token.trim()} style={{
          background: '#25D366', color: '#fff', border: 'none', borderRadius: 6,
          padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
          opacity: saving || !token.trim() ? 0.5 : 1,
        }}>{saving ? '...' : 'Подключить'}</button>
      </div>
    </div>
  );
}

export default function ClientDialog({ identifier, phone }) {
  const { currentChannel } = useChannels();
  const tc = currentChannel?.tracking_code;
  const [notes, setNotes] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [channelType, setChannelType] = useState('system');
  const [showPicker, setShowPicker] = useState(false);
  const [wazzupChannels, setWazzupChannels] = useState([]);
  const [showWazzupSetup, setShowWazzupSetup] = useState(false);
  const endRef = useRef(null);

  const loadNotes = useCallback(async () => {
    if (!tc || !identifier) return;
    try {
      const data = await api.get(`/clients/${tc}/notes/${encodeURIComponent(identifier)}`);
      if (data.success) setNotes(data.notes || []);
    } catch {}
  }, [tc, identifier]);

  const loadWazzupChannels = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/clients/${tc}/wazzup-channels`);
      if (data.success) setWazzupChannels(data.channels || []);
    } catch {}
  }, [tc]);

  useEffect(() => { loadNotes(); loadWazzupChannels(); }, [loadNotes, loadWazzupChannels]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [notes]);

  // Формируем список каналов
  const channelOptions = [SYSTEM_OPTION];
  wazzupChannels.forEach(ch => {
    const transport = ch.type || 'whatsapp';
    const badge = TRANSPORT_LABELS[transport] || transport.toUpperCase();
    const phoneStr = ch.phone ? ` ${ch.phone}` : '';
    const nameStr = ch.name ? ` ${ch.name}` : '';
    channelOptions.push({
      value: `wazzup_${ch.id}`,
      label: `[${badge}]${phoneStr || nameStr}`,
      color: TRANSPORT_COLORS[transport] || '#888',
      badge,
      transport,
    });
  });

  const current = channelOptions.find(c => c.value === channelType) || SYSTEM_OPTION;

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const data = await api.post(`/clients/${tc}/notes/${encodeURIComponent(identifier)}`, {
        content: input.trim(),
        channel_type: channelType,
        transport: current.transport || '',
        phone: phone || identifier,
      });
      if (data.success) { setInput(''); loadNotes(); }
    } catch (e) { alert(e.message || 'Ошибка отправки'); }
    finally { setSending(false); }
  };

  const fmtTime = (d) => d ? new Date(d).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  // Определяем иконку и цвет по channel_type
  const getStyle = (ct) => {
    const opt = channelOptions.find(c => c.value === ct);
    if (opt) return opt;
    // Если канал не найден (удалён) — по типу
    if (ct?.startsWith('wazzup_')) return { badge: 'WZ', color: '#25D366', label: 'Wazzup' };
    return SYSTEM_OPTION;
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>Диалог</h4>

      <div style={{
        maxHeight: 260, overflowY: 'auto', marginBottom: 10,
        padding: '8px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)',
      }}>
        {notes.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            Нет сообщений
          </div>
        )}
        {notes.map(n => {
          const isIn = n.direction === 'in';
          const st = getStyle(n.channel_type);
          return (
            <div key={n.id} style={{ marginBottom: 8, display: 'flex', flexDirection: isIn ? 'row' : 'row-reverse', gap: 6 }}>
              <div style={{
                maxWidth: '85%', padding: '6px 10px',
                borderRadius: isIn ? '4px 10px 10px 10px' : '10px 4px 10px 10px',
                background: isIn ? 'var(--bg-glass)' : `${st.color}18`,
                border: `1px solid ${st.color}30`, fontSize: '0.82rem', lineHeight: 1.4,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#fff', background: st.color, padding: '1px 4px', borderRadius: 3 }}>{st.badge || 'SYS'}</span>
                  <span style={{ fontSize: '0.7rem', color: st.color, fontWeight: 600 }}>
                    {n.author_name || (isIn ? 'Клиент' : '')}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{fmtTime(n.created_at)}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.content}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {showWazzupSetup && (
        <WazzupSetup tc={tc} onSaved={(channels) => {
          setWazzupChannels(channels);
          setShowWazzupSetup(false);
          if (channels.length > 0) setChannelType(`wazzup_${channels[0].id}`);
        }} />
      )}

      {/* Ввод */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowPicker(!showPicker)} style={{
            background: `${current.color}18`, border: `1px solid ${current.color}40`, borderRadius: 6,
            padding: '6px 8px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4,
            color: current.color, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', background: current.color, padding: '1px 5px', borderRadius: 3 }}>{current.badge || 'SYS'}</span>
            {current.label} <span style={{ fontSize: 8 }}>▼</span>
          </button>
          {showPicker && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
              background: 'var(--bg-primary, #fff)', border: '1px solid var(--border)',
              borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10,
              overflow: 'hidden', minWidth: 200,
            }}>
              {channelOptions.map(opt => (
                <button key={opt.value} onClick={() => { setChannelType(opt.value); setShowPicker(false); }}
                  style={{
                    display: 'flex', gap: 8, alignItems: 'center', width: '100%',
                    padding: '8px 12px', border: 'none',
                    background: channelType === opt.value ? `${opt.color}12` : 'transparent',
                    cursor: 'pointer', fontSize: '0.82rem', textAlign: 'left',
                  }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', background: opt.color, padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>{opt.badge || 'SYS'}</span>
                  <span style={{ color: opt.color, fontWeight: 500 }}>{opt.label}</span>
                </button>
              ))}
              {wazzupChannels.length === 0 && (
                <button onClick={() => { setShowPicker(false); setShowWazzupSetup(true); }}
                  style={{
                    display: 'flex', gap: 8, alignItems: 'center', width: '100%',
                    padding: '8px 12px', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: '0.82rem', textAlign: 'left', color: '#888',
                  }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', background: '#888', padding: '1px 5px', borderRadius: 3 }}>+</span>
                  <span style={{ fontWeight: 500 }}>Подключить Wazzup</span>
                </button>
              )}
            </div>
          )}
        </div>

        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder={channelType === 'system' ? 'Заметка...' : 'Сообщение клиенту...'}
          style={{
            flex: 1, border: '1px solid var(--border)', borderRadius: 6,
            padding: '6px 10px', fontSize: '0.82rem', outline: 'none',
            background: 'var(--bg-primary, #fff)', color: 'inherit',
          }} />
        <button onClick={handleSend} disabled={sending || !input.trim()} style={{
          background: current.color, color: '#fff', border: 'none', borderRadius: 6,
          padding: '6px 12px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
          opacity: sending || !input.trim() ? 0.5 : 1,
        }}>{sending ? '...' : '→'}</button>
      </div>
    </div>
  );
}
