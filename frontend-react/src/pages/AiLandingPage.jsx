/**
 * ИИ Лендинг — генерация HTML-лендингов для каналов.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import Paywall from '../components/Paywall';
import { usePageOnboarding } from '../components/OnboardingTour';

const SESSION_COST_DEFAULT = 500; // Цена для 1-го уровня; реальная — с /channels/{tc}/levels
const MAX_REGEN = 2;

function plurLanding(n) {
  const last = n % 10;
  const teen = n % 100;
  if (teen >= 11 && teen <= 14) return 'лендингов';
  if (last === 1) return 'лендинг';
  if (last >= 2 && last <= 4) return 'лендинга';
  return 'лендингов';
}

export default function AiLandingPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const tc = currentChannel?.tracking_code;

  const { overlay: pageTour } = usePageOnboarding('ai-landing', [
    { selector: '[data-tour-page="landing-create"]', title: 'Генерация лендинга', text: '500 ИИ-токенов = HTML-лендинг с фото, ТЗ и метрикой.', placement: 'bottom' },
  ]);

  const [step, setStep] = useState('start');
  const [landingId, setLandingId] = useState(null);
  const [sessionTc, setSessionTc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pastLandings, setPastLandings] = useState([]);

  // Опрос
  const [niche, setNiche] = useState('');
  const [product, setProduct] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [designStyle, setDesignStyle] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  // Фото
  const [photos, setPhotos] = useState([]);
  const [photoDesc, setPhotoDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  // Результаты
  const [spec, setSpec] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [slug, setSlug] = useState('');
  const [regenCount, setRegenCount] = useState(0);

  // Динамическая цена с уровня канала
  const [landingCost, setLandingCost] = useState(SESSION_COST_DEFAULT);
  const [landingNextCost, setLandingNextCost] = useState(null);
  const [landingRemaining, setLandingRemaining] = useState(null);
  useEffect(() => {
    if (!tc) return;
    let cancelled = false;
    api.get(`/channels/${tc}/levels`).then(d => {
      if (cancelled || !d?.success) return;
      const ld = (d.skills || []).find(s => s.skill === 'landing');
      if (ld) {
        setLandingCost(ld.current_cost || SESSION_COST_DEFAULT);
        setLandingNextCost(ld.is_max ? null : ld.next_cost);
        const remaining = ld.is_max ? null : Math.max(0, (ld.next_threshold || 0) - (ld.period_count || 0));
        setLandingRemaining(remaining);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [tc]);

  // Метрика
  const [metrikaForm, setMetrikaForm] = useState({ ym_counter_id: '', ym_goal_name: 'subscribe_channel', vk_pixel_id: '', vk_goal_name: 'subscribe_channel' });
  const [savingMetrika, setSavingMetrika] = useState(false);

  // Правка лендинга
  const [editRequest, setEditRequest] = useState('');
  const [editing, setEditing] = useState(false);

  const sUrl = `${sessionTc}/landing/${landingId}`;

  // Загрузка прошлых лендингов
  const loadPast = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ai-landing/${tc}/landings`);
      if (data.success) setPastLandings(data.landings || []);
    } catch { /* ignore */ }
  }, [tc]);

  useEffect(() => { if (step === 'start') loadPast(); }, [step, loadPast]);

  // Создание сессии
  const handleCreate = async () => {
    setLoading(true);
    try {
      const data = await api.post(`/ai-landing/${tc}/landing`);
      if (data.success) {
        setLandingId(data.landing_id);
        setSessionTc(tc);
        setSlug(data.slug);
        setStep('survey');
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  // Загрузка фото
  const handleUploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('description', photoDesc);
      const data = await api.upload(`/ai-landing/${sUrl}/photo`, fd);
      if (data.success) {
        setPhotos(data.photos || []);
        setPhotoDesc('');
        showToast('Фото загружено', 'success');
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setUploading(false); }
  };

  // Удаление фото
  const handleDeletePhoto = async (index) => {
    try {
      const data = await api.delete(`/ai-landing/${sUrl}/photo/${index}`);
      if (data.success) { setPhotos(data.photos || []); showToast('Фото удалено', 'success'); }
    } catch (e) { showToast(e.message, 'error'); }
  };

  // Обновление описания фото
  const handleUpdatePhotoDesc = async (index, desc) => {
    try {
      const data = await api.put(`/ai-landing/${sUrl}/photo/${index}`, { description: desc });
      if (data.success) setPhotos(data.photos || []);
    } catch (e) { showToast(e.message, 'error'); }
  };

  // Сохранение ТЗ вручную
  const handleSaveSpec = async () => {
    try {
      const data = await api.put(`/ai-landing/${sUrl}/spec`, { spec });
      if (data.success) showToast('ТЗ сохранено', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // Генерация ТЗ
  const handleGenerateSpec = async () => {
    if (!niche.trim()) { showToast('Укажите нишу', 'error'); return; }
    setLoading(true);
    try {
      await api.put(`/ai-landing/${sUrl}/survey`, {
        niche, product, target_audience: targetAudience, design_style: designStyle, additional_info: additionalInfo,
      });
      const data = await api.post(`/ai-landing/${sUrl}/generate-spec`);
      if (data.success) {
        setSpec(data.spec || '');
        showToast('ТЗ сгенерировано!', 'success');
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  // Генерация лендинга
  const handleGenerate = async () => {
    if (!spec.trim()) { showToast('Заполните техническое задание', 'error'); return; }
    setLoading(true);
    try {
      // Сохраняем опрос и ТЗ
      await api.put(`/ai-landing/${sUrl}/survey`, {
        niche, product, target_audience: targetAudience, design_style: designStyle, additional_info: additionalInfo,
      });
      await api.put(`/ai-landing/${sUrl}/spec`, { spec });
      setStep('generating');
      const data = await api.post(`/ai-landing/${sUrl}/generate`);
      if (data.success) {
        setHtmlContent(data.html || '');
        setRegenCount(data.regen_count ?? 0);
        setStep('preview');
      }
    } catch (e) { showToast(e.message, 'error'); setStep('survey'); }
    finally { setLoading(false); }
  };

  // Публикация
  const handlePublish = async () => {
    setLoading(true);
    try {
      const data = await api.post(`/ai-landing/${sUrl}/publish`);
      if (data.success) {
        setStep('done');
        showToast('Лендинг опубликован!', 'success');
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  // Открыть прошлый лендинг
  const handleOpen = async (l) => {
    setSessionTc(tc);
    setLandingId(l.id);
    setSlug(l.slug);
    try {
      const data = await api.get(`/ai-landing/${tc}/landing/${l.id}`);
      if (data.success) {
        const d = data.landing;
        setNiche(d.niche || '');
        setProduct(d.product || '');
        setTargetAudience(d.target_audience || '');
        setDesignStyle(d.design_style || '');
        setAdditionalInfo(d.additional_info || '');
        setPhotos(d.photos || []);
        setSpec(d.technical_spec || '');
        setHtmlContent(d.html_content || '');
        setRegenCount(d.regen_count || 0);
        setMetrikaForm({
          ym_counter_id: d.ym_counter_id || '',
          ym_goal_name: d.ym_goal_name || 'subscribe_channel',
          vk_pixel_id: d.vk_pixel_id || '',
          vk_goal_name: d.vk_goal_name || 'subscribe_channel',
        });
        if (d.html_content) setStep('preview');
        else setStep('survey');
      }
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleReset = () => {
    setStep('start'); setLandingId(null); setSessionTc(null);
    setNiche(''); setProduct(''); setTargetAudience('');
    setDesignStyle(''); setAdditionalInfo('');
    setPhotos([]); setPhotoDesc(''); setSpec(''); setHtmlContent(''); setSlug('');
    setRegenCount(0);
    setMetrikaForm({ ym_counter_id: '', ym_goal_name: 'subscribe_channel', vk_pixel_id: '', vk_goal_name: 'subscribe_channel' });
    setEditRequest(''); setEditing(false);
  };

  const renderContent = () => {
    // Старт
    if (step === 'start') {
      return (
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
              background: 'linear-gradient(135deg, #7B68EE, #4F46E5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
              🌐
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 12 }}>ИИ Лендинг</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
              Генерация HTML-лендинга с кнопками подписки на ваш канал
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 24 }}>
              Стоимость: <b style={{ color: '#7B68EE' }}>{landingCost} токенов</b>
              {landingNextCost != null && (
                <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 600 }}>
                  → {landingNextCost} на следующем уровне
                  {landingRemaining != null && (
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500, marginLeft: 4 }}>
                      ({landingRemaining} {plurLanding(landingRemaining)} до апгрейда)
                    </span>
                  )}
                </span>
              )}
            </p>
            <button data-tour-page="landing-create" className="btn btn-primary" onClick={handleCreate} disabled={loading}
              style={{ padding: '12px 32px', fontSize: '1rem' }}>
              {loading ? 'Создание...' : 'Создать лендинг'}
            </button>
          </div>
          {pastLandings.length > 0 && (
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 12 }}>Мои лендинги</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pastLandings.map(l => (
                  <div key={l.id} onClick={() => handleOpen(l)} style={{
                    display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px',
                    border: '1px solid var(--border)', background: 'var(--bg-glass)',
                    cursor: 'pointer',
                  }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#7B68EE'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: 'linear-gradient(135deg, #7B68EE, #4F46E5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🌐</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{l.niche || 'Без темы'}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {l.created_at ? new Date(l.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                        {' '}&middot;{' '}
                        <span style={{ color: l.published ? '#10B981' : '#7B68EE' }}>
                          {l.published ? 'Опубликован' : l.status === 'generated' ? 'Готов' : 'Черновик'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Опрос
    if (step === 'survey') {
      return (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Техническое задание</h2>
            <button className="btn" onClick={handleReset} style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Назад</button>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Ниша / сфера деятельности *</label>
            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)}
              placeholder="Например: фитнес-тренер, юрист, онлайн-школа..." />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Продукт / услуга</label>
            <input className="form-input" value={product} onChange={e => setProduct(e.target.value)}
              placeholder="Что именно продаёте или предлагаете?" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Целевая аудитория</label>
            <input className="form-input" value={targetAudience} onChange={e => setTargetAudience(e.target.value)}
              placeholder="Кто ваши клиенты? Возраст, интересы, боли..." />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Стиль дизайна</label>
            <input className="form-input" value={designStyle} onChange={e => setDesignStyle(e.target.value)}
              placeholder="Например: тёмный минималистичный, яркий креативный, премиальный..." />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Дополнительно</label>
            <textarea className="form-input" value={additionalInfo} onChange={e => setAdditionalInfo(e.target.value)}
              placeholder="Любые пожелания..." rows={3} style={{ resize: 'vertical' }} />
          </div>

          {/* Фото */}
          <div style={{ marginBottom: 20, padding: '16px', border: '1px solid var(--border)', background: 'var(--bg-glass)' }}>
            <label className="form-label">Фотографии (необязательно, до 5 шт.)</label>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
              Загрузите фото и опишите каждое — ИИ вставит их в нужные места
            </p>
            {photos.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <img src={p.url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                <input className="form-input" value={p.description || ''} placeholder="Описание фото"
                  style={{ fontSize: '0.82rem', flex: 1 }}
                  onChange={e => {
                    const val = e.target.value;
                    setPhotos(prev => prev.map((ph, j) => j === i ? { ...ph, description: val } : ph));
                  }}
                  onBlur={e => handleUpdatePhotoDesc(i, e.target.value)} />
                <button onClick={() => handleDeletePhoto(i)} title="Удалить"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1.1rem', padding: '4px', flexShrink: 0 }}>
                  &times;
                </button>
              </div>
            ))}
            {photos.length < 5 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <input className="form-input" value={photoDesc} onChange={e => setPhotoDesc(e.target.value)}
                    placeholder="Описание фото" style={{ fontSize: '0.85rem' }} />
                </div>
                <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ padding: '8px 16px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                  {uploading ? 'Загрузка...' : 'Загрузить'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadPhoto(f); }} />
              </div>
            )}
          </div>

          {/* ТЗ */}
          <div style={{ marginBottom: 20, padding: '16px', border: '1px solid var(--border)',
            background: 'var(--bg-glass)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Техническое задание *</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" onClick={handleGenerateSpec} disabled={loading || !niche.trim()}
                  style={{ padding: '4px 12px', fontSize: '0.78rem' }}>
                  {loading ? 'Генерация...' : 'Сгенерировать ТЗ'}
                </button>
                {spec && (
                  <button className="btn" onClick={handleSaveSpec} style={{ padding: '4px 12px', fontSize: '0.78rem' }}>Сохранить</button>
                )}
              </div>
            </div>
            <textarea className="form-input" value={spec} onChange={e => setSpec(e.target.value)}
              rows={8} style={{ fontSize: '0.85rem', lineHeight: 1.6, resize: 'vertical', width: '100%' }}
              placeholder="Опишите структуру лендинга, блоки, тексты... или нажмите «Сгенерировать ТЗ»" />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || !spec.trim()}
              style={{ flex: 1, padding: '12px' }}>
              {loading ? 'Генерация...' : 'Сгенерировать лендинг'}
            </button>
          </div>
        </div>
      );
    }

    // Генерация
    if (step === 'generating') {
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, margin: '0 auto 16px', border: '4px solid var(--border)',
            borderTop: '4px solid #7B68EE', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <h3 style={{ marginBottom: 8 }}>Генерация лендинга...</h3>
          <p style={{ color: 'var(--text-secondary)' }}>ИИ создаёт HTML-лендинг. Это может занять до 2 минут.</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    // Превью
    if (step === 'preview') {
      const canRegen = regenCount < MAX_REGEN;
      const handleApplyEdit = async () => {
        if (!canRegen) { showToast(`Лимит правок исчерпан (${MAX_REGEN})`, 'error'); return; }
        if (!editRequest.trim()) { showToast('Опишите, что нужно изменить', 'error'); return; }
        setEditing(true);
        try {
          const data = await api.post(`/ai-landing/${sUrl}/edit`, { edit_request: editRequest.trim() });
          if (data.success) {
            setHtmlContent(data.html || '');
            setRegenCount(data.regen_count ?? 0);
            setEditRequest('');
            showToast('Правки внесены', 'success');
          }
        } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
        finally { setEditing(false); }
      };
      const handleSaveMetrikaClick = async () => {
        setSavingMetrika(true);
        try {
          const data = await api.put(`/ai-landing/${sUrl}/metrika`, metrikaForm);
          if (data.success) showToast('Настройки аналитики сохранены', 'success');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setSavingMetrika(false); }
      };
      return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Превью лендинга</h2>
            <button className="btn" onClick={handleReset} style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Назад</button>
          </div>

          <div style={{ overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 16 }}>
            <iframe srcDoc={htmlContent} title="Landing Preview"
              style={{ width: '100%', height: 600, border: 'none' }} sandbox="allow-scripts" />
          </div>

          {/* Правки */}
          <div style={{ marginBottom: 16, padding: 16, border: '1px solid var(--border)', background: 'var(--bg-glass)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Правки</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Осталось: <b>{Math.max(0, MAX_REGEN - regenCount)}</b> из {MAX_REGEN}
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
              Опишите, что нужно изменить — ИИ внесёт правки в существующий код, не пересоздавая его с нуля
            </p>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Например: измени цвет кнопок на зелёный, добавь блок с отзывами после преимуществ, замени заголовок hero на «Новый заголовок»"
              value={editRequest}
              onChange={e => setEditRequest(e.target.value)}
              disabled={!canRegen || editing}
              style={{ width: '100%', fontSize: '0.88rem', resize: 'vertical', minHeight: 70, fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                className="btn btn-primary"
                onClick={handleApplyEdit}
                disabled={!canRegen || editing || !editRequest.trim()}
                style={{ padding: '8px 18px', fontSize: '0.85rem' }}
              >
                {editing ? 'Применение правок...' : !canRegen ? 'Лимит исчерпан' : 'Внести правки'}
              </button>
            </div>
          </div>

          {/* Аналитика */}
          <div style={{ marginBottom: 16, padding: '16px', border: '1px solid var(--border)', background: 'var(--bg-glass)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 12 }}>Аналитика и пиксели</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
              Счётчики автоматически встраиваются в HTML при открытии лендинга
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Яндекс Метрика — ID счётчика</label>
                <input className="form-input" placeholder="12345678" value={metrikaForm.ym_counter_id}
                  onChange={e => setMetrikaForm(p => ({ ...p, ym_counter_id: e.target.value }))}
                  style={{ fontSize: '0.85rem' }} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Название цели YM</label>
                <input className="form-input" placeholder="subscribe_channel" value={metrikaForm.ym_goal_name}
                  onChange={e => setMetrikaForm(p => ({ ...p, ym_goal_name: e.target.value }))}
                  style={{ fontSize: '0.85rem' }} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Пиксель VK — ID</label>
                <input className="form-input" placeholder="3751584" value={metrikaForm.vk_pixel_id}
                  onChange={e => setMetrikaForm(p => ({ ...p, vk_pixel_id: e.target.value }))}
                  style={{ fontSize: '0.85rem' }} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Название цели VK</label>
                <input className="form-input" placeholder="subscribe_channel" value={metrikaForm.vk_goal_name}
                  onChange={e => setMetrikaForm(p => ({ ...p, vk_goal_name: e.target.value }))}
                  style={{ fontSize: '0.85rem' }} />
              </div>
            </div>
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button className="btn" onClick={handleSaveMetrikaClick} disabled={savingMetrika}
                style={{ padding: '6px 16px', fontSize: '0.82rem' }}>
                {savingMetrika ? 'Сохранение...' : 'Сохранить аналитику'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handlePublish} disabled={loading}
              style={{ flex: 1, padding: '12px', fontSize: '1rem' }}>
              {loading ? 'Публикация...' : 'Опубликовать'}
            </button>
          </div>
        </div>
      );
    }

    // Готово
    if (step === 'done') {
      const landingUrl = `${window.location.origin}/land/${slug}`;
      return (
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
            background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 12 }}>Лендинг опубликован!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
            Ваш лендинг доступен по ссылке:
          </p>
          <div style={{ padding: '14px 18px', border: '1px solid var(--border)',
            background: 'var(--bg-glass)', marginBottom: 16, wordBreak: 'break-all' }}>
            <a href={landingUrl} target="_blank" rel="noopener noreferrer"
              style={{ color: '#7B68EE', textDecoration: 'none', fontSize: '0.95rem' }}>
              {landingUrl}
            </a>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn" style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              onClick={() => { navigator.clipboard.writeText(landingUrl); showToast('Скопировано!', 'success'); }}>
              Копировать ссылку
            </button>
            <button className="btn btn-primary" onClick={handleReset} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Новый лендинг
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return <Paywall>{pageTour}{renderContent()}</Paywall>;
}
