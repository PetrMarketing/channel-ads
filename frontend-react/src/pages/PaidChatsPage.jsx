import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import AttachmentPicker from '../components/AttachmentPicker';
import { api } from '../services/api';
import Paywall from '../components/Paywall';
import { usePageOnboarding } from '../components/OnboardingTour';

import { EVENT_LABELS } from './paid-chats/constants';
import PaymentTab from './paid-chats/PaymentTab';
import PlansTab from './paid-chats/PlansTab';
import ChatsTab from './paid-chats/ChatsTab';
import MembersTab from './paid-chats/MembersTab';
import NotificationsTab from './paid-chats/NotificationsTab';
import PublishTab from './paid-chats/PublishTab';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
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

const pill = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '3px 10px', borderRadius: 20,
  fontSize: '0.7rem', fontWeight: 600,
  background: bg, color,
  whiteSpace: 'nowrap',
});

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
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

function PlusIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function LockCoinIcon({ size = 54, color = '#fff', strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx="12" cy="16" r="1.6" fill={color} stroke="none" />
      <path d="M12 17.6v1.4" />
    </svg>
  );
}

function EmptyPaidChats({ tabLabel, onCreate, ctaLabel }) {
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
          background: `radial-gradient(circle, ${ACCENT}30 0%, transparent 70%)`,
          animation: 'dashPulse 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 14px 36px ${ACCENT}45`,
          animation: 'heroBlobFloat 5s ease-in-out infinite',
        }}>
          <LockCoinIcon size={52} strokeWidth={1.7} />
        </div>
        <div style={{
          position: 'absolute', right: -4, bottom: -4,
          width: 36, height: 36, borderRadius: '50%',
          background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.02em',
          boxShadow: `0 4px 12px ${SUCCESS}55`,
          border: '3px solid #fff',
        }}>₽</div>
      </div>

      <h3 style={{
        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em',
        color: DARK, margin: '0 0 8px',
      }}>
        Платные чаты ещё не настроены
      </h3>
      <p style={{
        fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px',
        maxWidth: 460, lineHeight: 1.55,
      }}>
        Подключите эквайринг, создайте тариф и привяжите чат — бот будет автоматически добавлять подписчиков по факту оплаты.
        {tabLabel && <> Раздел «{tabLabel}» откроется после прохождения предыдущих шагов.</>}
      </p>

      {onCreate && (
        <button className="pcp-primary" style={primaryBtn} onClick={onCreate}>
          <PlusIcon />
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

export default function PaidChatsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;

  const { overlay: pageTour } = usePageOnboarding('paid-chats', [
    { selector: '[data-tour-page="payment-tab"]', title: 'Подключение оплаты', text: 'Сначала добавьте платёжную систему: Tinkoff, YooKassa, Prodamus или Robokassa.', placement: 'bottom' },
    { selector: '[data-tour-page="plans-tab"]', title: 'Создание тарифа', text: 'Цена, срок, описание подписки. Затем привяжите к чату MAX.', placement: 'bottom' },
  ]);

  const [tab, setTab] = useState('payment');
  const [loading, setLoading] = useState(true);

  const [setup, setSetup] = useState({ has_payment: false, has_plans: false, has_chats: false, has_notifs: false });

  const [paymentSettings, setPaymentSettings] = useState([]);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerCreds, setProviderCreds] = useState({});
  const [savingProvider, setSavingProvider] = useState(false);

  const [plans, setPlans] = useState([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({ plan_type: 'recurring', duration_days: 30, price: '', title: '', description: '', offer_code: '' });
  const [savingPlan, setSavingPlan] = useState(false);

  const [chats, setChats] = useState([]);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatForm, setChatForm] = useState({ chat_id: '', title: '', username: '', join_link: '' });
  const [availableChats, setAvailableChats] = useState([]);
  const [savingChat, setSavingChat] = useState(false);

  const [members, setMembers] = useState([]);
  const [memberChatFilter, setMemberChatFilter] = useState('');
  const [memberStatusFilter, setMemberStatusFilter] = useState('');

  const [notifications, setNotifications] = useState([]);
  const [notifForms, setNotifForms] = useState({});
  const [notifFiles, setNotifFiles] = useState({});
  const [savingNotif, setSavingNotif] = useState('');
  const [editingNotifType, setEditingNotifType] = useState(null);

  const [posts, setPosts] = useState([]);
  const [showPostModal, setShowPostModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [postForm, setPostForm] = useState({ title: '', message_text: '', button_text: 'Подробнее', chat_id: '' });
  const [postFile, setPostFile] = useState(null);
  const [postAttachType, setPostAttachType] = useState('');
  const [savingPost, setSavingPost] = useState(false);
  const [publishingPostId, setPublishingPostId] = useState(null);

  const loadSetup = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/paid-chats/${tc}/setup-status`);
      if (data.success) setSetup(data);
    } catch {}
  }, [tc]);

  const loadPaymentSettings = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/paid-chats/${tc}/payment-settings`);
      if (data.success) setPaymentSettings(data.settings || []);
    } catch {}
  }, [tc]);

  const loadPlans = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/paid-chats/${tc}/plans`);
      if (data.success) setPlans(data.plans || []);
    } catch {}
  }, [tc]);

  const loadChats = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/paid-chats/${tc}/chats`);
      if (data.success) setChats(data.chats || []);
    } catch {}
  }, [tc]);

  const loadMembers = useCallback(async () => {
    if (!tc) return;
    try {
      let url = `/paid-chats/${tc}/members`;
      const qp = [];
      if (memberChatFilter) qp.push(`chat_id=${memberChatFilter}`);
      if (memberStatusFilter) qp.push(`status=${memberStatusFilter}`);
      if (qp.length) url += '?' + qp.join('&');
      const data = await api.get(url);
      if (data.success) setMembers(data.members || []);
    } catch {}
  }, [tc, memberChatFilter, memberStatusFilter]);

  const loadNotifications = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/paid-chats/${tc}/notifications`);
      if (data.success) {
        setNotifications(data.notifications || []);
        const forms = {};
        (data.notifications || []).forEach(n => { forms[n.event_type] = { message_text: n.message_text, is_active: n.is_active, file_path: n.file_path, file_type: n.file_type }; });
        setNotifForms(forms);
      }
    } catch {}
  }, [tc]);

  const loadPosts = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/paid-chats/${tc}/posts`);
      if (data.success) setPosts(data.posts || []);
    } catch {}
  }, [tc]);

  useEffect(() => {
    if (!tc) return;
    setLoading(true);
    Promise.all([loadSetup(), loadPaymentSettings(), loadPlans(), loadChats(), loadNotifications(), loadPosts()])
      .finally(() => setLoading(false));
  }, [tc, loadSetup, loadPaymentSettings, loadPlans, loadChats, loadNotifications, loadPosts]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const openProviderModal = (provider) => {
    setSelectedProvider(provider);
    const existing = paymentSettings.find(s => s.provider === provider.id);
    setProviderCreds({});
    setShowProviderModal(true);
  };

  const saveProvider = async () => {
    if (!selectedProvider) return;
    setSavingProvider(true);
    try {
      const data = await api.post(`/paid-chats/${tc}/payment-settings`, {
        provider: selectedProvider.id,
        credentials: providerCreds,
        is_active: 1,
      });
      if (data.success) {
        if (data.test?.test_payment_url) {
          const goTest = window.confirm(
            `${selectedProvider.name} подключён!\n\nСоздан тестовый платёж на 10 ₽ для проверки.\nОткрыть страницу тестового платежа?`
          );
          if (goTest) window.open(data.test.test_payment_url, '_blank');
        } else if (data.test?.message) {
          showToast(data.test.message, data.test.success ? 'success' : 'error');
        } else {
          showToast(`${selectedProvider.name} подключён`);
        }
        setShowProviderModal(false);
        loadPaymentSettings();
        loadSetup();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSavingProvider(false);
    }
  };

  const disconnectProvider = async (setting) => {
    if (!window.confirm('Отключить платёжную систему?')) return;
    try {
      await api.delete(`/paid-chats/${tc}/payment-settings/${setting.id}`);
      showToast('Платёжная система отключена');
      loadPaymentSettings();
      loadSetup();
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    }
  };

  const hasGetcourse = paymentSettings.some(s => s.provider === 'getcourse');

  const openPlanCreate = () => {
    setEditingPlan(null);
    setPlanForm({ plan_type: 'recurring', duration_days: 30, price: '', title: '', description: '', offer_code: '' });
    setShowPlanModal(true);
  };

  const openPlanEdit = (plan) => {
    setEditingPlan(plan);
    setPlanForm({
      plan_type: plan.plan_type,
      duration_days: plan.duration_days,
      price: plan.price,
      title: plan.title || '',
      description: plan.description || '',
      offer_code: plan.offer_code || '',
    });
    setShowPlanModal(true);
  };

  const savePlan = async () => {
    if (!planForm.price || Number(planForm.price) <= 0) {
      showToast('Укажите цену', 'error');
      return;
    }
    setSavingPlan(true);
    try {
      const payload = { ...planForm, price: Number(planForm.price), duration_days: Number(planForm.duration_days) };
      let data;
      if (editingPlan) {
        data = await api.put(`/paid-chats/${tc}/plans/${editingPlan.id}`, payload);
      } else {
        data = await api.post(`/paid-chats/${tc}/plans`, payload);
      }
      if (data.success) {
        showToast(editingPlan ? 'План обновлён' : 'План создан');
        setShowPlanModal(false);
        loadPlans();
        loadSetup();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSavingPlan(false);
    }
  };

  const deletePlan = async (plan) => {
    if (!window.confirm('Удалить план?')) return;
    try {
      await api.delete(`/paid-chats/${tc}/plans/${plan.id}`);
      showToast('План удалён');
      loadPlans();
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    }
  };

  const saveChat = async () => {
    if (!chatForm.chat_id.trim()) {
      showToast('Укажите ID чата', 'error');
      return;
    }
    setSavingChat(true);
    try {
      const data = await api.post(`/paid-chats/${tc}/chats`, chatForm);
      if (data.success) {
        showToast('Чат добавлен');
        setShowChatModal(false);
        setChatForm({ chat_id: '', title: '', username: '', join_link: '' });
        loadChats();
        loadSetup();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSavingChat(false);
    }
  };

  const deleteChat = async (chat) => {
    if (!window.confirm('Удалить чат?')) return;
    try {
      await api.delete(`/paid-chats/${tc}/chats/${chat.id}`);
      showToast('Чат удалён');
      loadChats();
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    }
  };

  const saveNotification = async (eventType) => {
    const form = notifForms[eventType];
    if (!form) return;
    setSavingNotif(eventType);
    try {
      let data;
      const file = notifFiles[eventType];
      if (file) {
        const formData = new FormData();
        formData.append('event_type', eventType);
        formData.append('message_text', form.message_text || '');
        formData.append('is_active', form.is_active ?? 1);
        formData.append('file', file);
        data = await api.upload(`/paid-chats/${tc}/notifications-upload`, formData);
      } else {
        data = await api.post(`/paid-chats/${tc}/notifications`, {
          event_type: eventType,
          message_text: form.message_text || '',
          is_active: form.is_active ?? 1,
        });
      }
      if (data.success) {
        showToast('Уведомление сохранено');
        setNotifFiles(prev => ({ ...prev, [eventType]: null }));
        loadNotifications();
        loadSetup();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSavingNotif('');
    }
  };

  const openPostCreate = () => {
    setEditingPost(null);
    setPostForm({ title: '', message_text: '', button_text: 'Подробнее', chat_id: '' });
    setPostFile(null);
    setPostAttachType('');
    setShowPostModal(true);
  };

  const openPostEdit = (post) => {
    setEditingPost(post);
    setPostForm({
      title: post.title || '',
      message_text: post.message_text || '',
      button_text: post.button_text || 'Подробнее',
      chat_id: post.chat_id ? String(post.chat_id) : '',
    });
    setPostFile(null);
    setPostAttachType(post.attach_type || '');
    setShowPostModal(true);
  };

  const savePost = async () => {
    if (!postForm.message_text.trim()) {
      showToast('Введите текст поста', 'error');
      return;
    }
    setSavingPost(true);
    try {
      let data;
      if (postFile) {
        const formData = new FormData();
        formData.append('title', postForm.title);
        formData.append('message_text', postForm.message_text);
        formData.append('button_text', postForm.button_text || 'Подробнее');
        if (postForm.chat_id) formData.append('chat_id', postForm.chat_id);
        if (postAttachType) formData.append('attach_type', postAttachType);
        formData.append('file', postFile);
        if (editingPost) {
          data = await api.upload(`/paid-chats/${tc}/posts-upload/${editingPost.id}`, formData, 'PUT');
        } else {
          data = await api.upload(`/paid-chats/${tc}/posts-upload`, formData);
        }
      } else {
        const payload = { ...postForm, chat_id: postForm.chat_id ? Number(postForm.chat_id) : null };
        if (editingPost) {
          data = await api.put(`/paid-chats/${tc}/posts/${editingPost.id}`, payload);
        } else {
          data = await api.post(`/paid-chats/${tc}/posts`, payload);
        }
      }
      if (data.success) {
        showToast(editingPost ? 'Пост обновлён' : 'Пост создан');
        setShowPostModal(false);
        loadPosts();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSavingPost(false);
    }
  };

  const deletePost = async (post) => {
    if (!window.confirm('Удалить пост?')) return;
    try {
      await api.delete(`/paid-chats/${tc}/posts/${post.id}`);
      showToast('Пост удалён');
      loadPosts();
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    }
  };

  const publishPost = async (post) => {
    if (!window.confirm('Опубликовать пост в канал?')) return;
    setPublishingPostId(post.id);
    try {
      const data = await api.post(`/paid-chats/${tc}/posts/${post.id}/publish`);
      if (data.success) {
        showToast('Пост опубликован в канал');
        loadPosts();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка публикации', 'error');
    } finally {
      setPublishingPostId(null);
    }
  };

  if (loading) return <Paywall><Loading /></Paywall>;

  const isTabLocked = (t) => {
    if (t === 'payment') return false;
    if (t === 'plans') return !setup.has_payment;
    if (t === 'publish') return !setup.has_payment || !setup.has_plans || !setup.has_chats;
    if (t === 'chats' || t === 'members' || t === 'notifications') return !setup.has_payment;
    return false;
  };

  const tabs = [
    { id: 'payment', label: 'Оплата', count: paymentSettings.length || null },
    { id: 'plans', label: 'Тарифы', count: plans.length || null },
    { id: 'chats', label: 'Чаты', count: chats.length || null },
    { id: 'members', label: 'Участники', count: members.length || null },
    { id: 'notifications', label: 'Уведомления', count: null },
    { id: 'publish', label: 'Публикация', count: posts.length || null },
  ];

  const headerCta = (() => {
    switch (tab) {
      case 'payment':       return null;
      case 'plans':         return { label: 'Создать тариф',     action: openPlanCreate,                                     disabled: !setup.has_payment };
      case 'chats':         return { label: 'Добавить чат',      action: async () => {
        try { const data = await api.get(`/paid-chats/${tc}/available-chats`); if (data.success) setAvailableChats(data.chats || []); } catch {}
        setShowChatModal(true);
      }, disabled: !setup.has_payment };
      case 'publish':       return { label: 'Создать пост',      action: openPostCreate, disabled: !setup.has_payment || !setup.has_plans || !setup.has_chats };
      default:              return null;
    }
  })();

  const renderActiveTab = () => {
    if (tab === 'payment') {
      return (
        <PaymentTab
          paymentSettings={paymentSettings}
          openProviderModal={openProviderModal}
          disconnectProvider={disconnectProvider}
          currentChannel={currentChannel}
          onChannelUpdate={() => {}}
        />
      );
    }
    if (tab === 'plans') {
      if (!setup.has_payment) {
        return <EmptyPaidChats tabLabel="Тарифы" ctaLabel="Создать платный чат" />;
      }
      return (
        <PlansTab
          setup={setup}
          plans={plans}
          openPlanCreate={openPlanCreate}
          openPlanEdit={openPlanEdit}
          deletePlan={deletePlan}
        />
      );
    }
    if (tab === 'chats') {
      if (!setup.has_payment) {
        return <EmptyPaidChats tabLabel="Чаты" ctaLabel="Создать платный чат" />;
      }
      return (
        <ChatsTab
          chats={chats}
          deleteChat={deleteChat}
          onAddChat={async () => {
            try {
              const data = await api.get(`/paid-chats/${tc}/available-chats`);
              if (data.success) setAvailableChats(data.chats || []);
            } catch {}
            setShowChatModal(true);
          }}
        />
      );
    }
    if (tab === 'members') {
      if (!setup.has_payment) {
        return <EmptyPaidChats tabLabel="Участники" ctaLabel="Создать платный чат" />;
      }
      return (
        <MembersTab
          members={members}
          chats={chats}
          memberChatFilter={memberChatFilter}
          setMemberChatFilter={setMemberChatFilter}
          memberStatusFilter={memberStatusFilter}
          setMemberStatusFilter={setMemberStatusFilter}
          tc={tc}
          onReload={loadMembers}
        />
      );
    }
    if (tab === 'notifications') {
      if (!setup.has_payment) {
        return <EmptyPaidChats tabLabel="Уведомления" ctaLabel="Создать платный чат" />;
      }
      return (
        <NotificationsTab
          notifForms={notifForms}
          setEditingNotifType={setEditingNotifType}
        />
      );
    }
    if (tab === 'publish') {
      if (isTabLocked('publish')) {
        return <EmptyPaidChats tabLabel="Публикация" ctaLabel="Создать платный чат" />;
      }
      return (
        <PublishTab
          posts={posts}
          openPostCreate={openPostCreate}
          openPostEdit={openPostEdit}
          deletePost={deletePost}
          publishPost={publishPost}
          publishingPostId={publishingPostId}
        />
      );
    }
    return null;
  };

  const isMax = currentChannel?.platform === 'max';
  const botLink = isMax
    ? `https://max.ru/${import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot'}?start=paid_${tc}`
    : `https://t.me/${import.meta.env.VITE_TG_BOT_USERNAME || 'PKAds_bot'}?start=paid_${tc}`;
  const allReady = setup.has_payment && setup.has_plans && setup.has_chats;
  const hasLegal = currentChannel?.privacy_policy_url && currentChannel?.offer_url;

  return (
    <Paywall>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .pcp-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .pcp-primary[disabled] {
          opacity: 0.55; cursor: not-allowed; transform: none !important; box-shadow: 0 2px 8px ${ACCENT}25 !important;
        }
        .pcp-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .pcp-tab {
          flex: 0 0 auto;
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 18px; border-radius: 10px; cursor: pointer;
          background: transparent; border: none;
          color: ${DARK}; font-size: 0.88rem; font-weight: 600;
          letter-spacing: -0.005em;
          transition: all .15s ease;
          white-space: nowrap;
        }
        .pcp-tab:hover:not(.active):not(.locked) {
          background: rgba(67,97,238,0.06);
          color: ${ACCENT};
        }
        .pcp-tab.active {
          color: #fff;
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          box-shadow: 0 4px 14px ${ACCENT}40;
        }
        .pcp-tab.locked {
          color: ${MUTED};
          opacity: 0.55;
          cursor: not-allowed;
        }
        .pcp-tab-count {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
          font-size: 0.68rem; font-weight: 700; letter-spacing: -0.01em;
          background: rgba(67,97,238,0.10); color: ${ACCENT};
          transition: all .18s ease;
        }
        .pcp-tab.active .pcp-tab-count {
          background: rgba(255,255,255,0.22);
          color: #fff;
        }
        .pcp-step {
          flex: 1; min-width: 140px;
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-radius: 12px;
          background: #fff; border: 1px solid ${BORDER};
          font-size: 0.84rem; color: ${MUTED}; font-weight: 500;
          transition: all .18s ease;
        }
        .pcp-step.done {
          background: rgba(16,185,129,0.06);
          border-color: ${SUCCESS}30;
          color: ${DARK};
        }
        .pcp-step.current {
          background: rgba(67,97,238,0.06);
          border-color: ${ACCENT}45;
          color: ${DARK};
          box-shadow: 0 4px 12px ${ACCENT}1f;
        }
        .pcp-step-num {
          flex-shrink: 0;
          width: 24px; height: 24px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          background: ${SOFT_BG}; color: ${MUTED};
          font-size: 0.74rem; font-weight: 700; letter-spacing: -0.01em;
        }
        .pcp-step.done .pcp-step-num {
          background: linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%);
          color: #fff; box-shadow: 0 2px 6px ${SUCCESS}55;
        }
        .pcp-step.current .pcp-step-num {
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          color: #fff; box-shadow: 0 2px 6px ${ACCENT}55;
        }
        .pcp-link-card {
          background: #fff; border: 1px solid ${BORDER}; border-radius: 14px;
          padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .pcp-link-code {
          flex: 1; min-width: 0;
          font-family: ui-monospace, SF Mono, Menlo, monospace;
          font-size: 0.78rem;
          padding: 6px 12px; border-radius: 8px;
          background: ${SOFT_BG}; border: 1px solid ${BORDER};
          color: ${ACCENT}; cursor: pointer;
          word-break: break-all;
          transition: all .15s ease;
        }
        .pcp-link-code:hover {
          background: ${ACCENT}10; border-color: ${ACCENT}40;
        }
      `}</style>

      <div style={{ animation: 'dashFade 0.4s ease' }}>
        <section style={pageHeaderWrap}>
          <div style={pageHeaderBlur1} />
          <div style={pageHeaderBlur2} />
          <div style={pageHeaderRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={eyebrowStyle}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
                Монетизация
              </div>
              <h1 style={pageTitleStyle}>Платные чаты</h1>
              <p style={pageSubStyle}>
                Подписки за деньги на чат с автоматическим добавлением участников по факту оплаты
              </p>
            </div>
            {headerCta && (
              <button
                className="pcp-primary"
                style={primaryBtn}
                onClick={headerCta.action}
                disabled={headerCta.disabled}
                title={headerCta.disabled ? 'Сначала пройдите предыдущие шаги' : ''}
              >
                <PlusIcon />
                {headerCta.label}
              </button>
            )}
            {!headerCta && tab === 'payment' && (
              <button
                className="pcp-primary"
                style={primaryBtn}
                onClick={() => setTab('plans')}
                disabled={!setup.has_payment}
                title={!setup.has_payment ? 'Сначала подключите эквайринг' : ''}
              >
                <PlusIcon />
                Создать платный чат
              </button>
            )}
          </div>
        </section>

        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap',
          marginBottom: 22,
        }}>
          <div className={`pcp-step ${setup.has_payment ? 'done' : 'current'}`}>
            <span className="pcp-step-num">{setup.has_payment ? '✓' : '1'}</span>
            <span>Подключить эквайринг</span>
          </div>
          <div className={`pcp-step ${setup.has_plans ? 'done' : setup.has_payment ? 'current' : ''}`}>
            <span className="pcp-step-num">{setup.has_plans ? '✓' : '2'}</span>
            <span>Создать тариф</span>
          </div>
          <div className={`pcp-step ${setup.has_chats ? 'done' : setup.has_plans ? 'current' : ''}`}>
            <span className="pcp-step-num">{setup.has_chats ? '✓' : '3'}</span>
            <span>Добавить чат</span>
          </div>
          <div className={`pcp-step ${setup.has_notifs ? 'done' : setup.has_chats ? 'current' : ''}`}>
            <span className="pcp-step-num">{setup.has_notifs ? '✓' : '4'}</span>
            <span>Настроить уведомления</span>
          </div>
        </div>

        {allReady && !hasLegal && (
          <div style={{
            marginBottom: 16, padding: '12px 14px', borderRadius: 12,
            background: 'rgba(230,57,70,0.06)', border: `1px solid ${DANGER}30`,
          }}>
            <p style={{ color: DANGER, fontSize: '0.84rem', margin: 0, lineHeight: 1.5 }}>
              Для отображения публичной ссылки заполните «Политику конфиденциальности» и «Договор оферты» во вкладке «Оплата».
            </p>
          </div>
        )}

        {allReady && hasLegal && (
          <div className="pcp-link-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ ...pill('rgba(16,185,129,0.10)', SUCCESS) }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                Готово к продажам
              </span>
              <span style={{ fontSize: '0.82rem', color: DARK, fontWeight: 600 }}>Ссылка на бота</span>
              <code
                className="pcp-link-code"
                onClick={() => { navigator.clipboard.writeText(botLink); showToast('Ссылка скопирована'); }}
                title="Нажмите чтобы скопировать"
              >
                {botLink}
              </code>
              <button
                className="pcp-primary"
                style={{ ...primaryBtn, padding: '8px 16px', fontSize: '0.82rem' }}
                onClick={() => { navigator.clipboard.writeText(botLink); showToast('Ссылка скопирована'); }}
              >
                Копировать
              </button>
            </div>
          </div>
        )}

        <div style={{
          display: 'flex', gap: 8, padding: 6, background: SOFT_BG,
          borderRadius: 14, marginBottom: 24, overflowX: 'auto',
        }}>
          {tabs.map(t => {
            const active = tab === t.id;
            const locked = isTabLocked(t.id);
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                data-tour-page={t.id === 'payment' ? 'payment-tab' : t.id === 'plans' ? 'plans-tab' : undefined}
                className={`pcp-tab${active ? ' active' : ''}${locked ? ' locked' : ''}`}
                onClick={() => !locked && setTab(t.id)}
                disabled={locked}
              >
                {t.label}
                {t.count != null && (
                  <span className="pcp-tab-count">{t.count}</span>
                )}
                {locked && <span style={{ fontSize: '0.78rem', opacity: 0.7 }}>🔒</span>}
              </button>
            );
          })}
        </div>

        <div style={{ animation: 'dashFadeUp 0.4s ease 0.05s both' }}>
          {renderActiveTab()}
        </div>
      </div>

      <Modal isOpen={showProviderModal} onClose={() => setShowProviderModal(false)} title={selectedProvider ? `Подключить ${selectedProvider.name}` : 'Эквайринг'}>
        {selectedProvider && (
          <div className="modal-form">
            <div className="pc-info-box" style={{ marginBottom: 16 }}>
              Заполните данные из личного кабинета <b>{selectedProvider.name}</b>.
              Убедитесь, что указали корректные ключи для рабочего режима (не тестового).
            </div>

            {selectedProvider && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: `1px solid ${WARNING}30`, borderRadius: 10, fontSize: '0.82rem' }}>
                <strong>⚠️ Webhook URL для уведомлений об оплате:</strong>
                <p style={{ margin: '6px 0 4px', fontSize: '0.8rem', color: MUTED }}>
                  {selectedProvider.id === 'tinkoff' && 'Тинькофф: URL передаётся автоматически в каждом запросе. Дополнительно можно указать в ЛК → Магазины → Терминалы → Настроить:'}
                  {selectedProvider.id === 'yoomoney' && 'ЮKassa: ЛК → Интеграция → HTTP-уведомления, укажите URL:'}
                  {selectedProvider.id === 'prodamus' && 'Prodamus: Настройки платёжной страницы → URL для уведомлений:'}
                  {selectedProvider.id === 'robokassa' && 'Robokassa: ЛК → Мои магазины → Технические настройки → Result URL (POST):'}
                  {selectedProvider.id === 'getcourse' && 'GetCourse: Задачи → Процессы → создать процесс по «Заказам» → триггер «Заказ оплачен» → операция «Вызвать URL» (POST):'}
                </p>
                <code style={{ display: 'block', padding: '6px 8px', background: '#fff', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer', wordBreak: 'break-all' }}
                  onClick={() => {
                    const url = selectedProvider.id === 'getcourse'
                      ? `${window.location.origin}/api/paid-chat-pay/webhook/getcourse/${currentChannel?.tracking_code}`
                      : `${window.location.origin}/api/paid-chat-pay/webhook/${selectedProvider.id}`;
                    navigator.clipboard.writeText(url);
                    showToast('Скопировано');
                  }}
                  title="Нажмите для копирования">
                  {selectedProvider.id === 'getcourse'
                    ? `${window.location.origin}/api/paid-chat-pay/webhook/getcourse/${currentChannel?.tracking_code}`
                    : `${window.location.origin}/api/paid-chat-pay/webhook/${selectedProvider.id}`}
                </code>
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: MUTED, opacity: 0.8 }}>Нажмите на URL, чтобы скопировать</p>
              </div>
            )}
            {['tinkoff', 'prodamus'].includes(selectedProvider.id) && (
              <div style={{ marginBottom: 16, padding: '8px 14px', background: 'rgba(16,185,129,0.08)', border: `1px solid ${SUCCESS}30`, borderRadius: 10, fontSize: '0.8rem', color: SUCCESS }}>
                ✅ Webhook настроится автоматически при каждом платеже
              </div>
            )}

            {selectedProvider.fields.map(f => {
              const existing = paymentSettings.find(s => s.provider === selectedProvider.id);
              const masked = existing?.credentials?.[f.key];
              return (
                <div key={f.key} className="form-group">
                  <label className="form-label">{f.label} {masked && <span style={{ fontSize: '0.72rem', color: SUCCESS }}>(сохранено: {masked})</span>}</label>
                  <input
                    className="form-input"
                    type={f.key.includes('password') || f.key.includes('secret') ? 'password' : 'text'}
                    value={providerCreds[f.key] || ''}
                    onChange={e => setProviderCreds(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={masked ? 'Оставьте пустым, чтобы не менять' : f.label}
                  />
                </div>
              );
            })}
            <button className="btn btn-primary" onClick={saveProvider} disabled={savingProvider} style={{ marginTop: 12 }}>
              {savingProvider ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </Modal>

      <Modal isOpen={showPlanModal} onClose={() => setShowPlanModal(false)} title={editingPlan ? 'Редактировать тариф' : 'Новый тариф'}>
        <div className="modal-form">
          <div className="form-group">
            <label className="form-label">Название тарифа</label>
            <input
              className="form-input"
              type="text"
              value={planForm.title}
              onChange={e => setPlanForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Например: Месячная подписка"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Тип оплаты</label>
            <select
              className="form-input"
              value={planForm.plan_type}
              onChange={e => setPlanForm(f => ({ ...f, plan_type: e.target.value }))}
            >
              <option value="one_time">Разовая оплата</option>
              <option value="recurring">Регулярная подписка</option>
            </select>
          </div>
          {planForm.plan_type === 'recurring' && (
            <div className="form-group">
              <label className="form-label">Срок подписки (дней)</label>
              <select
                className="form-input"
                value={planForm.duration_days}
                onChange={e => setPlanForm(f => ({ ...f, duration_days: Number(e.target.value) }))}
              >
                <option value={7}>7 дней</option>
                <option value={14}>14 дней</option>
                <option value={30}>30 дней (месяц)</option>
                <option value={90}>90 дней (квартал)</option>
                <option value={180}>180 дней (полгода)</option>
                <option value={365}>365 дней (год)</option>
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Стоимость (RUB)</label>
            <input
              className="form-input"
              type="number"
              min="1"
              value={planForm.price}
              onChange={e => setPlanForm(f => ({ ...f, price: e.target.value }))}
              placeholder="500"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Описание (необязательно)</label>
            <textarea
              className="form-input"
              value={planForm.description}
              onChange={e => setPlanForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Что входит в тариф..."
              rows={3}
            />
          </div>
          {hasGetcourse && (
            <div className="form-group">
              <label className="form-label">Код предложения GetCourse</label>
              <input
                className="form-input"
                value={planForm.offer_code}
                onChange={e => setPlanForm(f => ({ ...f, offer_code: e.target.value }))}
                placeholder="Код из ссылки на оплату GetCourse"
              />
              <p style={{ fontSize: '0.72rem', color: MUTED, marginTop: 2 }}>Уникальный код предложения для этого тарифа в GetCourse</p>
            </div>
          )}
          <button className="btn btn-primary" onClick={savePlan} disabled={savingPlan} style={{ marginTop: 12 }}>
            {savingPlan ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={showChatModal} onClose={() => setShowChatModal(false)} title="Добавить чат">
        <div className="modal-form">
          {availableChats.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Выберите чат, в который добавлен бот:</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {availableChats.map(bc => (
                  <button key={bc.id} type="button"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      background: chatForm.chat_id === bc.chat_id ? 'rgba(67,97,238,0.08)' : '#fff',
                      border: chatForm.chat_id === bc.chat_id ? `1.5px solid ${ACCENT}` : `1px solid ${BORDER}`,
                      borderRadius: 12,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'all .15s ease',
                    }}
                    onClick={() => setChatForm({ chat_id: bc.chat_id, title: bc.title || '', username: '', join_link: bc.join_link || '' })}
                  >
                    {bc.avatar_url ? (
                      <img src={bc.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: bc.platform === 'max' ? ACCENT2 : '#2AABEE', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                        {(bc.title || 'Ч')[0]}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: DARK }}>{bc.title || bc.chat_id}</div>
                      <div style={{ fontSize: '0.75rem', color: MUTED }}>{bc.platform === 'max' ? 'MAX' : 'Telegram'} · {bc.chat_id}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <details style={{ marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: MUTED }}>
              {availableChats.length > 0 ? 'Или введите ID чата вручную' : 'Введите ID чата'}
            </summary>
            <div style={{ marginTop: 8 }}>
              <div className="form-group">
                <label className="form-label">ID чата *</label>
                <input className="form-input" type="text" value={chatForm.chat_id}
                  onChange={e => setChatForm(f => ({ ...f, chat_id: e.target.value }))}
                  placeholder="-1001234567890" />
              </div>
              <div className="form-group">
                <label className="form-label">Название чата</label>
                <input className="form-input" type="text" value={chatForm.title}
                  onChange={e => setChatForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="VIP-чат" />
              </div>
            </div>
          </details>
          <div style={{ padding: 14, background: SOFT_BG, border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '0.92rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>Как добавить чат</h4>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.84rem', color: DARK, lineHeight: 1.5 }}>
              <li>
                {currentChannel?.platform === 'telegram' ? (
                  <>Добавьте бота в участники чата: <code style={{ cursor: 'pointer', padding: '2px 6px', background: '#fff', borderRadius: 4, border: `1px solid ${BORDER}` }}
                    onClick={() => { navigator.clipboard.writeText(`@${import.meta.env.VITE_TG_BOT_USERNAME || 'PKAds_bot'}`); showToast('Скопировано'); }}>
                    @{import.meta.env.VITE_TG_BOT_USERNAME || 'PKAds_bot'}</code></>
                ) : (
                  <>Добавьте бота в участники чата: <code style={{ cursor: 'pointer', padding: '2px 6px', background: '#fff', borderRadius: 4, border: `1px solid ${BORDER}` }}
                    onClick={() => { navigator.clipboard.writeText(`@${import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot'}`); showToast('Скопировано'); }}>
                    @{import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot'}</code></>
                )}
              </li>
              <li>Откройте ваш чат → <b>Настройки</b> → <b>Администраторы</b> → назначьте бота администратором</li>
              <li>Чат появится автоматически в списке выше</li>
            </ol>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={saveChat} disabled={savingChat}>
              {savingChat ? 'Сохранение...' : 'Добавить'}
            </button>
            <button className="btn btn-outline" onClick={async () => {
              try {
                const data = await api.get(`/paid-chats/${tc}/available-chats`);
                if (data.success) {
                  setAvailableChats(data.chats || []);
                  showToast(`Найдено чатов: ${(data.chats || []).length}`);
                }
              } catch { showToast('Ошибка проверки', 'error'); }
            }}>
              Проверить
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showPostModal} onClose={() => setShowPostModal(false)} title={editingPost ? 'Редактировать пост' : 'Создать пост'}>
        <div className="modal-form">
          <div className="form-group">
            <label className="form-label">Заголовок (необязательно)</label>
            <input
              className="form-input"
              type="text"
              value={postForm.title}
              onChange={e => setPostForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Внутренний заголовок поста"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Текст поста *</label>
            <RichTextEditor
              value={postForm.message_text}
              onChange={text => setPostForm(f => ({ ...f, message_text: text }))}
              showEmoji={true}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Картинка / вложение (опционально)</label>
            <AttachmentPicker
              file={postFile}
              onFileChange={setPostFile}
              attachType={postAttachType}
              onAttachTypeChange={setPostAttachType}
            />
            {editingPost?.file_type && !postFile && (
              <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 4 }}>
                Текущее вложение: {editingPost.file_type}
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Текст кнопки</label>
            <input
              className="form-input"
              type="text"
              value={postForm.button_text}
              onChange={e => setPostForm(f => ({ ...f, button_text: e.target.value }))}
              placeholder="Подробнее"
              style={{ maxWidth: 300 }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Платный чат (кнопка ведёт на подписку)</label>
            <select
              className="form-input"
              value={postForm.chat_id}
              onChange={e => {
                if (e.target.value === '__new__') {
                  setShowPostModal(false);
                  setTab('chats');
                } else {
                  setPostForm(f => ({ ...f, chat_id: e.target.value }));
                }
              }}
            >
              <option value="">Все чаты (по умолчанию)</option>
              {chats.map(c => (
                <option key={c.id} value={c.id}>{c.title || c.chat_id}</option>
              ))}
              <option value="__new__">+ Добавить новый чат</option>
            </select>
          </div>
          <div style={{ marginTop: 8, padding: '12px 16px', background: SOFT_BG, borderRadius: 12, border: `1px solid ${BORDER}`, fontSize: '0.86rem' }}>
            <strong style={{ color: DARK }}>Предпросмотр кнопки:</strong>
            <div style={{ marginTop: 8 }}>
              <span style={{ display: 'inline-block', padding: '8px 20px', background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`, color: '#fff', fontSize: '0.85rem', borderRadius: 10, boxShadow: `0 4px 12px ${ACCENT}40`, fontWeight: 600 }}>
                {postForm.button_text || 'Подробнее'}
              </span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={savePost} disabled={savingPost} style={{ marginTop: 12 }}>
            {savingPost ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!editingNotifType} onClose={() => setEditingNotifType(null)} title={editingNotifType ? EVENT_LABELS[editingNotifType] : 'Уведомление'}>
        {editingNotifType && (() => {
          const form = notifForms[editingNotifType] || { message_text: '', is_active: 1 };
          return (
            <div className="modal-form">
              <label className="pc-toggle-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={form.is_active === 1 || form.is_active === true}
                  onChange={e => setNotifForms(prev => ({
                    ...prev,
                    [editingNotifType]: { ...form, is_active: e.target.checked ? 1 : 0 }
                  }))}
                />
                <span>Включено</span>
              </label>
              <div className="form-group">
                <label className="form-label">Текст сообщения</label>
                <RichTextEditor
                  value={form.message_text}
                  onChange={text => setNotifForms(prev => ({
                    ...prev,
                    [editingNotifType]: { ...form, message_text: text }
                  }))}
                  showEmoji={true}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Картинка (опционально)</label>
                <AttachmentPicker
                  file={notifFiles[editingNotifType] || null}
                  onFileChange={f => setNotifFiles(prev => ({ ...prev, [editingNotifType]: f }))}
                  attachType=""
                  onAttachTypeChange={() => {}}
                  photoOnly
                  existingFileInfo={form.file_type || ''}
                />
                {form.file_path && !notifFiles[editingNotifType] && (
                  <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Изображение прикреплено ({form.file_type})</span>
                    <button
                      className="btn btn-outline" style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                      onClick={async () => {
                        try {
                          const n = notifications.find(n => n.event_type === editingNotifType);
                          if (n) await api.delete(`/paid-chats/${tc}/notifications/${n.id}/image`);
                          loadNotifications();
                          showToast('Изображение удалено');
                        } catch {}
                      }}
                    >Удалить</button>
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 8 }}
                onClick={async () => {
                  await saveNotification(editingNotifType);
                  setEditingNotifType(null);
                }}
                disabled={savingNotif === editingNotifType}
              >
                {savingNotif === editingNotifType ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          );
        })()}
      </Modal>
    </Paywall>
  );
}
