import { useState } from 'react';
import { api } from '../services/api';
import { useToast } from './Toast';

function htmlToPreview(html) {
  if (!html) return '';
  let text = html;
  // Convert <span style="font-weight: 700/bold"> to <b>
  text = text.replace(/<span[^>]*font-weight:\s*(?:700|bold)[^>]*>([\s\S]*?)<\/span>/gi, '<b>$1</b>');
  text = text.replace(/<span[^>]*font-style:\s*italic[^>]*>([\s\S]*?)<\/span>/gi, '<i>$1</i>');
  // <br> with any attributes -> newline
  text = text.replace(/<br[^>]*\/?>/gi, '\n');
  // Block closing tags -> newline
  text = text.replace(/<\/(?:div|p|li|tr|h[1-6]|blockquote)>/gi, '\n');
  // Remove opening block tags
  text = text.replace(/<(?:div|p|li|ul|ol|tr|td|th|table|section|article|header|footer|nav|figure)(?:\s[^>]*)?\s*>/gi, '');
  // Convert <b>/<strong> to <strong>
  text = text.replace(/<(?:strong|b)(?:\s[^>]*)?>/gi, '<strong>');
  text = text.replace(/<\/(?:strong|b)>/gi, '</strong>');
  // <em>/<i>
  text = text.replace(/<(?:em|i)(?:\s[^>]*)?>/gi, '<em>');
  text = text.replace(/<\/(?:em|i)>/gi, '</em>');
  // <strike>/<del>/<s>
  text = text.replace(/<(?:strike|del|s)(?:\s[^>]*)?>/gi, '<s>');
  text = text.replace(/<\/(?:strike|del|s)>/gi, '</s>');
  // <u>/<ins>
  text = text.replace(/<(?:ins|u)(?:\s[^>]*)?>/gi, '<u>');
  text = text.replace(/<\/(?:ins|u)>/gi, '</u>');
  // Strip remaining spans
  text = text.replace(/<\/?span(?:\s[^>]*)?>/gi, '');
  // Keep <a> with href
  text = text.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>/gi, '<a href="$1" target="_blank" rel="noreferrer" style="color:#4361ee">');
  // Strip all other tags
  const allowed = /^\/?(strong|em|u|s|a|code|pre)(\s|>|\/|$)/i;
  text = text.replace(/<\/?([^>]+)>/g, (m, inner) => allowed.test(inner) ? m : '');
  // Decode entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  // Max 2 newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export default function MessagePreview({ messageText, buttons, file, fileUrl, tc, entityType, entityId }) {
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);

  const handleSendToSelf = async () => {
    setSending(true);
    try {
      let data;
      if (file) {
        // New file selected — send via FormData
        const formData = new FormData();
        formData.append('message_text', messageText || '');
        formData.append('entity_type', entityType || '');
        if (entityId) formData.append('entity_id', entityId);
        formData.append('file', file);
        data = await api.upload(`/pins/${tc}/send-preview`, formData, 'POST');
      } else {
        // No new file — use existing from DB
        data = await api.post(`/pins/${tc}/send-preview`, {
          message_text: messageText,
          entity_type: entityType,
          entity_id: entityId,
        });
      }
      if (data.success) {
        showToast('Сообщение отправлено вам в бота');
      } else {
        showToast(data.error || 'Ошибка отправки', 'error');
      }
    } catch {
      showToast('Ошибка отправки', 'error');
    } finally {
      setSending(false);
    }
  };

  const previewHtml = htmlToPreview(messageText);
  let parsedButtons = [];
  try {
    if (buttons) parsedButtons = typeof buttons === 'string' ? JSON.parse(buttons) : buttons;
  } catch {}

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      overflow: 'hidden', marginTop: '12px',
    }}>
      <div style={{
        padding: '8px 12px', background: 'var(--bg-glass)',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
      }}>
        Предпросмотр
      </div>
      <div style={{
        padding: '16px', background: 'var(--bg)',
        minHeight: '80px',
      }}>
        {/* File preview */}
        {(file || fileUrl) && (
          <div style={{ marginBottom: '10px' }}>
            {file ? (
              file.type?.startsWith('image/') ? (
                <img src={URL.createObjectURL(file)} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
              ) : (
                <div style={{ padding: '8px 12px', background: 'var(--bg-glass)', borderRadius: 6, fontSize: '0.85rem' }}>
                  {file.name}
                </div>
              )
            ) : fileUrl ? (
              <img src={fileUrl} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }}
                onError={e => { e.target.style.display = 'none'; }} />
            ) : null}
          </div>
        )}

        {/* Text */}
        <div
          style={{ fontSize: '0.92rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          dangerouslySetInnerHTML={{ __html: previewHtml || '<span style="color:var(--text-secondary)">Нет текста</span>' }}
        />

        {/* Buttons */}
        {parsedButtons.length > 0 && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {parsedButtons.map((btn, i) => (
              <div key={i} style={{
                padding: '10px', borderRadius: 8,
                background: 'var(--bg-glass)', border: '1px solid var(--border)',
                textAlign: 'center', fontSize: '0.88rem', fontWeight: 500,
                color: 'var(--primary)',
              }}>
                {btn.text || btn.label || 'Кнопка'}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send to self button */}
      {tc && (
        <div style={{
          padding: '10px 12px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            className="btn btn-outline"
            style={{ fontSize: '0.82rem', padding: '6px 14px' }}
            onClick={handleSendToSelf}
            disabled={sending || !messageText?.trim()}
          >
            {sending ? 'Отправка...' : 'Отправить себе'}
          </button>
        </div>
      )}
    </div>
  );
}
