/**
 * Компоненты шагов лид-магнита: опрос, выбор идеи, превью.
 */
import { useRef } from 'react';

/** Опрос лид-магнита — загрузка PDF и пожелания */
export function LmSurvey({ lmPdf, lmPdfUploaded, lmUploading, lmWishes, setLmWishes, onUploadPdf, onSubmit, onSkip, loading }) {
  const lmFileRef = useRef();

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px' }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>Лид-магнит</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '0.88rem' }}>
        Создадим бесплатный подарок за подписку на ваш канал
      </p>

      {/* Загрузка PDF-референса */}
      <div style={{ marginBottom: 16 }}>
        <label className="form-label">PDF с вашим контентом (необязательно)</label>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
          Загрузите файл с вашим контентом — ИИ использует его как референс для лид-магнита
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn" onClick={() => lmFileRef.current?.click()}
            disabled={lmUploading} style={{ padding: '8px 16px' }}>
            {lmUploading ? 'Загрузка...' : 'Выбрать файл'}
          </button>
          <input ref={lmFileRef} type="file" accept=".pdf,.doc,.docx,.txt"
            onChange={e => { const f = e.target.files?.[0]; if (f) onUploadPdf(f); }}
            style={{ display: 'none' }} />
          {lmPdf && (
            <span style={{ fontSize: '0.82rem', color: lmPdfUploaded ? '#10B981' : 'var(--text-secondary)' }}>
              {lmPdfUploaded ? '✓ ' : ''}{lmPdf.name}
            </span>
          )}
        </div>
      </div>

      {/* Пожелания */}
      <div style={{ marginBottom: 24 }}>
        <label className="form-label">Пожелания</label>
        <textarea className="form-input" value={lmWishes} onChange={e => setLmWishes(e.target.value)}
          placeholder="Какой подарок вы хотите предложить подписчикам? Любые пожелания..." rows={3} style={{ resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={onSubmit} disabled={loading} style={{ flex: 1, padding: '12px' }}>
          {loading ? 'Генерация...' : 'Сгенерировать варианты'}
        </button>
        <button className="btn" onClick={onSkip} style={{ padding: '12px 20px' }}>Пропустить</button>
      </div>
    </div>
  );
}

/** Выбор идеи лид-магнита из 3 вариантов */
export function LmChooseIdea({ ideas, chosenIdea, onChoose, loading }) {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px' }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>Выберите лид-магнит</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '0.88rem' }}>Нажмите на понравившийся вариант</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ideas.map((idea, i) => (
          <div key={i} onClick={() => !loading && onChoose(i)} style={{
            cursor: loading ? 'wait' : 'pointer', padding: '16px 20px', borderRadius: 12,
            border: chosenIdea === i ? '2px solid #7B68EE' : '1px solid var(--border)',
            background: chosenIdea === i ? 'rgba(123,104,238,0.08)' : 'var(--bg-glass)',
            transition: 'all 0.2s', opacity: loading && chosenIdea !== i ? 0.5 : 1,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{idea.title}</div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{idea.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Превью сгенерированного лид-магнита: баннер, пост, контент */
export function LmPreview({ lmContent, lmPostText, lmBannerUrl, onInstall, loading }) {
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '20px' }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 20 }}>Превью лид-магнита</h2>

      {/* Баннер 16:9 */}
      {lmBannerUrl && (
        <div style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <img src={lmBannerUrl} alt="Баннер" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
        </div>
      )}

      {/* Текст поста-закрепа */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>Пост-закреп</h3>
        <div style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)',
          background: 'var(--bg-glass)', fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {lmPostText}
        </div>
      </div>

      {/* Контент лид-магнита */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>Контент лид-магнита</h3>
        <div style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)',
          background: 'var(--bg-glass)', fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
          maxHeight: 300, overflowY: 'auto' }}>
          {lmContent}
        </div>
      </div>

      <button className="btn btn-primary" onClick={onInstall} disabled={loading}
        style={{ width: '100%', padding: '12px', fontSize: '1rem' }}>
        {loading ? 'Установка...' : 'Установить'}
      </button>
    </div>
  );
}
