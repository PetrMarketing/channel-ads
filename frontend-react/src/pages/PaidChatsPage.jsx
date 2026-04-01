import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import AttachmentPicker from '../components/AttachmentPicker';
import { api } from '../services/api';
import Paywall from '../components/Paywall';

import { EVENT_LABELS } from './paid-chats/constants';
import PaymentTab from './paid-chats/PaymentTab';
import PlansTab from './paid-chats/PlansTab';
import ChatsTab from './paid-chats/ChatsTab';
import MembersTab from './paid-chats/MembersTab';
import NotificationsTab from './paid-chats/NotificationsTab';
import PublishTab from './paid-chats/PublishTab';

export default function PaidChatsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;

  const [tab, setTab] = useState('payment');
  const [loading, setLoading] = useState(true);

  // Setup status
  const [setup, setSetup] = useState({ has_payment: false, has_plans: false, has_chats: false, has_notifs: false });

  // Payment settings
  const [paymentSettings, setPaymentSettings] = useState([]);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerCreds, setProviderCreds] = useState({});
  const [savingProvider, setSavingProvider] = useState(false);

  // Plans
  const [plans, setPlans] = useState([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({ plan_type: 'recurring', duration_days: 30, price: '', title: '', description: '' });
  const [savingPlan, setSavingPlan] = useState(false);

  // Chats
  const [chats, setChats] = useState([]);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatForm, setChatForm] = useState({ chat_id: '', title: '', username: '', join_link: '' });
  const [availableChats, setAvailableChats] = useState([]);
  const [savingChat, setSavingChat] = useState(false);

  // Members
  const [members, setMembers] = useState([]);
  const [memberChatFilter, setMemberChatFilter] = useState('');
  const [memberStatusFilter, setMemberStatusFilter] = useState('');

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [notifForms, setNotifForms] = useState({});
  const [notifFiles, setNotifFiles] = useState({});
  const [savingNotif, setSavingNotif] = useState('');
  const [editingNotifType, setEditingNotifType] = useState(null);

  // Posts
  const [posts, setPosts] = useState([]);
  const [showPostModal, setShowPostModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [postForm, setPostForm] = useState({ title: '', message_text: '', button_text: 'Подробнее', chat_id: '' });
  const [postFile, setPostFile] = useState(null);
  const [postAttachType, setPostAttachType] = useState('');
  const [savingPost, setSavingPost] = useState(false);
  const [publishingPostId, setPublishingPostId] = useState(null);

  // ── Load data ──
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

  // ── Payment settings handlers ──
  const openProviderModal = (provider) => {
    setSelectedProvider(provider);
    const existing = paymentSettings.find(s => s.provider === provider.id);
    setProviderCreds(existing?.credentials || {});
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
        showToast(`${selectedProvider.name} подключён`);
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

  // ── Plans handlers ──
  const openPlanCreate = () => {
    setEditingPlan(null);
    setPlanForm({ plan_type: 'recurring', duration_days: 30, price: '', title: '', description: '' });
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

  // ── Chats handlers ──
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

  // ── Notification handlers ──
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

  // ── Post handlers ──
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

  if (loading) return <Loading />;

  const isTabLocked = (t) => {
    if (t === 'payment') return false;
    if (t === 'plans') return !setup.has_payment;
    if (t === 'publish') return !setup.has_payment || !setup.has_plans || !setup.has_chats;
    if (t === 'chats' || t === 'members' || t === 'notifications') return !setup.has_payment;
    return false;
  };

  const tabs = [
    { id: 'payment', label: 'Оплата' },
    { id: 'plans', label: 'Тарифы' },
    { id: 'chats', label: 'Чаты' },
    { id: 'members', label: 'Участники' },
    { id: 'notifications', label: 'Уведомления' },
    { id: 'publish', label: 'Публикация' },
  ];

  return (
    <Paywall>
      <div className="page-header">
        <h1>Платные чаты</h1>
      </div>

      {/* Payment link */}
      {setup.has_payment && setup.has_plans && setup.has_chats && (() => {
        const maxBotUsername = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';
        const botLink = `https://max.ru/${maxBotUsername}?startapp=paid_${tc}`;
        const webLink = `${window.location.origin}/pay/${tc}`;
        return (
        <div className="pc-info-box" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <strong>Ссылка на бота:</strong>
            <code style={{ background: 'var(--bg)', padding: '4px 10px', borderRadius: 6, fontSize: '0.85rem', wordBreak: 'break-all' }}>
              {botLink}
            </code>
            <button
              className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={() => { navigator.clipboard.writeText(botLink); showToast('Ссылка скопирована'); }}
            >Копировать</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <strong>Веб-ссылка:</strong>
            <code style={{ background: 'var(--bg)', padding: '4px 10px', borderRadius: 6, fontSize: '0.85rem', wordBreak: 'break-all' }}>
              {webLink}
            </code>
            <button
              className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={() => { navigator.clipboard.writeText(webLink); showToast('Ссылка скопирована'); }}
            >Копировать</button>
          </div>
        </div>);
      })()}

      {/* Setup progress */}
      <div className="pc-setup-bar">
        <div className={`pc-setup-step ${setup.has_payment ? 'done' : 'current'}`}>
          <span className="pc-step-num">1</span>
          <span>Подключить эквайринг</span>
        </div>
        <div className="pc-setup-arrow">&rarr;</div>
        <div className={`pc-setup-step ${setup.has_plans ? 'done' : setup.has_payment ? 'current' : ''}`}>
          <span className="pc-step-num">2</span>
          <span>Создать тариф</span>
        </div>
        <div className="pc-setup-arrow">&rarr;</div>
        <div className={`pc-setup-step ${setup.has_chats ? 'done' : setup.has_plans ? 'current' : ''}`}>
          <span className="pc-step-num">3</span>
          <span>Добавить чат</span>
        </div>
        <div className="pc-setup-arrow">&rarr;</div>
        <div className={`pc-setup-step ${setup.has_notifs ? 'done' : setup.has_chats ? 'current' : ''}`}>
          <span className="pc-step-num">4</span>
          <span>Настроить уведомления</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="pc-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`pc-tab ${tab === t.id ? 'active' : ''} ${isTabLocked(t.id) ? 'locked' : ''}`}
            onClick={() => !isTabLocked(t.id) && setTab(t.id)}
            disabled={isTabLocked(t.id)}
          >
            {t.label}
            {isTabLocked(t.id) && <span className="pc-lock-icon" title="Сначала настройте оплату">&#128274;</span>}
          </button>
        ))}
      </div>

      {/* ═══════════ TAB CONTENT ═══════════ */}
      {tab === 'payment' && (
        <PaymentTab
          paymentSettings={paymentSettings}
          openProviderModal={openProviderModal}
          disconnectProvider={disconnectProvider}
          currentChannel={currentChannel}
        />
      )}

      {tab === 'plans' && (
        <PlansTab
          setup={setup}
          plans={plans}
          openPlanCreate={openPlanCreate}
          openPlanEdit={openPlanEdit}
          deletePlan={deletePlan}
        />
      )}

      {tab === 'chats' && (
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
      )}

      {tab === 'members' && (
        <MembersTab
          members={members}
          chats={chats}
          memberChatFilter={memberChatFilter}
          setMemberChatFilter={setMemberChatFilter}
          memberStatusFilter={memberStatusFilter}
          setMemberStatusFilter={setMemberStatusFilter}
        />
      )}

      {tab === 'notifications' && (
        <NotificationsTab
          notifForms={notifForms}
          setEditingNotifType={setEditingNotifType}
        />
      )}

      {tab === 'publish' && (
        <PublishTab
          posts={posts}
          openPostCreate={openPostCreate}
          openPostEdit={openPostEdit}
          deletePost={deletePost}
          publishPost={publishPost}
          publishingPostId={publishingPostId}
        />
      )}

      {/* ═══════════ MODALS ═══════════ */}

      {/* Provider modal */}
      <Modal isOpen={showProviderModal} onClose={() => setShowProviderModal(false)} title={selectedProvider ? `Подключить ${selectedProvider.name}` : 'Эквайринг'}>
        {selectedProvider && (
          <div className="modal-form">
            <div className="pc-info-box" style={{ marginBottom: 16 }}>
              Заполните данные из личного кабинета <b>{selectedProvider.name}</b>.
              Убедитесь, что указали корректные ключи для рабочего режима (не тестового).
            </div>

            {['yoomoney', 'robokassa', 'getcourse'].includes(selectedProvider.id) && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.2)', borderRadius: '8px', fontSize: '0.82rem' }}>
                <strong>⚠️ Важно — настройте webhook:</strong>
                <p style={{ margin: '6px 0 4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {selectedProvider.id === 'yoomoney' && 'В личном кабинете ЮKassa → Настройки → HTTP-уведомления, укажите URL:'}
                  {selectedProvider.id === 'robokassa' && 'В личном кабинете Робокассы → Технические настройки → Result URL, укажите:'}
                  {selectedProvider.id === 'getcourse' && 'В настройках GetCourse → Уведомления об оплате, укажите URL:'}
                </p>
                <code style={{ display: 'block', padding: '6px 8px', background: 'var(--bg-glass)', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', wordBreak: 'break-all' }}
                  onClick={() => {
                    const url = selectedProvider.id === 'getcourse'
                      ? `${window.location.origin}/api/paid-chat-pay/webhook/getcourse/${currentChannel?.tracking_code}`
                      : `${window.location.origin}/api/paid-chat-pay/webhook/${selectedProvider.id}`;
                    navigator.clipboard.writeText(url);
                  }}
                  title="Нажмите для копирования">
                  {selectedProvider.id === 'getcourse'
                    ? `${window.location.origin}/api/paid-chat-pay/webhook/getcourse/${currentChannel?.tracking_code}`
                    : `${window.location.origin}/api/paid-chat-pay/webhook/${selectedProvider.id}`}
                </code>
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7 }}>Нажмите на URL, чтобы скопировать</p>
              </div>
            )}
            {['tinkoff', 'prodamus'].includes(selectedProvider.id) && (
              <div style={{ marginBottom: 16, padding: '8px 14px', background: 'rgba(42,157,143,0.08)', border: '1px solid rgba(42,157,143,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--success, #2a9d8f)' }}>
                ✅ Webhook настроится автоматически при каждом платеже
              </div>
            )}

            {selectedProvider.fields.map(f => (
              <div key={f.key} className="form-group">
                <label>{f.label}</label>
                <input
                  type={f.key.includes('password') || f.key.includes('secret') ? 'password' : 'text'}
                  value={providerCreds[f.key] || ''}
                  onChange={e => setProviderCreds(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.label}
                />
              </div>
            ))}
            <button className="btn btn-primary" onClick={saveProvider} disabled={savingProvider} style={{ marginTop: 12 }}>
              {savingProvider ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </Modal>

      {/* Plan modal */}
      <Modal isOpen={showPlanModal} onClose={() => setShowPlanModal(false)} title={editingPlan ? 'Редактировать тариф' : 'Новый тариф'}>
        <div className="modal-form">
          <div className="form-group">
            <label>Название тарифа</label>
            <input
              type="text"
              value={planForm.title}
              onChange={e => setPlanForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Например: Месячная подписка"
            />
          </div>
          <div className="form-group">
            <label>Тип оплаты</label>
            <select
              value={planForm.plan_type}
              onChange={e => setPlanForm(f => ({ ...f, plan_type: e.target.value }))}
            >
              <option value="one_time">Разовая оплата</option>
              <option value="recurring">Регулярная подписка</option>
            </select>
          </div>
          {planForm.plan_type === 'recurring' && (
            <div className="form-group">
              <label>Срок подписки (дней)</label>
              <select
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
            <label>Стоимость (RUB)</label>
            <input
              type="number"
              min="1"
              value={planForm.price}
              onChange={e => setPlanForm(f => ({ ...f, price: e.target.value }))}
              placeholder="500"
            />
          </div>
          <div className="form-group">
            <label>Описание (необязательно)</label>
            <textarea
              value={planForm.description}
              onChange={e => setPlanForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Что входит в тариф..."
              rows={3}
            />
          </div>
          <button className="btn btn-primary" onClick={savePlan} disabled={savingPlan} style={{ marginTop: 12 }}>
            {savingPlan ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </Modal>

      {/* Chat modal */}
      <Modal isOpen={showChatModal} onClose={() => setShowChatModal(false)} title="Добавить чат">
        <div className="modal-form">
          {/* Available bot chats */}
          {availableChats.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Выберите чат, в который добавлен бот:</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {availableChats.map(bc => (
                  <button key={bc.id} type="button"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                      background: chatForm.chat_id === bc.chat_id ? 'rgba(42,170,238,0.1)' : 'var(--bg-glass)',
                      border: chatForm.chat_id === bc.chat_id ? '2px solid var(--primary)' : '1px solid var(--border)',
                      borderRadius: '8px', cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}
                    onClick={() => setChatForm({ chat_id: bc.chat_id, title: bc.title || '', username: '', join_link: bc.join_link || '' })}
                  >
                    {bc.avatar_url ? (
                      <img src={bc.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: bc.platform === 'max' ? '#7B68EE' : '#2AABEE', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                        {(bc.title || 'Ч')[0]}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{bc.title || bc.chat_id}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{bc.platform === 'max' ? 'MAX' : 'Telegram'} · {bc.chat_id}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual input */}
          <details style={{ marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {availableChats.length > 0 ? 'Или введите ID чата вручную' : 'Введите ID чата'}
            </summary>
            <div style={{ marginTop: 8 }}>
              <div className="form-group">
                <label>ID чата *</label>
                <input type="text" value={chatForm.chat_id}
                  onChange={e => setChatForm(f => ({ ...f, chat_id: e.target.value }))}
                  placeholder="-1001234567890" />
              </div>
              <div className="form-group">
                <label>Название чата</label>
                <input type="text" value={chatForm.title}
                  onChange={e => setChatForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="VIP-чат" />
              </div>
            </div>
          </details>
          <div style={{ padding: '14px', background: 'var(--bg-glass)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '0.92rem' }}>Как добавить чат</h4>
            <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.88rem' }}>
              <li>Откройте ваш чат → <b>Настройки</b> → <b>Администраторы</b></li>
              <li>Добавьте бота: <code style={{ cursor: 'pointer', padding: '2px 6px', background: 'var(--bg)', borderRadius: '4px' }}
                onClick={() => { navigator.clipboard.writeText(`@${import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot'}`); }}>
                @{import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot'}</code></li>
              <li>Чат появится автоматически в списке выше</li>
            </ol>
          </div>
          <button className="btn btn-primary" onClick={saveChat} disabled={savingChat} style={{ marginTop: 12 }}>
            {savingChat ? 'Сохранение...' : 'Добавить'}
          </button>
        </div>
      </Modal>

      {/* Post modal */}
      <Modal isOpen={showPostModal} onClose={() => setShowPostModal(false)} title={editingPost ? 'Редактировать пост' : 'Создать пост'}>
        <div className="modal-form">
          <div className="form-group">
            <label>Заголовок (необязательно)</label>
            <input
              type="text"
              value={postForm.title}
              onChange={e => setPostForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Внутренний заголовок поста"
            />
          </div>
          <div className="form-group">
            <label>Текст поста *</label>
            <RichTextEditor
              value={postForm.message_text}
              onChange={text => setPostForm(f => ({ ...f, message_text: text }))}
              showEmoji={true}
            />
          </div>
          <div className="form-group">
            <label>Картинка / вложение (опционально)</label>
            <AttachmentPicker
              file={postFile}
              onFileChange={setPostFile}
              attachType={postAttachType}
              onAttachTypeChange={setPostAttachType}
            />
            {editingPost?.file_type && !postFile && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Текущее вложение: {editingPost.file_type}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Текст кнопки</label>
            <input
              type="text"
              value={postForm.button_text}
              onChange={e => setPostForm(f => ({ ...f, button_text: e.target.value }))}
              placeholder="Подробнее"
              style={{ maxWidth: 300 }}
            />
          </div>
          <div className="form-group">
            <label>Платный чат (кнопка ведёт на подписку)</label>
            <select
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
          <div style={{ marginTop: 8, padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, fontSize: '0.9rem' }}>
            <strong>Предпросмотр кнопки:</strong>
            <div style={{ marginTop: 8 }}>
              <span style={{ display: 'inline-block', padding: '8px 20px', background: 'var(--primary)', color: '#fff', borderRadius: 6, fontSize: '0.85rem' }}>
                {postForm.button_text || 'Подробнее'}
              </span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={savePost} disabled={savingPost} style={{ marginTop: 12 }}>
            {savingPost ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </Modal>

      {/* Notification edit modal */}
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
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
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
