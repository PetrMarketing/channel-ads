import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';

const STYLES = [
  { id: 'минимализм', label: 'Минимализм' },
  { id: 'мультяшный', label: 'Мультяшный' },
  { id: 'реалистично', label: 'Реалистично' },
];
const DEFAULT_COLORS = ['#7B68EE', '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6'];
const SESSION_COST = 150;

export default function AiDesignPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;

  // Steps: start -> survey -> generating -> choose -> lm_survey -> lm_generating_ideas -> lm_choose_idea
  //        -> lm_generating_content -> lm_preview -> lm_installing -> done
  const [step, setStep] = useState('start');
  const [sessionId, setSessionId] = useState(null);
  const [sessionTc, setSessionTc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pastSessions, setPastSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Survey
  const [niche, setNiche] = useState('');
  const [colors, setColors] = useState(['#7B68EE']);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [style, setStyle] = useState('минимализм');
  const [contactLink, setContactLink] = useState('');
  const [description, setDescription] = useState('');
  const fileRef = useRef();

  // Avatar + Description results
  const [avatars, setAvatars] = useState([]);
  const [chosenAvatar, setChosenAvatar] = useState(null);
  const [descriptions, setDescriptions] = useState([]);
  const [chosenDesc, setChosenDesc] = useState(null);

  // Lead magnet
  const [lmPdf, setLmPdf] = useState(null);
  const [lmWishes, setLmWishes] = useState('');
  const [lmIdeas, setLmIdeas] = useState([]);
  const [lmChosenIdea, setLmChosenIdea] = useState(null);
  const [lmContent, setLmContent] = useState('');
  const [lmPostText, setLmPostText] = useState('');
  const [lmBannerUrl, setLmBannerUrl] = useState(null);
  const lmFileRef = useRef();

  const loadPastSessions = useCallback(async () => {
    if (!tc) return;
    setLoadingSessions(true);
    try {
      const data = await api.get(`/ai-design/${tc}/sessions`);
      if (data.success) setPastSessions(data.sessions || []);
    } catch { /* ignore */ }
    finally { setLoadingSessions(false); }
  }, [tc]);

  useEffect(() => { if (step === 'start') loadPastSessions(); }, [step, loadPastSessions]);

  if (!currentChannel) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Сначала добавьте канал</div>;
  }

  // ---- Handlers ----

  const handleStartSession = async () => {
    setLoading(true);
    try {
      const data = await api.post(`/ai-design/${tc}/session`);
      if (data.success) { setSessionId(data.session_id); setSessionTc(tc); setStep('survey'); }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleOpenSession = (s) => {
    setSessionId(s.id); setSessionTc(tc);
    setAvatars(s.avatars || []); setDescriptions(s.descriptions || []);
    setChosenAvatar(s.avatars?.indexOf(s.chosen_avatar_url) ?? null);
    setChosenDesc(s.descriptions?.indexOf(s.chosen_description) ?? null);
    if (s.avatars?.length || s.descriptions?.length) setStep('choose');
  };

  const addColor = () => setColors([...colors, '#000000']);
  const removeColor = (idx) => setColors(colors.filter((_, i) => i !== idx));
  const updateColor = (idx, val) => { const n = [...colors]; n[idx] = val; setColors(n); };

  const handleSubmitSurvey = async () => {
    if (!niche.trim()) { showToast('Укажите сферу', 'error'); return; }
    if (!contactLink.trim()) { showToast('Укажите ссылку для связи', 'error'); return; }
    setLoading(true);
    try {
      if (photo) {
        const fd = new FormData(); fd.append('file', photo);
        await api.upload(`/ai-design/${sessionTc}/session/${sessionId}/photo`, fd);
      }
      await api.put(`/ai-design/${sessionTc}/session/${sessionId}/survey`, {
        niche, colors, style, contact_link: contactLink, description,
      });
      setStep('generating');
      const [avatarRes, descRes] = await Promise.all([
        api.post(`/ai-design/${sessionTc}/session/${sessionId}/generate-avatars`),
        api.post(`/ai-design/${sessionTc}/session/${sessionId}/generate-descriptions`),
      ]);
      if (avatarRes.success) setAvatars(avatarRes.avatars || []);
      if (descRes.success) setDescriptions(descRes.descriptions || []);
      setChosenAvatar(null); setChosenDesc(null);
      setStep('choose');
    } catch (e) { showToast(e.message, 'error'); setStep('survey'); }
    finally { setLoading(false); }
  };

  const handleSelectAvatar = async (idx) => {
    setChosenAvatar(idx);
    try { await api.post(`/ai-design/${sessionTc}/session/${sessionId}/choose-avatar`, { index: idx }); }
    catch (e) { showToast(e.message, 'error'); }
  };

  const handleSelectDesc = async (idx) => {
    setChosenDesc(idx);
    try { await api.post(`/ai-design/${sessionTc}/session/${sessionId}/choose-description`, { index: idx }); }
    catch (e) { showToast(e.message, 'error'); }
  };

  const handleApply = async () => {
    if (chosenAvatar === null) { showToast('Выберите аватарку', 'error'); return; }
    if (chosenDesc === null) { showToast('Выберите описание', 'error'); return; }
    setLoading(true);
    try {
      const data = await api.post(`/ai-design/${sessionTc}/session/${sessionId}/apply`);
      if (data.success) {
        showToast('Аватар и описание применены!', 'success');
        setStep('lm_survey');
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleSubmitLmSurvey = async () => {
    setLoading(true);
    try {
      if (lmPdf) {
        const fd = new FormData(); fd.append('file', lmPdf);
        await api.upload(`/ai-design/${sessionTc}/session/${sessionId}/lm-pdf`, fd);
      }
      setStep('lm_generating_ideas');
      const data = await api.post(`/ai-design/${sessionTc}/session/${sessionId}/generate-lm-ideas`, { wishes: lmWishes });
      if (data.success) { setLmIdeas(data.ideas || []); setStep('lm_choose_idea'); }
    } catch (e) { showToast(e.message, 'error'); setStep('lm_survey'); }
    finally { setLoading(false); }
  };

  const handleChooseLmIdea = async (idx) => {
    setLmChosenIdea(idx);
    setLoading(true);
    try {
      await api.post(`/ai-design/${sessionTc}/session/${sessionId}/choose-lm-idea`, { index: idx });
      setStep('lm_generating_content');
      const data = await api.post(`/ai-design/${sessionTc}/session/${sessionId}/generate-lm-content`);
      if (data.success) {
        setLmContent(data.lm_content || '');
        setLmPostText(data.post_text || '');
        setLmBannerUrl(data.banner_url || null);
        setStep('lm_preview');
      }
    } catch (e) { showToast(e.message, 'error'); setStep('lm_choose_idea'); }
    finally { setLoading(false); }
  };

  const handleInstallLm = async () => {
    setLoading(true);
    try {
      const data = await api.post(`/ai-design/${sessionTc}/session/${sessionId}/install-lm`);
      if (data.success) {
        setStep('done');
        showToast('Оформление готово!', 'success');
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleReset = () => {
    setStep('start'); setSessionId(null); setSessionTc(null);
    setNiche(''); setColors(['#7B68EE']); setPhoto(null); setPhotoPreview(null);
    setStyle('минимализм'); setContactLink(''); setDescription('');
    setAvatars([]); setChosenAvatar(null); setDescriptions([]); setChosenDesc(null);
    setLmPdf(null); setLmWishes(''); setLmIdeas([]); setLmChosenIdea(null);
    setLmContent(''); setLmPostText(''); setLmBannerUrl(null);
  };

  // ---- RENDER ----

  // Start
  if (step === 'start') {
    const finished = pastSessions.filter(s => s.avatars?.length > 0);
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
            background: 'linear-gradient(135deg, #7B68EE, #4F46E5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>
              <path d="M17.8 11.8L19 13"/><path d="M15 9h0"/><path d="M17.8 6.2L19 5"/>
              <path d="M3 21l9-9"/><path d="M12.2 6.2L11 5"/><path d="M12.2 11.8L11 13"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 12 }}>ИИ Оформление</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>Генерация аватарки, описания и лид-магнита для вашего канала</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 24 }}>
            Стоимость сессии: <b style={{ color: '#7B68EE' }}>{SESSION_COST} токенов</b>
          </p>
          <button className="btn btn-primary" onClick={handleStartSession} disabled={loading}
            style={{ padding: '12px 32px', fontSize: '1rem' }}>
            {loading ? 'Создание...' : 'Новая сессия'}
          </button>
        </div>
        {finished.length > 0 && (
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 12 }}>Предыдущие сессии</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {finished.map(s => (
                <div key={s.id} onClick={() => handleOpenSession(s)} style={{
                  display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px',
                  borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-glass)',
                  cursor: 'pointer', transition: 'border-color 0.2s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#7B68EE'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  {(s.chosen_avatar_url || s.avatars?.[0]) ? (
                    <img src={s.chosen_avatar_url || s.avatars[0]} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} />
                  ) : <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--border)' }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{s.niche || 'Без темы'}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 8 }}>{s.style}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      {s.created_at ? new Date(s.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      {' '}&middot;{' '}
                      <span style={{ color: s.status === 'completed' ? '#10B981' : '#7B68EE' }}>
                        {s.status === 'completed' ? 'Завершено' : s.status === 'applied' ? 'Применено' : 'Готово'}
                      </span>
                    </div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Survey
  if (step === 'survey') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 20 }}>Опрос — оформление канала</h2>
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Ваша сфера *</label>
          <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="Например: фитнес, кулинария, IT..." />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Цвета</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {colors.map((c, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <input type="color" value={c} onChange={e => updateColor(i, e.target.value)}
                  style={{ width: 44, height: 44, border: '2px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
                {colors.length > 1 && (
                  <button onClick={() => removeColor(i)} style={{
                    position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
                    border: 'none', background: 'var(--error, #e63946)', color: '#fff', fontSize: '0.7rem',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>&times;</button>
                )}
              </div>
            ))}
            <button onClick={addColor} style={{ width: 44, height: 44, borderRadius: 8, border: '2px dashed var(--border)',
              background: 'transparent', cursor: 'pointer', fontSize: '1.4rem', color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
            {DEFAULT_COLORS.map(c => (
              <button key={c} onClick={() => { if (!colors.includes(c)) setColors([...colors, c]); }}
                style={{ width: 24, height: 24, borderRadius: 4, border: colors.includes(c) ? '2px solid #fff' : '1px solid var(--border)',
                  background: c, cursor: 'pointer', opacity: colors.includes(c) ? 1 : 0.5 }} />
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Фото (необязательно)</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn" onClick={() => fileRef.current?.click()} style={{ padding: '8px 16px' }}>Выбрать фото</button>
            <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setPhoto(f); setPhotoPreview(URL.createObjectURL(f)); } }} style={{ display: 'none' }} />
            {photoPreview && <img src={photoPreview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Стиль</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STYLES.map(s => (
              <button key={s.id} onClick={() => setStyle(s.id)} className={`btn ${style === s.id ? 'btn-primary' : ''}`}
                style={{ padding: '8px 16px' }}>{s.label}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Ссылка для связи *</label>
          <input className="form-input" value={contactLink} onChange={e => setContactLink(e.target.value)} placeholder="https://t.me/username или @username" />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label className="form-label">Описание (дополнительные пожелания)</label>
          <textarea className="form-input" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Любые пожелания к оформлению..." rows={3} style={{ resize: 'vertical' }} />
        </div>
        <button className="btn btn-primary" onClick={handleSubmitSurvey} disabled={loading} style={{ width: '100%', padding: '12px' }}>
          {loading ? 'Генерация...' : 'Сгенерировать'}
        </button>
      </div>
    );
  }

  // Loading spinners
  if (['generating', 'lm_generating_ideas', 'lm_generating_content', 'lm_installing'].includes(step)) {
    const msgs = {
      generating: 'ИИ создаёт аватарки и описания...',
      lm_generating_ideas: 'ИИ придумывает варианты лид-магнита...',
      lm_generating_content: 'ИИ генерирует контент и баннер...',
      lm_installing: 'Устанавливаем лид-магнит и пост-закреп...',
    };
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, margin: '0 auto 16px', border: '4px solid var(--border)',
          borderTop: '4px solid #7B68EE', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <h3 style={{ marginBottom: 8 }}>Генерация...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>{msgs[step]}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Choose avatar + description
  if (step === 'choose') {
    const canApply = chosenAvatar !== null && chosenDesc !== null;
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Выберите оформление</h2>
          <button className="btn" onClick={handleReset} style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Назад</button>
        </div>
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 10 }}>Аватарка</h3>
          {avatars.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {avatars.map((url, i) => (
                <div key={i} onClick={() => handleSelectAvatar(i)} style={{
                  cursor: 'pointer', borderRadius: 12, overflow: 'hidden',
                  border: chosenAvatar === i ? '3px solid #7B68EE' : '2px solid var(--border)',
                  transition: 'all 0.2s', transform: chosenAvatar === i ? 'scale(1.03)' : 'scale(1)',
                }}><img src={url} alt={`${i+1}`} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} /></div>
              ))}
            </div>
          ) : <p style={{ color: 'var(--error, #e63946)' }}>Не удалось сгенерировать аватарки.</p>}
        </div>
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 10 }}>Описание канала</h3>
          {descriptions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {descriptions.map((desc, i) => (
                <div key={i} onClick={() => handleSelectDesc(i)} style={{
                  cursor: 'pointer', padding: '14px 18px', borderRadius: 12,
                  border: chosenDesc === i ? '2px solid #7B68EE' : '1px solid var(--border)',
                  background: chosenDesc === i ? 'rgba(123,104,238,0.08)' : 'var(--bg-glass)',
                  transition: 'all 0.2s', lineHeight: 1.6, fontSize: '0.9rem',
                }}>{desc}</div>
              ))}
            </div>
          ) : <p style={{ color: 'var(--error, #e63946)' }}>Не удалось сгенерировать описания.</p>}
        </div>
        {canApply && (
          <div style={{ padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(123,104,238,0.3)',
            background: 'rgba(123,104,238,0.05)', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <img src={avatars[chosenAvatar]} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', border: '2px solid #7B68EE' }} />
            <div style={{ flex: 1, minWidth: 200, fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{descriptions[chosenDesc]}</div>
          </div>
        )}
        <button className="btn btn-primary" onClick={handleApply} disabled={loading || !canApply}
          style={{ width: '100%', padding: '12px', fontSize: '1rem' }}>
          {loading ? 'Применение...' : 'Применить и продолжить'}
        </button>
      </div>
    );
  }

  // LM Survey
  if (step === 'lm_survey') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>Лид-магнит</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '0.88rem' }}>
          Создадим бесплатный подарок за подписку на ваш канал
        </p>
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">PDF с вашим контентом (необязательно)</label>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Загрузите файл с вашим контентом — ИИ использует его как референс для лид-магнита
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn" onClick={() => lmFileRef.current?.click()} style={{ padding: '8px 16px' }}>Выбрать файл</button>
            <input ref={lmFileRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) setLmPdf(f); }} style={{ display: 'none' }} />
            {lmPdf && <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{lmPdf.name}</span>}
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label className="form-label">Пожелания</label>
          <textarea className="form-input" value={lmWishes} onChange={e => setLmWishes(e.target.value)}
            placeholder="Какой подарок вы хотите предложить подписчикам? Любые пожелания..." rows={3} style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handleSubmitLmSurvey} disabled={loading} style={{ flex: 1, padding: '12px' }}>
            {loading ? 'Генерация...' : 'Сгенерировать варианты'}
          </button>
          <button className="btn" onClick={() => setStep('done')} style={{ padding: '12px 20px' }}>Пропустить</button>
        </div>
      </div>
    );
  }

  // LM Choose Idea
  if (step === 'lm_choose_idea') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>Выберите лид-магнит</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '0.88rem' }}>Нажмите на понравившийся вариант</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lmIdeas.map((idea, i) => (
            <div key={i} onClick={() => handleChooseLmIdea(i)} style={{
              cursor: loading ? 'wait' : 'pointer', padding: '16px 20px', borderRadius: 12,
              border: lmChosenIdea === i ? '2px solid #7B68EE' : '1px solid var(--border)',
              background: lmChosenIdea === i ? 'rgba(123,104,238,0.08)' : 'var(--bg-glass)',
              transition: 'all 0.2s', opacity: loading && lmChosenIdea !== i ? 0.5 : 1,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{idea.title}</div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{idea.description}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // LM Preview
  if (step === 'lm_preview') {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '20px' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 20 }}>Превью лид-магнита</h2>

        {lmBannerUrl && (
          <div style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <img src={lmBannerUrl} alt="Баннер" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>Пост-закреп</h3>
          <div style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-glass)', fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {lmPostText}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>Контент лид-магнита</h3>
          <div style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-glass)', fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
            maxHeight: 300, overflowY: 'auto' }}>
            {lmContent}
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleInstallLm} disabled={loading}
          style={{ width: '100%', padding: '12px', fontSize: '1rem' }}>
          {loading ? 'Установка...' : 'Установить'}
        </button>
      </div>
    );
  }

  // Done
  if (step === 'done') {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 20px',
          background: 'linear-gradient(135deg, #10B981, #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 12 }}>Ваше оформление готово!</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
          Аватар, описание и лид-магнит установлены.
        </p>

        {chosenDesc !== null && descriptions[chosenDesc] && (
          <div style={{ marginTop: 20, marginBottom: 20, padding: '12px 16px', borderRadius: 8,
            background: 'rgba(123,104,238,0.08)', border: '1px solid rgba(123,104,238,0.2)', textAlign: 'left' }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 8, color: '#7B68EE' }}>
              Описание для канала (скопируйте в настройки):
            </p>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 8 }}>{descriptions[chosenDesc]}</p>
            <button className="btn" style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              onClick={() => { navigator.clipboard.writeText(descriptions[chosenDesc]); showToast('Скопировано!', 'success'); }}>
              Копировать
            </button>
          </div>
        )}

        <button className="btn btn-primary" onClick={handleReset} style={{ padding: '10px 24px' }}>Назад</button>
      </div>
    );
  }

  return null;
}
