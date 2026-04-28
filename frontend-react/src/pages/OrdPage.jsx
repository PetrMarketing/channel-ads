import { useState, useEffect, useCallback } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import { usePageOnboarding } from '../components/OnboardingTour';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const TABS = [
  { key: 'settings',  label: 'Настройки' },
  { key: 'persons',   label: 'Контрагенты' },
  { key: 'contracts', label: 'Договоры' },
  { key: 'creatives', label: 'Креативы' },
  { key: 'stats',     label: 'Статистика' },
];

const ROLE_META = {
  advertiser: { label: 'Заказчик',   color: ACCENT,  soft: 'rgba(67,97,238,0.10)' },
  publisher:  { label: 'Издатель',   color: ACCENT2, soft: 'rgba(123,104,238,0.10)' },
  agency:     { label: 'Агентство',  color: WARNING, soft: 'rgba(245,158,11,0.10)' },
};

const FORM_LABELS = {
  text_block:         'Текст',
  text_graphic_block: 'Текст + изображение',
  banner:             'Баннер',
  video:              'Видео',
  text_video_block:   'Текст + видео',
};

const POST_TYPE_META = {
  content:  { label: 'Публикация', color: ACCENT,  soft: 'rgba(67,97,238,0.10)' },
  giveaway: { label: 'Розыгрыш',   color: DANGER,  soft: 'rgba(230,57,70,0.10)' },
  pin:      { label: 'Закреп',     color: ACCENT2, soft: 'rgba(123,104,238,0.10)' },
};

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.88rem', fontWeight: 600,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform .15s ease, box-shadow .15s ease',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.84rem', fontWeight: 500,
  transition: 'border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease',
};

const iconGhostBtn = {
  ...ghostBtn,
  width: 34, height: 34, padding: 0, fontSize: '0.95rem',
};

const dangerGhost = {
  ...iconGhostBtn,
  color: DANGER,
  borderColor: 'rgba(230,57,70,0.25)',
  background: 'rgba(230,57,70,0.04)',
};

const pill = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '3px 10px', borderRadius: 20,
  fontSize: '0.7rem', fontWeight: 600,
  background: bg, color,
  whiteSpace: 'nowrap',
});

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${BORDER}`, background: '#fff',
  fontSize: '0.88rem', color: DARK,
  outline: 'none', transition: 'border-color .15s ease, box-shadow .15s ease',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600,
  color: DARK, marginBottom: 6,
};

const hintStyle = { fontSize: '0.74rem', color: MUTED, marginTop: 4, lineHeight: 1.45 };

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
};

const animStyle = (i) => ({
  animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
});

const codeChipStyle = {
  display: 'inline-flex', alignItems: 'center',
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: '0.72rem',
  padding: '3px 9px',
  borderRadius: 6,
  background: SOFT_BG,
  border: `1px solid ${BORDER}`,
  color: ACCENT,
  whiteSpace: 'nowrap',
};

const eridPillStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: '0.78rem', fontWeight: 700,
  padding: '6px 12px', borderRadius: 999,
  background: `linear-gradient(135deg, rgba(67,97,238,0.10) 0%, rgba(123,104,238,0.10) 100%)`,
  border: `1px solid ${ACCENT}33`,
  color: ACCENT,
  cursor: 'pointer',
  letterSpacing: '0.02em',
  transition: 'all .15s ease',
};

const sectionHeaderRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  marginBottom: 14, flexWrap: 'wrap', gap: 10,
};

const pageHeaderWrap = {
  position: 'relative', overflow: 'hidden',
  background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}`,
  padding: '26px 28px 24px', marginBottom: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const pageHeaderBlur1 = {
  position: 'absolute', top: -50, right: -30, width: 180, height: 180,
  borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT2}24 0%, transparent 70%)`,
  pointerEvents: 'none', animation: 'heroBlobFloat 6s ease-in-out infinite',
};
const pageHeaderBlur2 = {
  position: 'absolute', bottom: -70, left: -50, width: 200, height: 200,
  borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT}1c 0%, transparent 70%)`,
  pointerEvents: 'none', animation: 'heroBlobFloat 8s ease-in-out infinite reverse',
};
const pageHeaderRow = {
  position: 'relative', display: 'flex', justifyContent: 'space-between',
  alignItems: 'center', gap: 16, flexWrap: 'wrap',
};
const eyebrowStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  fontSize: '0.72rem', fontWeight: 600, color: MUTED,
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10,
};
const pageTitleStyle = {
  margin: 0, fontSize: 'clamp(1.6rem, 2.4vw, 2rem)', fontWeight: 800,
  color: DARK, letterSpacing: '-0.04em', lineHeight: 1.05,
};
const pageSubStyle = {
  margin: '8px 0 0', fontSize: '0.92rem', color: MUTED,
  lineHeight: 1.5, maxWidth: 620,
};

function PlusIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BriefcaseIcon({ size = 26, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function DocumentIcon({ size = 26, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function MegaphoneIcon({ size = 26, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11v3a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
      <path d="M16 8a5 5 0 0 1 0 8" />
      <path d="M19 5a9 9 0 0 1 0 14" />
    </svg>
  );
}

function ChartIcon({ size = 26, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
    </svg>
  );
}

function KeyIcon({ size = 26, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 19 4" />
      <path d="M18 5l3 3" />
      <path d="M15 8l3 3" />
    </svg>
  );
}

function CopyIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function GradientAvatar({ from, to, children, size = 52, halo = true }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 14, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      boxShadow: `0 4px 12px ${from}33`,
      position: 'relative', overflow: 'hidden',
    }}>
      {halo && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.25), transparent 60%)',
          pointerEvents: 'none',
        }} />
      )}
      <span style={{ position: 'relative', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))', display: 'inline-flex' }}>{children}</span>
    </div>
  );
}

function EmptyState({ accent, accent2, badgeFrom, badgeTo, badgeChar, icon, title, description, ctaLabel, onCreate }) {
  return (
    <div
      style={{
        ...cardBase,
        padding: '56px 32px',
        textAlign: 'center',
        position: 'relative', overflow: 'hidden',
        animation: 'dashFadeUp 0.4s ease 0.1s both',
      }}
    >
      <div aria-hidden style={{
        position: 'relative', width: 120, height: 120, margin: '0 auto 26px',
      }}>
        <div style={{
          position: 'absolute', inset: -16, borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}30 0%, transparent 70%)`,
          animation: 'dashPulse 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `linear-gradient(135deg, ${accent} 0%, ${accent2} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 14px 36px ${accent}45`,
          animation: 'heroBlobFloat 5s ease-in-out infinite',
        }}>
          {icon}
        </div>
        <div style={{
          position: 'absolute', right: -4, bottom: -4,
          width: 34, height: 34, borderRadius: '50%',
          background: `linear-gradient(135deg, ${badgeFrom} 0%, ${badgeTo} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '1.25rem', fontWeight: 800,
          boxShadow: `0 4px 12px ${badgeFrom}55`,
          border: '3px solid #fff',
        }}>{badgeChar}</div>
      </div>

      <h3 style={{
        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em',
        color: DARK, margin: '0 0 8px',
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px',
        maxWidth: 460, lineHeight: 1.55,
      }}>
        {description}
      </p>

      {onCreate && (
        <button className="ord-primary" style={primaryBtn} onClick={onCreate}>
          <PlusIcon />
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

function EmptyPersons({ onCreate }) {
  return (
    <EmptyState
      accent={ACCENT} accent2={ACCENT2}
      badgeFrom={SUCCESS} badgeTo="#34d399" badgeChar="+"
      icon={<BriefcaseIcon size={50} strokeWidth={1.7} />}
      title="Добавьте первого контрагента"
      description="Зарегистрируйте рекламодателя, площадку или агентство. Контрагенты — это участники рекламной цепочки, которые передаются в ОРД."
      ctaLabel="Добавить контрагента"
      onCreate={onCreate}
    />
  );
}

function EmptyContracts({ onCreate, blocked }) {
  return (
    <EmptyState
      accent={WARNING} accent2="#f97316"
      badgeFrom={ACCENT} badgeTo={ACCENT2} badgeChar="+"
      icon={<DocumentIcon size={48} strokeWidth={1.7} />}
      title={blocked ? 'Сначала создайте контрагентов' : 'Создайте первый договор'}
      description={
        blocked
          ? 'Договор связывает заказчика и исполнителя. Перейдите на вкладку «Контрагенты» и зарегистрируйте хотя бы двух участников.'
          : 'Договор фиксирует отношения между заказчиком и исполнителем. К нему привязываются креативы для получения ERID.'
      }
      ctaLabel="Создать договор"
      onCreate={blocked ? null : onCreate}
    />
  );
}

function EmptyCreatives({ onCreate, blocked }) {
  return (
    <EmptyState
      accent={ACCENT2} accent2="#a855f7"
      badgeFrom={SUCCESS} badgeTo="#34d399" badgeChar="✓"
      icon={<MegaphoneIcon size={50} strokeWidth={1.7} />}
      title={blocked ? 'Сначала добавьте контрагентов и договор' : 'Получите первый ERID'}
      description={
        blocked
          ? 'Креатив привязывается либо к договору, либо к контрагенту-саморекламодателю. Создайте их в соответствующих вкладках.'
          : 'Креатив — это рекламный материал, для которого ОРД выдаёт ERID-токен. Этот токен публикуется в посте, подтверждая маркировку.'
      }
      ctaLabel="Получить ERID"
      onCreate={blocked ? null : onCreate}
    />
  );
}

function EmptyMarkedPosts() {
  return (
    <EmptyState
      accent={ACCENT} accent2={ACCENT2}
      badgeFrom={WARNING} badgeTo="#f97316" badgeChar="!"
      icon={<ChartIcon size={50} strokeWidth={1.7} />}
      title="Нет промаркированных постов"
      description="Добавьте ERID при создании публикации или розыгрыша — пост попадёт в этот список и можно будет отправить статистику показов."
    />
  );
}

export default function OrdPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;
  const [tab, setTab] = useState('settings');
  const [loading, setLoading] = useState(false);

  const [settings, setSettings] = useState(null);
  const [tokenInput, setTokenInput] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [persons, setPersons] = useState([]);
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [personForm, setPersonForm] = useState({ external_id: '', name: '', inn: '', role: 'advertiser', person_type: 'juridical' });

  const [contracts, setContracts] = useState([]);
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractForm, setContractForm] = useState({ external_id: '', client_external_id: '', contractor_external_id: '', date: '', serial: '', amount: '', subject_type: 'distribution' });

  const [creatives, setCreatives] = useState([]);
  const [showCreativeModal, setShowCreativeModal] = useState(false);
  const [creativeForm, setCreativeForm] = useState({ external_id: '', contract_external_id: '', person_external_id: '', form: 'text_block', texts: '', brand: '', target_urls: '', kktus: '1.1.1', name: '', self_promo: false });

  const [markedPosts, setMarkedPosts] = useState([]);
  const [statsForm, setStatsForm] = useState({ creative_external_id: '', pad_external_id: '', date_start: '', date_end: '', shows_count: '' });

  const [saving, setSaving] = useState(false);

  const { overlay: pageTour } = usePageOnboarding('ord', [
    { selector: '[data-tour-page="settings-tab"]', title: 'Маркировка рекламы', text: 'По закону РФ. Введите токен API ОРД, создайте контрагента, договор и креатив для получения ERID.', placement: 'bottom' },
  ]);

  const loadSettings = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ord/${tc}/settings`);
      if (data.settings) {
        setSettings(data.settings);
        setTokenInput(data.settings.api_token || '');
        setSandbox(data.settings.sandbox || false);
      }
    } catch {}
  }, [tc]);

  const loadPersons = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ord/${tc}/persons`);
      setPersons(data.persons || []);
    } catch {}
  }, [tc]);

  const loadContracts = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ord/${tc}/contracts`);
      setContracts(data.contracts || []);
    } catch {}
  }, [tc]);

  const loadCreatives = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ord/${tc}/creatives`);
      setCreatives(data.creatives || []);
    } catch {}
  }, [tc]);

  const loadMarkedPosts = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ord/${tc}/marked-posts`);
      setMarkedPosts(data.posts || []);
    } catch {}
  }, [tc]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { if (tab === 'persons') loadPersons(); }, [tab, loadPersons]);
  useEffect(() => { if (tab === 'contracts') loadContracts(); }, [tab, loadContracts]);
  useEffect(() => { if (tab === 'creatives') loadCreatives(); }, [tab, loadCreatives]);
  useEffect(() => { if (tab === 'stats') { loadMarkedPosts(); loadCreatives(); } }, [tab, loadMarkedPosts, loadCreatives]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const data = await api.post(`/ord/${tc}/settings`, { api_token: tokenInput, sandbox });
      if (data.success) {
        showToast('API-токен сохранён и проверен');
        loadSettings();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const savePerson = async () => {
    setSaving(true);
    try {
      const data = await api.post(`/ord/${tc}/persons`, personForm);
      if (data.success) {
        showToast('Контрагент создан в ORD');
        setShowPersonModal(false);
        loadPersons();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveContract = async () => {
    setSaving(true);
    try {
      const data = await api.post(`/ord/${tc}/contracts`, contractForm);
      if (data.success) {
        showToast('Договор создан в ORD');
        setShowContractModal(false);
        loadContracts();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveCreative = async () => {
    setSaving(true);
    try {
      const texts = creativeForm.texts.split('\n').filter(t => t.trim());
      const target_urls = creativeForm.target_urls.split('\n').filter(u => u.trim());
      const kktus = creativeForm.kktus.split(',').map(k => k.trim()).filter(Boolean);
      const payload = {
        external_id: creativeForm.external_id,
        form: creativeForm.form,
        texts,
        target_urls,
        kktus,
        brand: creativeForm.brand,
        name: creativeForm.name,
        pay_type: 'other',
      };
      if (creativeForm.self_promo) {
        payload.person_external_id = creativeForm.person_external_id;
      } else {
        payload.contract_external_id = creativeForm.contract_external_id;
      }
      const data = await api.post(`/ord/${tc}/creatives`, payload);
      if (data.success) {
        showToast(`ERID получен: ${data.erid}`);
        setShowCreativeModal(false);
        loadCreatives();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendStats = async () => {
    setSaving(true);
    try {
      const data = await api.post(`/ord/${tc}/statistics`, {
        items: [{
          creative_external_id: statsForm.creative_external_id,
          pad_external_id: statsForm.pad_external_id,
          date_start_actual: statsForm.date_start,
          date_end_actual: statsForm.date_end,
          shows_count: parseInt(statsForm.shows_count) || 0,
        }],
      });
      if (data.success) {
        showToast('Статистика отправлена в ORD');
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text, label = 'Скопировано') => {
    navigator.clipboard.writeText(text).then(() => showToast(label)).catch(() => {});
  };

  const openCreatePerson = () => {
    setPersonForm({ external_id: '', name: '', inn: '', role: 'advertiser', person_type: 'juridical' });
    setShowPersonModal(true);
  };
  const openCreateContract = () => {
    setContractForm({ external_id: '', client_external_id: '', contractor_external_id: '', date: '', serial: '', amount: '', subject_type: 'distribution' });
    setShowContractModal(true);
  };
  const openCreateCreative = () => {
    setCreativeForm({ external_id: '', contract_external_id: '', person_external_id: '', form: 'text_block', texts: '', brand: '', target_urls: '', kktus: '1.1.1', name: '', self_promo: false });
    setShowCreativeModal(true);
  };

  const tabCounts = {
    settings:  null,
    persons:   persons.length,
    contracts: contracts.length,
    creatives: creatives.length,
    stats:     markedPosts.length,
  };

  const headerCta = (() => {
    switch (tab) {
      case 'persons':   return { label: 'Добавить контрагента', action: openCreatePerson };
      case 'contracts': return { label: 'Создать договор',     action: openCreateContract,  disabled: persons.length < 2 };
      case 'creatives': return { label: 'Получить ERID',       action: openCreateCreative,  disabled: persons.length < 1 || (contracts.length < 1 && persons.length < 1) };
      default:          return null;
    }
  })();

  const personByExtId = (id) => persons.find(p => p.external_id === id);

  return (
    <Paywall>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .ord-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .ord-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .ord-danger:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
          transform: translateY(-1px);
        }
        .ord-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .ord-primary[disabled] {
          opacity: 0.55; cursor: not-allowed; transform: none !important; box-shadow: 0 2px 8px ${ACCENT}25 !important;
        }
        .ord-input:focus,
        .ord-input:focus-within {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .ord-erid:hover {
          background: linear-gradient(135deg, rgba(67,97,238,0.16) 0%, rgba(123,104,238,0.16) 100%) !important;
          border-color: ${ACCENT}55 !important;
        }
        .ord-code:hover {
          background: ${ACCENT}10 !important;
          border-color: ${ACCENT}40 !important;
        }
        .ord-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 18px; border-radius: 999px; cursor: pointer;
          background: transparent; border: 1px solid transparent;
          color: ${MUTED}; font-size: 0.86rem; font-weight: 600;
          letter-spacing: -0.005em;
          transition: all .18s ease;
        }
        .ord-tab:hover {
          color: ${DARK};
          background: ${SOFT_BG};
        }
        .ord-tab.active {
          color: #fff;
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          box-shadow: 0 4px 14px ${ACCENT}40;
        }
        .ord-tab-count {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
          font-size: 0.68rem; font-weight: 700; letter-spacing: -0.01em;
          background: ${SOFT_BG}; color: ${MUTED};
          transition: all .18s ease;
        }
        .ord-tab.active .ord-tab-count {
          background: rgba(255,255,255,0.22);
          color: #fff;
        }
        .ord-toggle-card {
          display: flex; align-items: flex-start; gap: 12;
          padding: 12px 14px; border-radius: 12px;
          border: 1px solid ${BORDER}; background: #fff;
          cursor: pointer;
          transition: border-color .15s ease, background .15s ease;
        }
        .ord-toggle-card:hover { border-color: ${ACCENT}55; }
      `}</style>

      <div style={{ animation: 'dashFade 0.4s ease' }}>
        <section style={pageHeaderWrap}>
          <div style={pageHeaderBlur1} />
          <div style={pageHeaderBlur2} />
          <div style={pageHeaderRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={eyebrowStyle}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
                Маркировка рекламы
              </div>
              <h1 style={pageTitleStyle}>Отчёты о рекламе (ОРД)</h1>
              <p style={pageSubStyle}>
                Маркировка рекламы по закону РФ — контрагенты, договоры, креативы и ERID
              </p>
            </div>
            {headerCta && (
              <button
                className="ord-primary"
                style={primaryBtn}
                onClick={headerCta.action}
                disabled={headerCta.disabled}
                title={headerCta.disabled ? 'Сначала добавьте контрагентов' : ''}
              >
                <PlusIcon />
                {headerCta.label}
              </button>
            )}
          </div>
        </section>

        <div role="tablist" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: 5, borderRadius: 999,
          background: '#fff', border: `1px solid ${BORDER}`,
          marginBottom: 22, flexWrap: 'wrap',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          maxWidth: '100%', overflow: 'hidden',
        }}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                data-tour-page={t.key === 'settings' ? 'settings-tab' : undefined}
                className={`ord-tab${active ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {tabCounts[t.key] != null && (
                  <span className="ord-tab-count">{tabCounts[t.key]}</span>
                )}
              </button>
            );
          })}
        </div>

        {tab === 'settings' && (
          <section style={{ animation: 'dashFadeUp 0.4s ease 0.05s both' }}>
            <div style={sectionHeaderRow}>
              <div>
                <h2 style={sectionTitleStyle}>API-токен VK ORD</h2>
                <p style={sectionSubStyle}>Подключение к личному кабинету ord.vk.com</p>
              </div>
            </div>

            <div style={{ ...cardBase, padding: 22, maxWidth: 620 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <GradientAvatar from={ACCENT} to={ACCENT2}>
                  <KeyIcon size={26} />
                </GradientAvatar>
                <div>
                  <div style={{ fontSize: '0.98rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>
                    VK ORD API
                  </div>
                  <div style={{ fontSize: '0.76rem', color: MUTED, marginTop: 2 }}>
                    Получите токен в личном кабинете → раздел «API»
                  </div>
                </div>
                {settings && settings.api_token && (
                  <span style={{
                    ...pill('rgba(16,185,129,0.10)', SUCCESS),
                    marginLeft: 'auto',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                    Подключено
                  </span>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>API-токен</label>
                <input
                  className="ord-input"
                  style={inputStyle}
                  type="password"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder="Вставьте токен из ord.vk.com"
                />
                <div style={hintStyle}>
                  Перейдите на <span style={{ color: ACCENT, fontWeight: 600 }}>ord.vk.com</span> → API → создайте токен и скопируйте сюда
                </div>
              </div>

              <label className="ord-toggle-card" style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 14px', borderRadius: 12,
                border: `1px solid ${sandbox ? `${ACCENT}55` : BORDER}`,
                background: sandbox ? `${ACCENT}08` : '#fff',
                cursor: 'pointer', marginBottom: 18,
                transition: 'border-color .15s ease, background .15s ease',
              }}>
                <input
                  type="checkbox"
                  checked={sandbox}
                  onChange={e => setSandbox(e.target.checked)}
                  style={{ display: 'none' }}
                />
                <span style={{
                  flexShrink: 0,
                  width: 20, height: 20, borderRadius: 6,
                  border: `1.5px solid ${sandbox ? ACCENT : BORDER}`,
                  background: sandbox ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)` : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 1,
                  transition: 'all .15s ease',
                  boxShadow: sandbox ? `0 2px 6px ${ACCENT}40` : 'none',
                }}>
                  {sandbox && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: DARK, letterSpacing: '-0.005em' }}>
                    Тестовый режим (песочница)
                  </span>
                  <span style={{ display: 'block', fontSize: '0.76rem', color: MUTED, marginTop: 3, lineHeight: 1.45 }}>
                    Запросы пойдут на песочницу ОРД — данные не публикуются в Роскомнадзор
                  </span>
                </span>
              </label>

              <button
                className="ord-primary"
                style={{ ...primaryBtn, opacity: savingSettings || !tokenInput.trim() ? 0.6 : 1 }}
                onClick={saveSettings}
                disabled={savingSettings || !tokenInput.trim()}
              >
                {savingSettings ? 'Проверка…' : 'Сохранить и проверить'}
              </button>

              {settings && settings.api_token && (
                <div style={{
                  marginTop: 14,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(16,185,129,0.06)',
                  border: `1px solid ${SUCCESS}25`,
                  fontSize: '0.85rem',
                  color: DARK,
                  lineHeight: 1.5,
                }}>
                  API подключён · {settings.sandbox ? (
                    <span style={{ color: WARNING, fontWeight: 600 }}>песочница</span>
                  ) : (
                    <span style={{ color: SUCCESS, fontWeight: 600 }}>продакшен</span>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'persons' && (
          <section style={{ animation: 'dashFadeUp 0.4s ease 0.05s both' }}>
            <div style={sectionHeaderRow}>
              <div>
                <h2 style={sectionTitleStyle}>Контрагенты</h2>
                <p style={sectionSubStyle}>
                  {persons.length === 0 ? 'Заказчики, площадки и агентства' : `Всего: ${persons.length}`}
                </p>
              </div>
            </div>

            {loading ? <Loading /> : persons.length === 0 ? (
              <EmptyPersons onCreate={openCreatePerson} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {persons.map((p, i) => {
                  const meta = ROLE_META[p.role] || { label: p.role || '—', color: MUTED, soft: SOFT_BG };
                  return (
                    <div key={p.id} className="ord-card" style={{ ...cardBase, padding: 18, ...animStyle(i) }}>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <GradientAvatar from={ACCENT} to={ACCENT2}>
                          <BriefcaseIcon size={26} />
                        </GradientAvatar>

                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                              {p.name || '—'}
                            </span>
                            <span style={pill(meta.soft, meta.color)}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
                              {meta.label}
                            </span>
                            {p.person_type && (
                              <span style={pill(SOFT_BG, MUTED)}>
                                {p.person_type === 'juridical' ? 'Юр. лицо' : p.person_type === 'ip' ? 'ИП' : 'Физ. лицо'}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            {p.inn && (
                              <span
                                className="ord-code"
                                style={{ ...codeChipStyle, cursor: 'pointer' }}
                                onClick={() => copyToClipboard(p.inn, 'ИНН скопирован')}
                                title="Скопировать ИНН"
                              >
                                ИНН · {p.inn}
                              </span>
                            )}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: MUTED }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                              ID · {p.external_id}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'contracts' && (
          <section style={{ animation: 'dashFadeUp 0.4s ease 0.05s both' }}>
            <div style={sectionHeaderRow}>
              <div>
                <h2 style={sectionTitleStyle}>Договоры</h2>
                <p style={sectionSubStyle}>
                  {contracts.length === 0 ? 'Связи между заказчиком и исполнителем' : `Всего: ${contracts.length}`}
                </p>
              </div>
            </div>

            {loading ? <Loading /> : contracts.length === 0 ? (
              <EmptyContracts onCreate={openCreateContract} blocked={persons.length < 2} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {contracts.map((c, i) => {
                  const client = personByExtId(c.client_external_id);
                  const contractor = personByExtId(c.contractor_external_id);
                  return (
                    <div key={c.id} className="ord-card" style={{ ...cardBase, padding: 18, ...animStyle(i) }}>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <GradientAvatar from={WARNING} to="#f97316">
                          <DocumentIcon size={26} />
                        </GradientAvatar>

                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                              {c.serial || c.external_id}
                            </span>
                            <span style={pill('rgba(16,185,129,0.10)', SUCCESS)}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                              Активен
                            </span>
                            {c.amount && (
                              <span style={pill('rgba(67,97,238,0.10)', ACCENT)}>
                                {Number(c.amount).toLocaleString('ru-RU')} ₽
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                            <span style={pill(SOFT_BG, MUTED)}>
                              <span style={{ fontWeight: 700, color: ACCENT }}>{client?.name || c.client_external_id}</span>
                              <span style={{ color: MUTED, opacity: 0.65, margin: '0 4px' }}>→</span>
                              <span style={{ fontWeight: 700, color: ACCENT2 }}>{contractor?.name || c.contractor_external_id}</span>
                            </span>
                          </div>

                          <div style={{
                            display: 'flex', gap: 14, alignItems: 'center',
                            fontSize: '0.78rem', color: MUTED, flexWrap: 'wrap',
                          }}>
                            {c.date && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: WARNING }} />
                                {new Date(c.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                              ID · {c.external_id}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'creatives' && (
          <section style={{ animation: 'dashFadeUp 0.4s ease 0.05s both' }}>
            <div style={sectionHeaderRow}>
              <div>
                <h2 style={sectionTitleStyle}>Креативы и ERID</h2>
                <p style={sectionSubStyle}>
                  {creatives.length === 0 ? 'Рекламные материалы с ERID-токенами' : `Всего: ${creatives.length}`}
                </p>
              </div>
            </div>

            {loading ? <Loading /> : creatives.length === 0 ? (
              <EmptyCreatives onCreate={openCreateCreative} blocked={persons.length < 1} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {creatives.map((c, i) => (
                  <div key={c.id} className="ord-card" style={{ ...cardBase, padding: 18, ...animStyle(i) }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <GradientAvatar from={ACCENT2} to="#a855f7">
                        <MegaphoneIcon size={26} />
                      </GradientAvatar>

                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                            {c.name || c.external_id}
                          </span>
                          <span style={pill('rgba(123,104,238,0.10)', ACCENT2)}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT2 }} />
                            {FORM_LABELS[c.form] || c.form || 'Креатив'}
                          </span>
                          {c.brand && (
                            <span style={pill(SOFT_BG, MUTED)}>{c.brand}</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                          {c.erid ? (
                            <span
                              className="ord-erid"
                              style={eridPillStyle}
                              onClick={() => copyToClipboard(c.erid, 'ERID скопирован')}
                              title="Скопировать ERID"
                            >
                              ERID · {c.erid}
                              <CopyIcon size={11} />
                            </span>
                          ) : (
                            <span style={pill('rgba(245,158,11,0.10)', WARNING)}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: WARNING }} />
                              Ожидает токен
                            </span>
                          )}
                        </div>

                        <div style={{
                          display: 'flex', gap: 14, alignItems: 'center',
                          fontSize: '0.78rem', color: MUTED, flexWrap: 'wrap',
                        }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                            ID · {c.external_id}
                          </span>
                          {c.contract_external_id && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: WARNING }} />
                              Договор · {c.contract_external_id}
                            </span>
                          )}
                          {c.created_at && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                              {new Date(c.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'stats' && (
          <section style={{ animation: 'dashFadeUp 0.4s ease 0.05s both' }}>
            <div style={sectionHeaderRow}>
              <div>
                <h2 style={sectionTitleStyle}>Промаркированные посты</h2>
                <p style={sectionSubStyle}>
                  Отправляйте статистику показов до 30 числа следующего месяца
                </p>
              </div>
            </div>

            {markedPosts.length === 0 ? (
              <EmptyMarkedPosts />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {markedPosts.map((p, i) => {
                  const meta = POST_TYPE_META[p.post_type] || POST_TYPE_META.pin;
                  return (
                    <div key={i} className="ord-card" style={{ ...cardBase, padding: 18, ...animStyle(i) }}>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <GradientAvatar from={meta.color} to={ACCENT2}>
                          <ChartIcon size={24} />
                        </GradientAvatar>

                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                              {p.title || 'Без названия'}
                            </span>
                            <span style={pill(meta.soft, meta.color)}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
                              {meta.label}
                            </span>
                            {p.status && (
                              <span style={pill(SOFT_BG, MUTED)}>{p.status}</span>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                            {p.erid && (
                              <span
                                className="ord-erid"
                                style={eridPillStyle}
                                onClick={() => copyToClipboard(p.erid, 'ERID скопирован')}
                                title="Скопировать ERID"
                              >
                                ERID · {p.erid}
                                <CopyIcon size={11} />
                              </span>
                            )}
                          </div>

                          <div style={{
                            display: 'flex', gap: 14, alignItems: 'center',
                            fontSize: '0.78rem', color: MUTED, flexWrap: 'wrap',
                          }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT2, boxShadow: `0 0 6px ${ACCENT2}80` }} />
                              Просмотры
                              <b style={{ color: DARK, fontWeight: 800, marginLeft: 2, letterSpacing: '-0.02em' }}>
                                {(p.views_count || 0).toLocaleString('ru-RU')}
                              </b>
                            </span>
                            {p.published_at && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                                {new Date(p.published_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={sectionHeaderRow}>
              <div>
                <h2 style={sectionTitleStyle}>Отправить статистику вручную</h2>
                <p style={sectionSubStyle}>Передача показов в ОРД для конкретного креатива</p>
              </div>
            </div>

            <div style={{ ...cardBase, padding: 22, maxWidth: 620 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Креатив</label>
                  <select
                    className="ord-input"
                    style={inputStyle}
                    value={statsForm.creative_external_id}
                    onChange={e => setStatsForm(f => ({ ...f, creative_external_id: e.target.value }))}
                  >
                    <option value="">— Выберите —</option>
                    {creatives.map(c => (
                      <option key={c.external_id} value={c.external_id}>
                        {c.name || c.external_id}{c.erid ? ` — ${c.erid}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>ID площадки</label>
                  <input
                    className="ord-input" style={inputStyle}
                    value={statsForm.pad_external_id}
                    onChange={e => setStatsForm(f => ({ ...f, pad_external_id: e.target.value }))}
                    placeholder="pad-telegram-channel"
                  />
                  <div style={hintStyle}>Идентификатор канала/паблика, где вышла реклама</div>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label style={labelStyle}>Начало периода</label>
                    <input
                      className="ord-input" style={inputStyle} type="date"
                      value={statsForm.date_start}
                      onChange={e => setStatsForm(f => ({ ...f, date_start: e.target.value }))}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label style={labelStyle}>Конец периода</label>
                    <input
                      className="ord-input" style={inputStyle} type="date"
                      value={statsForm.date_end}
                      onChange={e => setStatsForm(f => ({ ...f, date_end: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Количество показов</label>
                  <input
                    className="ord-input" style={inputStyle} type="number"
                    value={statsForm.shows_count}
                    onChange={e => setStatsForm(f => ({ ...f, shows_count: e.target.value }))}
                    placeholder="15000"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    className="ord-primary"
                    style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
                    onClick={sendStats}
                    disabled={saving || !statsForm.creative_external_id}
                  >
                    {saving ? 'Отправка…' : 'Отправить в ОРД'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        <Modal isOpen={showPersonModal} onClose={() => setShowPersonModal(false)} title="Добавить контрагента">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>ID (ваш уникальный идентификатор) *</label>
              <input
                className="ord-input" style={inputStyle}
                value={personForm.external_id}
                onChange={e => setPersonForm(f => ({ ...f, external_id: e.target.value }))}
                placeholder="advertiser-roga-kopyta"
              />
              <div style={hintStyle}>Латиница, цифры, дефис. Используется для связи с договорами.</div>
            </div>

            <div>
              <label style={labelStyle}>Название организации *</label>
              <input
                className="ord-input" style={inputStyle}
                value={personForm.name}
                onChange={e => setPersonForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ООО Рога и Копыта"
              />
            </div>

            <div>
              <label style={labelStyle}>ИНН *</label>
              <input
                className="ord-input" style={{ ...inputStyle, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}
                value={personForm.inn}
                onChange={e => setPersonForm(f => ({ ...f, inn: e.target.value }))}
                placeholder="7707049388"
              />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={labelStyle}>Роль</label>
                <select
                  className="ord-input" style={inputStyle}
                  value={personForm.role}
                  onChange={e => setPersonForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="advertiser">Заказчик / Рекламодатель</option>
                  <option value="publisher">Издатель / Площадка</option>
                  <option value="agency">Агентство</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={labelStyle}>Тип лица</label>
                <select
                  className="ord-input" style={inputStyle}
                  value={personForm.person_type}
                  onChange={e => setPersonForm(f => ({ ...f, person_type: e.target.value }))}
                >
                  <option value="juridical">Юридическое лицо</option>
                  <option value="ip">ИП</option>
                  <option value="physical">Физическое лицо</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="ord-ghost" style={ghostBtn} onClick={() => setShowPersonModal(false)}>Отмена</button>
              <button
                className="ord-primary"
                style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
                onClick={savePerson}
                disabled={saving}
              >
                {saving ? 'Создание…' : 'Создать в ОРД'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={showContractModal} onClose={() => setShowContractModal(false)} title="Создать договор">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>ID договора *</label>
              <input
                className="ord-input" style={inputStyle}
                value={contractForm.external_id}
                onChange={e => setContractForm(f => ({ ...f, external_id: e.target.value }))}
                placeholder="contract-2024-001"
              />
              <div style={hintStyle}>Уникальный идентификатор для связи с креативами</div>
            </div>

            <div>
              <label style={labelStyle}>Заказчик *</label>
              <select
                className="ord-input" style={inputStyle}
                value={contractForm.client_external_id}
                onChange={e => setContractForm(f => ({ ...f, client_external_id: e.target.value }))}
              >
                <option value="">— Выберите —</option>
                {persons.map(p => (
                  <option key={p.external_id} value={p.external_id}>
                    {p.name} ({ROLE_META[p.role]?.label || p.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Исполнитель *</label>
              <select
                className="ord-input" style={inputStyle}
                value={contractForm.contractor_external_id}
                onChange={e => setContractForm(f => ({ ...f, contractor_external_id: e.target.value }))}
              >
                <option value="">— Выберите —</option>
                {persons.map(p => (
                  <option key={p.external_id} value={p.external_id}>
                    {p.name} ({ROLE_META[p.role]?.label || p.role})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={labelStyle}>Дата договора</label>
                <input
                  className="ord-input" style={inputStyle} type="date"
                  value={contractForm.date}
                  onChange={e => setContractForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={labelStyle}>Номер договора</label>
                <input
                  className="ord-input" style={inputStyle}
                  value={contractForm.serial}
                  onChange={e => setContractForm(f => ({ ...f, serial: e.target.value }))}
                  placeholder="РК-001/2024"
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Сумма (руб.)</label>
              <input
                className="ord-input" style={inputStyle} type="number"
                value={contractForm.amount}
                onChange={e => setContractForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="100000"
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="ord-ghost" style={ghostBtn} onClick={() => setShowContractModal(false)}>Отмена</button>
              <button
                className="ord-primary"
                style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
                onClick={saveContract}
                disabled={saving}
              >
                {saving ? 'Создание…' : 'Создать в ОРД'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={showCreativeModal} onClose={() => setShowCreativeModal(false)} title="Получить ERID-токен">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>ID креатива *</label>
              <input
                className="ord-input" style={inputStyle}
                value={creativeForm.external_id}
                onChange={e => setCreativeForm(f => ({ ...f, external_id: e.target.value }))}
                placeholder="creative-post-001"
              />
            </div>

            <label className="ord-toggle-card" style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 14px', borderRadius: 12,
              border: `1px solid ${creativeForm.self_promo ? `${ACCENT}55` : BORDER}`,
              background: creativeForm.self_promo ? `${ACCENT}08` : '#fff',
              cursor: 'pointer',
              transition: 'border-color .15s ease, background .15s ease',
            }}>
              <input
                type="checkbox"
                checked={creativeForm.self_promo}
                onChange={e => setCreativeForm(f => ({ ...f, self_promo: e.target.checked }))}
                style={{ display: 'none' }}
              />
              <span style={{
                flexShrink: 0,
                width: 20, height: 20, borderRadius: 6,
                border: `1.5px solid ${creativeForm.self_promo ? ACCENT : BORDER}`,
                background: creativeForm.self_promo ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)` : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
                transition: 'all .15s ease',
                boxShadow: creativeForm.self_promo ? `0 2px 6px ${ACCENT}40` : 'none',
              }}>
                {creativeForm.self_promo && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: DARK, letterSpacing: '-0.005em' }}>
                  Самореклама (без договора)
                </span>
                <span style={{ display: 'block', fontSize: '0.76rem', color: MUTED, marginTop: 3, lineHeight: 1.45 }}>
                  Для рекламы собственных продуктов. Привязка только к контрагенту-саморекламодателю.
                </span>
              </span>
            </label>

            {creativeForm.self_promo ? (
              <div>
                <label style={labelStyle}>Контрагент (саморекламодатель) *</label>
                <select
                  className="ord-input" style={inputStyle}
                  value={creativeForm.person_external_id}
                  onChange={e => setCreativeForm(f => ({ ...f, person_external_id: e.target.value }))}
                >
                  <option value="">— Выберите —</option>
                  {persons.map(p => (
                    <option key={p.external_id} value={p.external_id}>{p.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Договор *</label>
                <select
                  className="ord-input" style={inputStyle}
                  value={creativeForm.contract_external_id}
                  onChange={e => setCreativeForm(f => ({ ...f, contract_external_id: e.target.value }))}
                >
                  <option value="">— Выберите —</option>
                  {contracts.map(c => (
                    <option key={c.external_id} value={c.external_id}>
                      {c.serial || c.external_id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={labelStyle}>Формат</label>
                <select
                  className="ord-input" style={inputStyle}
                  value={creativeForm.form}
                  onChange={e => setCreativeForm(f => ({ ...f, form: e.target.value }))}
                >
                  <option value="text_block">Текст</option>
                  <option value="text_graphic_block">Текст + изображение</option>
                  <option value="banner">Баннер (изображение)</option>
                  <option value="video">Видео</option>
                  <option value="text_video_block">Текст + видео</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={labelStyle}>Бренд</label>
                <input
                  className="ord-input" style={inputStyle}
                  value={creativeForm.brand}
                  onChange={e => setCreativeForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder="Название бренда"
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Название креатива</label>
              <input
                className="ord-input" style={inputStyle}
                value={creativeForm.name}
                onChange={e => setCreativeForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Весенняя акция"
              />
            </div>

            <div>
              <label style={labelStyle}>Текст рекламы</label>
              <textarea
                className="ord-input"
                style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 90 }}
                rows={4}
                value={creativeForm.texts}
                onChange={e => setCreativeForm(f => ({ ...f, texts: e.target.value }))}
                placeholder="Купите наш товар со скидкой 50%!"
              />
              <div style={hintStyle}>Каждая строка — отдельный текст</div>
            </div>

            <div>
              <label style={labelStyle}>Ссылки</label>
              <textarea
                className="ord-input"
                style={{ ...inputStyle, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', resize: 'vertical', minHeight: 60 }}
                rows={2}
                value={creativeForm.target_urls}
                onChange={e => setCreativeForm(f => ({ ...f, target_urls: e.target.value }))}
                placeholder="https://shop.example.com"
              />
              <div style={hintStyle}>Каждая строка — отдельная ссылка</div>
            </div>

            <div>
              <label style={labelStyle}>Коды ККТУ</label>
              <input
                className="ord-input"
                style={{ ...inputStyle, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}
                value={creativeForm.kktus}
                onChange={e => setCreativeForm(f => ({ ...f, kktus: e.target.value }))}
                placeholder="1.1.1"
              />
              <div style={hintStyle}>Коды товаров/услуг через запятую. По умолчанию 1.1.1 — общая категория.</div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="ord-ghost" style={ghostBtn} onClick={() => setShowCreativeModal(false)}>Отмена</button>
              <button
                className="ord-primary"
                style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
                onClick={saveCreative}
                disabled={saving}
              >
                {saving ? 'Получение ERID…' : 'Получить ERID'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Paywall>
  );
}
