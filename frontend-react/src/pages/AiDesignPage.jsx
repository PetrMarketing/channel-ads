/**
 * ИИ Оформление — оркестратор шагов: опрос → генерация → выбор → лид-магнит → готово.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import Paywall from '../components/Paywall';
import AiDesignSurvey from './ai-design/AiDesignSurvey';
import AiDesignChoose from './ai-design/AiDesignChoose';
import { LmSurvey, LmChooseIdea, LmPreview } from './ai-design/AiDesignLm';
import AiDesignDone from './ai-design/AiDesignDone';

const SESSION_COST = 150;

export default function AiDesignPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const tc = currentChannel?.tracking_code;

  // Основное состояние — шаг мастера и данные сессии
  const [step, setStep] = useState('start');
  const [sessionId, setSessionId] = useState(null);
  const [sessionTc, setSessionTc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pastSessions, setPastSessions] = useState([]);

  // Опрос
  const [survey, setSurvey] = useState({
    niche: '', colors: ['#7B68EE'], photo: null, photoPreview: null,
    style: 'минимализм', contactLink: '', description: '',
  });

  // Результаты аватаров и описаний
  const [avatars, setAvatars] = useState([]);
  const [chosenAvatar, setChosenAvatar] = useState(null);
  const [descriptions, setDescriptions] = useState([]);
  const [chosenDesc, setChosenDesc] = useState(null);

  // Лид-магнит
  const [lmPdf, setLmPdf] = useState(null);
  const [lmPdfUploaded, setLmPdfUploaded] = useState(false);
  const [lmUploading, setLmUploading] = useState(false);
  const [lmWishes, setLmWishes] = useState('');
  const [lmIdeas, setLmIdeas] = useState([]);
  const [lmChosenIdea, setLmChosenIdea] = useState(null);
  const [lmContent, setLmContent] = useState('');
  const [lmPostText, setLmPostText] = useState('');
  const [lmBannerUrl, setLmBannerUrl] = useState(null);

  // Загрузка прошлых сессий при старте
  const loadPastSessions = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ai-design/${tc}/sessions`);
      if (data.success) setPastSessions(data.sessions || []);
    } catch { /* игнорируем */ }
  }, [tc]);

  useEffect(() => { if (step === 'start') loadPastSessions(); }, [step, loadPastSessions]);

  // Базовый URL для API-вызовов текущей сессии
  const sUrl = `${sessionTc}/session/${sessionId}`;

  // ---- Обработчики ----

  // Создание новой сессии (списание токенов)
  const handleStartSession = async () => {
    setLoading(true);
    try {
      const data = await api.post(`/ai-design/${tc}/session`);
      if (data.success) { setSessionId(data.session_id); setSessionTc(tc); setStep('survey'); }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  // Открытие прошлой сессии для перевыбора
  const handleOpenSession = (s) => {
    setSessionId(s.id); setSessionTc(tc);
    setAvatars(s.avatars || []); setDescriptions(s.descriptions || []);
    setChosenAvatar(s.avatars?.indexOf(s.chosen_avatar_url) ?? null);
    setChosenDesc(s.descriptions?.indexOf(s.chosen_description) ?? null);
    if (s.avatars?.length || s.descriptions?.length) setStep('choose');
  };

  // Отправка опроса и генерация
  const handleSubmitSurvey = async () => {
    if (!survey.niche.trim()) { showToast('Укажите сферу', 'error'); return; }
    if (!survey.contactLink.trim()) { showToast('Укажите ссылку для связи', 'error'); return; }
    setLoading(true);
    try {
      if (survey.photo) {
        const fd = new FormData(); fd.append('file', survey.photo);
        await api.upload(`/ai-design/${sUrl}/photo`, fd);
      }
      await api.put(`/ai-design/${sUrl}/survey`, {
        niche: survey.niche, colors: survey.colors, style: survey.style,
        contact_link: survey.contactLink, description: survey.description,
      });
      setStep('generating');
      const [aRes, dRes] = await Promise.all([
        api.post(`/ai-design/${sUrl}/generate-avatars`),
        api.post(`/ai-design/${sUrl}/generate-descriptions`),
      ]);
      if (aRes.success) setAvatars(aRes.avatars || []);
      if (dRes.success) setDescriptions(dRes.descriptions || []);
      setChosenAvatar(null); setChosenDesc(null); setStep('choose');
    } catch (e) { showToast(e.message, 'error'); setStep('survey'); }
    finally { setLoading(false); }
  };

  // Выбор аватарки
  const handleSelectAvatar = async (idx) => {
    setChosenAvatar(idx);
    try { await api.post(`/ai-design/${sUrl}/choose-avatar`, { index: idx }); }
    catch (e) { showToast(e.message, 'error'); }
  };

  // Выбор описания
  const handleSelectDesc = async (idx) => {
    setChosenDesc(idx);
    try { await api.post(`/ai-design/${sUrl}/choose-description`, { index: idx }); }
    catch (e) { showToast(e.message, 'error'); }
  };

  // Применение аватара и описания
  const handleApply = async () => {
    if (chosenAvatar === null) { showToast('Выберите аватарку', 'error'); return; }
    if (chosenDesc === null) { showToast('Выберите описание', 'error'); return; }
    setLoading(true);
    try {
      const data = await api.post(`/ai-design/${sUrl}/apply`);
      if (data.success) { showToast('Аватар и описание применены!', 'success'); setStep('lm_survey'); }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  // Загрузка PDF для лид-магнита
  const handleUploadLmPdf = async (file) => {
    if (!file) return;
    setLmPdf(file); setLmUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      await api.upload(`/ai-design/${sUrl}/lm-pdf`, fd);
      setLmPdfUploaded(true); showToast('Файл загружен', 'success');
    } catch (e) { showToast(e.message, 'error'); setLmPdf(null); setLmPdfUploaded(false); }
    finally { setLmUploading(false); }
  };

  // Генерация идей лид-магнита
  const handleSubmitLmSurvey = async () => {
    setLoading(true);
    try {
      setStep('lm_generating_ideas');
      const data = await api.post(`/ai-design/${sUrl}/generate-lm-ideas`, { wishes: lmWishes });
      if (data.success) { setLmIdeas(data.ideas || []); setStep('lm_choose_idea'); }
    } catch (e) { showToast(e.message, 'error'); setStep('lm_survey'); }
    finally { setLoading(false); }
  };

  // Выбор идеи и генерация контента
  const handleChooseLmIdea = async (idx) => {
    setLmChosenIdea(idx); setLoading(true);
    try {
      await api.post(`/ai-design/${sUrl}/choose-lm-idea`, { index: idx });
      setStep('lm_generating_content');
      const data = await api.post(`/ai-design/${sUrl}/generate-lm-content`);
      if (data.success) {
        setLmContent(data.lm_content || ''); setLmPostText(data.post_text || '');
        setLmBannerUrl(data.banner_url || null); setStep('lm_preview');
      }
    } catch (e) { showToast(e.message, 'error'); setStep('lm_choose_idea'); }
    finally { setLoading(false); }
  };

  // Установка лид-магнита и пост-закрепа
  const handleInstallLm = async () => {
    setLoading(true);
    try {
      const data = await api.post(`/ai-design/${sUrl}/install-lm`);
      if (data.success) { setStep('done'); showToast('Оформление готово!', 'success'); }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  // Сброс всех данных для новой сессии
  const handleReset = () => {
    setStep('start'); setSessionId(null); setSessionTc(null);
    setSurvey({ niche: '', colors: ['#7B68EE'], photo: null, photoPreview: null, style: 'минимализм', contactLink: '', description: '' });
    setAvatars([]); setChosenAvatar(null); setDescriptions([]); setChosenDesc(null);
    setLmPdf(null); setLmPdfUploaded(false); setLmUploading(false);
    setLmWishes(''); setLmIdeas([]); setLmChosenIdea(null);
    setLmContent(''); setLmPostText(''); setLmBannerUrl(null);
  };

  // ---- Рендер ----

  const renderContent = () => {
    // Стартовый экран с кнопкой новой сессии и списком прошлых
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
          {/* Список прошлых сессий */}
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

    // Опрос
    if (step === 'survey') return <AiDesignSurvey survey={survey} setSurvey={setSurvey} onSubmit={handleSubmitSurvey} loading={loading} />;

    // Спиннеры загрузки
    if (['generating', 'lm_generating_ideas', 'lm_generating_content'].includes(step)) {
      const msgs = { generating: 'ИИ создаёт аватарки и описания...', lm_generating_ideas: 'ИИ придумывает варианты лид-магнита...', lm_generating_content: 'ИИ генерирует контент и баннер...' };
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, margin: '0 auto 16px', border: '4px solid var(--border)', borderTop: '4px solid #7B68EE', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <h3 style={{ marginBottom: 8 }}>Генерация...</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{msgs[step]}</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    // Выбор аватара и описания
    if (step === 'choose') return <AiDesignChoose avatars={avatars} descriptions={descriptions} chosenAvatar={chosenAvatar} chosenDesc={chosenDesc} onSelectAvatar={handleSelectAvatar} onSelectDesc={handleSelectDesc} onApply={handleApply} onBack={handleReset} loading={loading} />;

    // Лид-магнит: опрос
    if (step === 'lm_survey') return <LmSurvey lmPdf={lmPdf} lmPdfUploaded={lmPdfUploaded} lmUploading={lmUploading} lmWishes={lmWishes} setLmWishes={setLmWishes} onUploadPdf={handleUploadLmPdf} onSubmit={handleSubmitLmSurvey} onSkip={() => setStep('done')} loading={loading} />;

    // Лид-магнит: выбор идеи
    if (step === 'lm_choose_idea') return <LmChooseIdea ideas={lmIdeas} chosenIdea={lmChosenIdea} onChoose={handleChooseLmIdea} loading={loading} />;

    // Лид-магнит: превью
    if (step === 'lm_preview') return <LmPreview lmContent={lmContent} lmPostText={lmPostText} lmBannerUrl={lmBannerUrl} onInstall={handleInstallLm} loading={loading} />;

    // Финальный дашборд
    if (step === 'done') return <AiDesignDone avatars={avatars} chosenAvatar={chosenAvatar} descriptions={descriptions} chosenDesc={chosenDesc} lmContent={lmContent} lmPostText={lmPostText} lmBannerUrl={lmBannerUrl} onChangeAvatar={() => setStep('choose')} onReset={handleReset} navigate={navigate} showToast={showToast} />;

    return null;
  };

  return <Paywall>{renderContent()}</Paywall>;
}
