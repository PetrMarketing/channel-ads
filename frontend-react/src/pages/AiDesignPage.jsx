import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import Paywall from '../components/Paywall';
import { usePageOnboarding } from '../components/OnboardingTour';
import AiDesignSurvey from './ai-design/AiDesignSurvey';
import AiDesignChoose from './ai-design/AiDesignChoose';
import { LmSurvey, LmChooseIdea, LmPreview } from './ai-design/AiDesignLm';
import AiDesignDone from './ai-design/AiDesignDone';

const SESSION_COST = 150;

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const PURPLE = '#a855f7';
const SUCCESS = '#10b981';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.92rem', fontWeight: 600,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform .15s ease, box-shadow .15s ease',
  letterSpacing: '-0.005em',
};

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
};

const pill = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 12px', borderRadius: 20,
  fontSize: '0.74rem', fontWeight: 600,
  background: bg, color,
  whiteSpace: 'nowrap',
});

const animStyle = (i) => ({
  animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
});

function StatusPill({ status }) {
  const map = {
    completed: { bg: 'rgba(16,185,129,0.10)', color: SUCCESS, label: 'Завершено' },
    applied:   { bg: 'rgba(67,97,238,0.10)',  color: ACCENT,  label: 'Применено' },
    default:   { bg: 'rgba(245,158,11,0.10)', color: WARNING, label: 'Готово' },
  };
  const m = map[status] || map.default;
  return (
    <span style={pill(m.bg, m.color)}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />
      {m.label}
    </span>
  );
}

function StartHero({ onStart, loading }) {
  return (
    <div
      data-tour-page="design-start"
      style={{
        ...cardBase,
        padding: '48px 32px 44px',
        textAlign: 'center',
        position: 'relative', overflow: 'hidden',
        animation: 'dashFadeUp 0.4s ease both',
      }}
    >
      <div aria-hidden style={{
        position: 'absolute', top: -90, right: -60, width: 240, height: 240,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${ACCENT2}1c 0%, transparent 70%)`,
        pointerEvents: 'none',
        animation: 'heroBlobFloat 6s ease-in-out infinite',
      }} />
      <div aria-hidden style={{
        position: 'absolute', bottom: -100, left: -70, width: 260, height: 260,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${PURPLE}18 0%, transparent 70%)`,
        pointerEvents: 'none',
        animation: 'heroBlobFloat 8s ease-in-out infinite reverse',
      }} />

      <div aria-hidden style={{
        position: 'relative', width: 120, height: 120, margin: '0 auto 26px',
      }}>
        <div style={{
          position: 'absolute', inset: -18, borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT2}38 0%, transparent 70%)`,
          animation: 'dashPulse 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `linear-gradient(135deg, ${ACCENT2} 0%, ${PURPLE} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 14px 36px ${ACCENT2}55`,
          animation: 'heroBlobFloat 5s ease-in-out infinite',
        }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/>
            <path d="m14 7 3 3"/>
            <path d="M5 6v4"/>
            <path d="M19 14v4"/>
            <path d="M10 2v2"/>
            <path d="M7 8H3"/>
            <path d="M21 16h-4"/>
            <path d="M11 3H9"/>
          </svg>
        </div>
        <div style={{
          position: 'absolute', right: -2, bottom: -2,
          width: 36, height: 36, borderRadius: '50%',
          background: `linear-gradient(135deg, ${WARNING} 0%, #f97316 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '1.05rem', fontWeight: 800,
          boxShadow: `0 4px 12px ${WARNING}66`,
          border: '3px solid #fff',
        }}>★</div>
      </div>

      <h1 style={{
        position: 'relative',
        fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.02em',
        color: DARK, margin: '0 0 10px', lineHeight: 1.15,
      }}>
        ИИ Оформление
      </h1>
      <p style={{
        position: 'relative',
        fontSize: '0.95rem', color: MUTED, margin: '0 auto 22px',
        maxWidth: 480, lineHeight: 1.55,
      }}>
        Аватар, описание и лид-магнит за 2 минуты — ИИ создаст оформление под вашу нишу
      </p>

      <div style={{ position: 'relative', marginBottom: 22 }}>
        <span style={{
          ...pill(`linear-gradient(135deg, ${ACCENT2}10 0%, ${PURPLE}10 100%)`, ACCENT2),
          border: `1px solid ${ACCENT2}30`,
          padding: '7px 16px',
          fontSize: '0.78rem',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT2, boxShadow: `0 0 8px ${ACCENT2}` }} />
          Стоимость · {SESSION_COST} токенов
        </span>
      </div>

      <button
        className="aid-primary"
        style={{ ...primaryBtn, position: 'relative', opacity: loading ? 0.7 : 1 }}
        onClick={onStart}
        disabled={loading}
      >
        {loading ? 'Создание сессии…' : 'Начать новую сессию'}
        {!loading && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
          </svg>
        )}
      </button>
    </div>
  );
}

function PastSessionsList({ sessions, onOpen }) {
  if (!sessions.length) return null;
  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={sectionTitleStyle}>Предыдущие сессии</h2>
        <p style={sectionSubStyle}>Откройте, чтобы посмотреть результат или сменить выбор</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sessions.map((s, i) => {
          const avatar = s.chosen_avatar_url || s.avatars?.[0];
          const dt = s.created_at ? new Date(s.created_at) : null;
          return (
            <div
              key={s.id}
              className="aid-card"
              onClick={() => onOpen(s)}
              style={{
                ...cardBase, padding: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 14,
                ...animStyle(i),
              }}
            >
              {avatar ? (
                <img src={avatar} alt="" style={{
                  width: 48, height: 48, borderRadius: '50%', objectFit: 'cover',
                  border: `1px solid ${BORDER}`, flexShrink: 0,
                }} />
              ) : (
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                  background: `linear-gradient(135deg, ${ACCENT2} 0%, ${PURPLE} 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: '1.05rem',
                  boxShadow: `0 3px 10px ${ACCENT2}40`,
                }}>
                  {(s.niche || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: DARK, letterSpacing: '-0.01em' }}>
                    {s.niche || 'Без темы'}
                  </span>
                  {s.style && (
                    <span style={pill(SOFT_BG, MUTED)}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: MUTED, opacity: 0.6 }} />
                      {s.style}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.76rem', color: MUTED, flexWrap: 'wrap' }}>
                  {dt && (
                    <span>{dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                  <StatusPill status={s.status} />
                </div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StepLoader({ step }) {
  const msgs = {
    generating: { title: 'Создаём аватарки и описания', sub: 'ИИ подбирает варианты под вашу нишу' },
    lm_generating_ideas:  { title: 'Придумываем лид-магниты', sub: 'Подбираем идеи на основе вашей сферы' },
    lm_generating_content:{ title: 'Готовим контент и баннер', sub: 'Финальный шаг — собираем материалы' },
  };
  const m = msgs[step] || { title: 'Загрузка', sub: 'Подождите немного' };

  return (
    <div style={{
      ...cardBase,
      padding: '64px 32px',
      textAlign: 'center',
      maxWidth: 520, margin: '0 auto',
      animation: 'dashFadeUp 0.4s ease both',
    }}>
      <div style={{
        position: 'relative', width: 80, height: 80, margin: '0 auto 22px',
      }}>
        <svg width="80" height="80" viewBox="0 0 80 80" style={{ animation: 'spin 1.5s linear infinite' }}>
          <defs>
            <linearGradient id="aid-loader-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={ACCENT} />
              <stop offset="100%" stopColor={ACCENT2} />
            </linearGradient>
          </defs>
          <circle cx="40" cy="40" r="32" fill="none" stroke={BORDER} strokeWidth="6" />
          <circle cx="40" cy="40" r="32" fill="none" stroke="url(#aid-loader-grad)" strokeWidth="6"
            strokeLinecap="round" strokeDasharray="60 200" />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `linear-gradient(135deg, ${ACCENT2} 0%, ${PURPLE} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 14px ${ACCENT2}55`,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
            </svg>
          </div>
        </div>
      </div>
      <h3 style={{
        margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800,
        color: DARK, letterSpacing: '-0.02em',
      }}>
        {m.title}
      </h3>
      <p style={{ margin: '0 0 22px', fontSize: '0.88rem', color: MUTED, lineHeight: 1.55 }}>
        {m.sub}
      </p>
      <div style={{
        display: 'inline-flex', gap: 6,
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: ACCENT2,
            animation: `aidDot 1.2s ease-in-out ${i * 0.15}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

export default function AiDesignPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const tc = currentChannel?.tracking_code;

  const { overlay: pageTour } = usePageOnboarding('ai-design', [
    { selector: '[data-tour-page="design-start"]', title: 'Генерация дизайна', text: '150 ИИ-токенов = аватар, описание и лид-магнит за 2 минуты.', placement: 'bottom' },
  ]);

  const [step, setStep] = useState('start');
  const [sessionId, setSessionId] = useState(null);
  const [sessionTc, setSessionTc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pastSessions, setPastSessions] = useState([]);

  const [survey, setSurvey] = useState({
    niche: '', colors: ['#7B68EE'], photo: null, photoPreview: null,
    style: 'минимализм', contactLink: '', description: '',
  });

  const [avatars, setAvatars] = useState([]);
  const [chosenAvatar, setChosenAvatar] = useState(null);
  const [descriptions, setDescriptions] = useState([]);
  const [chosenDesc, setChosenDesc] = useState(null);
  const [regenCount, setRegenCount] = useState(0);

  const [lmPdf, setLmPdf] = useState(null);
  const [lmPdfUploaded, setLmPdfUploaded] = useState(false);
  const [lmUploading, setLmUploading] = useState(false);
  const [lmWishes, setLmWishes] = useState('');
  const [lmIdeas, setLmIdeas] = useState([]);
  const [lmChosenIdea, setLmChosenIdea] = useState(null);
  const [lmContent, setLmContent] = useState('');
  const [lmPostText, setLmPostText] = useState('');
  const [lmBannerUrl, setLmBannerUrl] = useState(null);

  const loadPastSessions = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ai-design/${tc}/sessions`);
      if (data.success) setPastSessions(data.sessions || []);
    } catch { /* */ }
  }, [tc]);

  useEffect(() => { if (step === 'start') loadPastSessions(); }, [step, loadPastSessions]);

  const sUrl = `${sessionTc}/session/${sessionId}`;

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

  const handleSelectAvatar = async (idx) => {
    setChosenAvatar(idx);
    try { await api.post(`/ai-design/${sUrl}/choose-avatar`, { index: idx }); }
    catch (e) { showToast(e.message, 'error'); }
  };

  const handleSelectDesc = async (idx) => {
    setChosenDesc(idx);
    try { await api.post(`/ai-design/${sUrl}/choose-description`, { index: idx }); }
    catch (e) { showToast(e.message, 'error'); }
  };

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      setStep('generating');
      const [aRes, dRes] = await Promise.all([
        api.post(`/ai-design/${sUrl}/generate-avatars`),
        api.post(`/ai-design/${sUrl}/generate-descriptions`),
      ]);
      if (aRes.success) { setAvatars(aRes.avatars || []); setRegenCount(aRes.regen_count || regenCount + 1); }
      if (dRes.success) setDescriptions(dRes.descriptions || []);
      setChosenAvatar(null); setChosenDesc(null); setStep('choose');
    } catch (e) { showToast(e.message, 'error'); setStep('choose'); }
    finally { setLoading(false); }
  };

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

  const handleSubmitLmSurvey = async () => {
    setLoading(true);
    try {
      setStep('lm_generating_ideas');
      const data = await api.post(`/ai-design/${sUrl}/generate-lm-ideas`, { wishes: lmWishes });
      if (data.success) { setLmIdeas(data.ideas || []); setStep('lm_choose_idea'); }
    } catch (e) { showToast(e.message, 'error'); setStep('lm_survey'); }
    finally { setLoading(false); }
  };

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

  const handleInstallLm = async () => {
    setLoading(true);
    try {
      const data = await api.post(`/ai-design/${sUrl}/install-lm`);
      if (data.success) { setStep('done'); showToast('Оформление готово!', 'success'); }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleReset = () => {
    setStep('start'); setSessionId(null); setSessionTc(null);
    setSurvey({ niche: '', colors: ['#7B68EE'], photo: null, photoPreview: null, style: 'минимализм', contactLink: '', description: '' });
    setAvatars([]); setChosenAvatar(null); setDescriptions([]); setChosenDesc(null); setRegenCount(0);
    setLmPdf(null); setLmPdfUploaded(false); setLmUploading(false);
    setLmWishes(''); setLmIdeas([]); setLmChosenIdea(null);
    setLmContent(''); setLmPostText(''); setLmBannerUrl(null);
  };

  const renderContent = () => {
    if (step === 'start') {
      const finished = pastSessions.filter(s => s.avatars?.length > 0);
      return (
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <StartHero onStart={handleStartSession} loading={loading} />
          <PastSessionsList sessions={finished} onOpen={handleOpenSession} />
        </div>
      );
    }

    if (step === 'survey') return <AiDesignSurvey survey={survey} setSurvey={setSurvey} onSubmit={handleSubmitSurvey} loading={loading} />;

    if (['generating', 'lm_generating_ideas', 'lm_generating_content'].includes(step)) {
      return <StepLoader step={step} />;
    }

    if (step === 'choose') return <AiDesignChoose avatars={avatars} descriptions={descriptions} chosenAvatar={chosenAvatar} chosenDesc={chosenDesc} regenCount={regenCount} onSelectAvatar={handleSelectAvatar} onSelectDesc={handleSelectDesc} onApply={handleApply} onRegenerate={handleRegenerate} onBack={handleReset} loading={loading} />;

    if (step === 'lm_survey') return <LmSurvey lmPdf={lmPdf} lmPdfUploaded={lmPdfUploaded} lmUploading={lmUploading} lmWishes={lmWishes} setLmWishes={setLmWishes} onUploadPdf={handleUploadLmPdf} onSubmit={handleSubmitLmSurvey} onSkip={() => setStep('done')} loading={loading} />;

    if (step === 'lm_choose_idea') return <LmChooseIdea ideas={lmIdeas} chosenIdea={lmChosenIdea} onChoose={handleChooseLmIdea} loading={loading} />;

    if (step === 'lm_preview') return <LmPreview lmContent={lmContent} lmPostText={lmPostText} lmBannerUrl={lmBannerUrl} onInstall={handleInstallLm} loading={loading} />;

    if (step === 'done') return <AiDesignDone avatars={avatars} chosenAvatar={chosenAvatar} descriptions={descriptions} chosenDesc={chosenDesc} lmContent={lmContent} lmPostText={lmPostText} lmBannerUrl={lmBannerUrl} onChangeAvatar={() => setStep('choose')} onReset={handleReset} navigate={navigate} showToast={showToast} />;

    return null;
  };

  return (
    <Paywall>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes aidDot { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1.1); } }
        .aid-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .aid-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
      `}</style>
      <div style={{ animation: 'dashFade 0.4s ease' }}>
        {renderContent()}
      </div>
    </Paywall>
  );
}
