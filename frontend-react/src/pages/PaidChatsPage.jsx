import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import AttachmentPicker from '../components/AttachmentPicker';
import { api } from '../services/api';

const PROVIDERS = [
  { id: 'yoomoney', name: 'ЮMoney', fields: [{ key: 'shop_id', label: 'Shop ID' }, { key: 'secret_key', label: 'Секретный ключ' }] },
  { id: 'prodamus', name: 'Продамус', fields: [{ key: 'api_key', label: 'API-ключ' }, { key: 'shop_url', label: 'URL магазина' }] },
  { id: 'tinkoff', name: 'Тинькофф Эквайринг', fields: [{ key: 'terminal_key', label: 'Terminal Key' }, { key: 'password', label: 'Пароль' }] },
  { id: 'robokassa', name: 'Робокасса', fields: [{ key: 'merchant_login', label: 'Merchant Login' }, { key: 'password1', label: 'Пароль #1' }, { key: 'password2', label: 'Пароль #2' }] },
  { id: 'getcourse', name: 'GetCourse', fields: [{ key: 'account_name', label: 'Аккаунт (поддомен)' }, { key: 'secret_key', label: 'Секретный ключ API' }] },
];

const EVENT_LABELS = {
  before_subscribe: 'Перед подпиской (описание канала)',
  after_subscribe: 'После подписки (приветствие)',
  '3_days_before_expiry': 'За 3 дня до конца подписки',
  '1_day_before_expiry': 'За 1 день до конца подписки',
};

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
    <>
      <div className="page-header">
        <h1>Платные чаты</h1>
      </div>

      {/* Payment link */}
      {setup.has_payment && setup.has_plans && setup.has_chats && (
        <div className="pc-info-box" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <strong>Ссылка на оплату:</strong>
          <code style={{ background: 'var(--bg)', padding: '4px 10px', borderRadius: 6, fontSize: '0.85rem', wordBreak: 'break-all' }}>
            {window.location.origin}/pay/{tc}
          </code>
          <button
            className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/pay/${tc}`);
              showToast('Ссылка скопирована');
            }}
          >
            Копировать
          </button>
        </div>
      )}

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

      {/* ═══════════ TAB: PAYMENT ═══════════ */}
      {tab === 'payment' && (
        <div className="pc-section">
          <h2>Настройка оплаты</h2>
          <div className="pc-info-box">
            <strong>Инструкция по подключению эквайринга:</strong>
            <ol>
              <li>Выберите платёжную систему из списка ниже</li>
              <li>Зарегистрируйтесь на сайте платёжной системы и получите API-ключи</li>
              <li>Введите полученные данные в форму и нажмите «Сохранить»</li>
              <li>После подключения эквайринга станут доступны остальные разделы</li>
            </ol>
          </div>

          <h3 style={{ marginTop: 24 }}>Платёжные системы</h3>
          <div className="pc-providers-grid">
            {PROVIDERS.map(p => {
              const connected = paymentSettings.find(s => s.provider === p.id);
              return (
                <div key={p.id} className={`pc-provider-card ${connected ? 'connected' : ''}`}>
                  <div className="pc-provider-header">
                    <strong>{p.name}</strong>
                    {connected && <span className="pc-badge success">Подключён</span>}
                  </div>
                  <div className="pc-provider-actions">
                    <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => openProviderModal(p)}>
                      {connected ? 'Изменить' : 'Подключить'}
                    </button>
                    {connected && (
                      <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => disconnectProvider(connected)}>
                        Отключить
                      </button>
                    )}
                  </div>
                  {connected && ['yoomoney', 'robokassa', 'getcourse'].includes(p.id) && (
                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span>⚠️ Webhook URL (добавьте в настройках {p.name}):</span>
                      <code style={{ display: 'block', marginTop: '4px', padding: '6px', background: 'var(--bg-secondary, #f5f5f5)', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer', wordBreak: 'break-all' }}
                        onClick={() => {
                          const url = p.id === 'getcourse'
                            ? `${window.location.origin}/api/paid-chat-pay/webhook/getcourse/${currentChannel?.tracking_code}`
                            : `${window.location.origin}/api/paid-chat-pay/webhook/${p.id}`;
                          navigator.clipboard.writeText(url);
                        }}
                        title="Нажмите для копирования">
                        {p.id === 'getcourse'
                          ? `${window.location.origin}/api/paid-chat-pay/webhook/getcourse/${currentChannel?.tracking_code}`
                          : `${window.location.origin}/api/paid-chat-pay/webhook/${p.id}`}
                      </code>
                      <p style={{ marginTop: '4px', fontSize: '0.7rem', opacity: 0.7 }}>
                        {p.id === 'yoomoney' && 'Личный кабинет ЮKassa → Настройки → HTTP-уведомления → URL'}
                        {p.id === 'robokassa' && 'Личный кабинет Робокассы → Технические настройки → Result URL'}
                        {p.id === 'getcourse' && 'Настройки GetCourse → Уведомления об оплате → URL'}
                      </p>
                    </div>
                  )}
                  {connected && ['tinkoff', 'prodamus'].includes(p.id) && (
                    <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--success, #2a9d8f)' }}>
                      ✅ Webhook настраивается автоматически при каждом платеже
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      )}

      {tab === 'plans' && (
        <div className="pc-section">
          <h2>Тарифы</h2>
          {!setup.has_payment && (
            <div className="pc-info-box warning">
              Сначала подключите платёжную систему на вкладке «Оплата».
            </div>
          )}
          {setup.has_payment && (
            <>
              <div className="pc-info-box">
                <strong>Инструкция по тарифам:</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                  <li><b>Разовая оплата</b> — пользователь платит один раз и получает доступ навсегда</li>
                  <li><b>Регулярная подписка</b> — выберите срок и стоимость. По истечении доступ закрывается</li>
                </ul>
              </div>
              <button className="btn btn-primary" onClick={openPlanCreate} style={{ marginBottom: 16 }}>
                + Новый тариф
              </button>
              {plans.length === 0 && <p className="pc-empty">Тарифов пока нет. Создайте первый тариф.</p>}
              <div className="pc-plans-list">
                {plans.map(p => (
                  <div key={p.id} className="pc-plan-card">
                    <div className="pc-plan-info">
                      <strong>{p.title || (p.plan_type === 'one_time' ? 'Разовая оплата' : `Подписка на ${p.duration_days} дн.`)}</strong>
                      <span className="pc-plan-price">{Number(p.price).toLocaleString('ru-RU')} {p.currency || 'RUB'}</span>
                      <span className={`pc-badge ${p.plan_type === 'recurring' ? 'info' : 'success'}`}>
                        {p.plan_type === 'recurring' ? `Регулярная / ${p.duration_days} дн.` : 'Разовая'}
                      </span>
                    </div>
                    <div className="pc-plan-actions">
                      <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => openPlanEdit(p)}>Редактировать</button>
                      <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => deletePlan(p)}>Удалить</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════ TAB: CHATS ═══════════ */}
      {tab === 'chats' && (
        <div className="pc-section">
          <h2>Подключённые чаты</h2>
          <div className="pc-info-box">
            <strong>Как подключить платный чат:</strong>
            <ol style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
              <li>Создайте закрытый чат/группу</li>
              <li>Добавьте бота <b>администратором</b> в чат</li>
              <li>Бот пришлёт уведомление — нажмите «Добавить чат» ниже</li>
              <li>Выберите чат из списка</li>
            </ol>
          </div>
          <button className="btn btn-primary" onClick={async () => {
            try {
              const data = await api.get(`/paid-chats/${tc}/available-chats`);
              if (data.success) setAvailableChats(data.chats || []);
            } catch {}
            setShowChatModal(true);
          }} style={{ marginBottom: 16 }}>
            + Добавить чат
          </button>
          {chats.length === 0 && <p className="pc-empty">Чатов пока нет. Добавьте первый платный чат.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {chats.map(c => {
              const platformColor = c.platform === 'max' ? '#7B68EE' : '#2AABEE';
              const firstLetter = (c.title || c.chat_id || 'Ч')[0].toUpperCase();
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '14px 16px', background: 'var(--bg-glass)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
                    background: platformColor, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem', fontWeight: 700,
                  }}>
                    {firstLetter}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{c.title || c.chat_id}</div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, background: platformColor, color: '#fff' }}>
                        {c.platform === 'max' ? 'MAX' : 'TG'}
                      </span>
                      <span className="pc-badge info" style={{ fontSize: '0.72rem' }}>{c.active_members || 0} участников</span>
                      <span className={`pc-badge ${c.is_active ? 'success' : 'warning'}`} style={{ fontSize: '0.72rem' }}>
                        {c.is_active ? 'Активен' : 'Неактивен'}
                      </span>
                    </div>
                  </div>
                  <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '0.82rem', flexShrink: 0 }} onClick={() => deleteChat(c)}>
                    Удалить
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: MEMBERS ═══════════ */}
      {tab === 'members' && (
        <div className="pc-section">
          <h2>Участники</h2>
          <div className="pc-filters">
            <select value={memberChatFilter} onChange={e => setMemberChatFilter(e.target.value)}>
              <option value="">Все чаты</option>
              {chats.map(c => <option key={c.id} value={c.id}>{c.title || c.chat_id}</option>)}
            </select>
            <select value={memberStatusFilter} onChange={e => setMemberStatusFilter(e.target.value)}>
              <option value="">Все статусы</option>
              <option value="active">Активные</option>
              <option value="expired">Истекшие</option>
              <option value="cancelled">Отменённые</option>
            </select>
          </div>
          {members.length === 0 && <p className="pc-empty">Участников пока нет.</p>}
          {members.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="pc-members-table-wrap pc-desktop-only">
                <table className="pc-members-table">
                  <thead>
                    <tr>
                      <th>Пользователь</th>
                      <th>Чат</th>
                      <th>Тариф</th>
                      <th>Оплата</th>
                      <th>Статус</th>
                      <th>Истекает</th>
                      <th>Ссылка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.first_name || m.username || m.telegram_id || m.max_user_id}</strong>
                          {m.username && <div className="pc-text-muted">@{m.username}</div>}
                        </td>
                        <td>{m.chat_title || '—'}</td>
                        <td>
                          {m.plan_title || (m.plan_type === 'one_time' ? 'Разовая' : 'Подписка')}
                          {m.price && <div className="pc-text-muted">{Number(m.price).toLocaleString('ru-RU')} RUB</div>}
                        </td>
                        <td>{m.amount_paid ? `${Number(m.amount_paid).toLocaleString('ru-RU')} RUB` : '—'}</td>
                        <td>
                          <span className={`pc-badge ${m.status === 'active' ? 'success' : m.status === 'expired' ? 'warning' : 'danger'}`}>
                            {m.status === 'active' ? 'Активен' : m.status === 'expired' ? 'Истёк' : m.status === 'cancelled' ? 'Отменён' : m.status}
                          </span>
                        </td>
                        <td>{m.expires_at ? new Date(m.expires_at).toLocaleDateString('ru-RU') : 'Бессрочно'}</td>
                        <td>{m.invite_link ? <a href={m.invite_link} target="_blank" rel="noreferrer" className="pc-text-muted" style={{fontSize: 12}}>Ссылка</a> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {/* Mobile cards */}
              <div className="pc-mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {members.map(m => (
                  <div key={m.id} className="pc-member-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div>
                        <strong>{m.first_name || m.username || m.telegram_id || m.max_user_id}</strong>
                        {m.username && <span className="pc-text-muted" style={{ marginLeft: 6 }}>@{m.username}</span>}
                      </div>
                      <span className={`pc-badge ${m.status === 'active' ? 'success' : m.status === 'expired' ? 'warning' : 'danger'}`}>
                        {m.status === 'active' ? 'Активен' : m.status === 'expired' ? 'Истёк' : m.status === 'cancelled' ? 'Отменён' : m.status}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>Чат: {m.chat_title || '—'}</span>
                      <span>Тариф: {m.plan_title || (m.plan_type === 'one_time' ? 'Разовая' : 'Подписка')}</span>
                      <span>Оплата: {m.amount_paid ? `${Number(m.amount_paid).toLocaleString('ru-RU')} ₽` : '—'}</span>
                      <span>До: {m.expires_at ? new Date(m.expires_at).toLocaleDateString('ru-RU') : 'Бессрочно'}</span>
                    </div>
                    {m.invite_link && (
                      <a href={m.invite_link} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', marginTop: 6, display: 'inline-block' }}>Инвайт-ссылка</a>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════ TAB: NOTIFICATIONS ═══════════ */}
      {tab === 'notifications' && (
        <div className="pc-section">
          <h2>Уведомления</h2>
          <div className="pc-info-box">
            <strong>Настройка уведомлений:</strong>
            <ul>
              <li><b>Перед подпиской</b> — описание канала, что получит пользователь</li>
              <li><b>После подписки</b> — приветственное сообщение после оплаты</li>
              <li><b>За 3 дня до конца</b> — напоминание о скором окончании подписки</li>
              <li><b>За 1 день до конца</b> — последнее напоминание перед отключением</li>
            </ul>
          </div>
          <div className="pc-notifs-list">
            {Object.entries(EVENT_LABELS).map(([eventType, label]) => {
              const form = notifForms[eventType] || { message_text: '', is_active: 1 };
              return (
                <div key={eventType} className="pc-notif-card">
                  <div className="pc-notif-header">
                    <strong>{label}</strong>
                    <label className="pc-toggle-label">
                      <input
                        type="checkbox"
                        checked={form.is_active === 1 || form.is_active === true}
                        onChange={e => setNotifForms(prev => ({
                          ...prev,
                          [eventType]: { ...form, is_active: e.target.checked ? 1 : 0 }
                        }))}
                      />
                      <span>Включено</span>
                    </label>
                  </div>
                  <RichTextEditor
                    value={form.message_text}
                    onChange={text => setNotifForms(prev => ({
                      ...prev,
                      [eventType]: { ...form, message_text: text }
                    }))}
                    showEmoji={true}
                  />
                  <div style={{ marginTop: 8 }}>
                    <label className="form-label" style={{ fontSize: '0.85rem' }}>Картинка (опционально)</label>
                    <AttachmentPicker
                      file={notifFiles[eventType] || null}
                      onFileChange={f => setNotifFiles(prev => ({ ...prev, [eventType]: f }))}
                      attachType=""
                      onAttachTypeChange={() => {}}
                      photoOnly
                      existingFileInfo={form.file_type || ''}
                    />
                    {form.file_path && !notifFiles[eventType] && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>Изображение прикреплено ({form.file_type})</span>
                        <button
                          className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                          style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                          onClick={async () => {
                            try {
                              const n = notifications.find(n => n.event_type === eventType);
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
                    className="btn-primary btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => saveNotification(eventType)}
                    disabled={savingNotif === eventType}
                  >
                    {savingNotif === eventType ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: PUBLISH ═══════════ */}
      {tab === 'publish' && (
        <div className="pc-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>Публикации</h2>
            <button className="btn btn-primary" onClick={openPostCreate}>+ Создать пост</button>
          </div>
          <div className="pc-info-box">
            <strong>Как это работает:</strong>
            <ol>
              <li>Создайте пост — укажите текст, кнопку и прикрепите картинку</li>
              <li>К посту автоматически добавится кнопка со ссылкой на бота</li>
              <li>Нажмите «Опубликовать» — пост будет отправлен в канал</li>
            </ol>
          </div>
          {posts.length === 0 && <p className="pc-empty">Постов пока нет. Создайте первый пост.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map(post => (
              <div key={post.id} className="pc-plan-card">
                <div className="pc-plan-info" style={{ flex: 1 }}>
                  {post.title && <strong>{post.title}</strong>}
                  <div style={{ maxHeight: 60, overflow: 'hidden', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.4 }}>
                    {post.message_text?.substring(0, 120)}{post.message_text?.length > 120 ? '...' : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                    <span className={`pc-badge ${post.status === 'published' ? 'success' : 'info'}`}>
                      {post.status === 'published' ? 'Опубликован' : 'Черновик'}
                    </span>
                    {post.chat_title && <span className="pc-badge">{post.chat_title}</span>}
                    {post.file_type && <span className="pc-badge">📎 {post.file_type}</span>}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {post.published_at
                        ? `Опубликован ${new Date(post.published_at).toLocaleDateString('ru-RU')}`
                        : `Создан ${new Date(post.created_at).toLocaleDateString('ru-RU')}`}
                    </span>
                  </div>
                </div>
                <div className="pc-plan-actions">
                  <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => openPostEdit(post)}>Ред.</button>
                  <button
                    className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                    onClick={() => publishPost(post)}
                    disabled={publishingPostId === post.id}
                  >
                    {publishingPostId === post.id ? '...' : 'Опубликовать'}
                  </button>
                  <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => deletePost(post)}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
        </div>
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
          <div className="form-group">
            <label>Username (без @)</label>
            <input
              type="text"
              value={chatForm.username}
              onChange={e => setChatForm(f => ({ ...f, username: e.target.value }))}
              placeholder="my_vip_chat"
            />
          </div>
          <div className="form-group">
            <label>Пригласительная ссылка</label>
            <input
              type="text"
              value={chatForm.join_link}
              onChange={e => setChatForm(f => ({ ...f, join_link: e.target.value }))}
              placeholder="https://t.me/+ABC123..."
            />
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
    </>
  );
}
