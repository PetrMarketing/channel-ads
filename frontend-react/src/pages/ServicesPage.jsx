import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import Paywall from '../components/Paywall';
import { usePageOnboarding } from '../components/OnboardingTour';
import { STATUS_LABELS } from './services/constants';
import BranchesTab from './services/BranchesTab';
import SpecialistsTab from './services/SpecialistsTab';
import ServicesListTab from './services/ServicesListTab';
import BookingsTab from './services/BookingsTab';
import ClientsTab from './services/ClientsTab';
import SvcNotificationsTab from './services/SvcNotificationsTab';
import AppearanceTab from './services/AppearanceTab';
import PaymentTab from './services/PaymentTab';

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

function CalendarScissorsIcon({ size = 54, color = '#fff', strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <circle cx="9" cy="16" r="1.6" />
      <circle cx="15" cy="16" r="1.6" />
      <path d="M10.5 14.7 15 13" />
      <path d="M13.5 14.7 9 13" />
    </svg>
  );
}

function EmptyServices({ tabLabel, onCreate, ctaLabel }) {
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
          <CalendarScissorsIcon size={52} strokeWidth={1.7} />
        </div>
        <div style={{
          position: 'absolute', right: -4, bottom: -4,
          width: 34, height: 34, borderRadius: '50%',
          background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '1.25rem', fontWeight: 800,
          boxShadow: `0 4px 12px ${SUCCESS}55`,
          border: '3px solid #fff',
        }}>+</div>
      </div>

      <h3 style={{
        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em',
        color: DARK, margin: '0 0 8px',
      }}>
        Раздел «{tabLabel}» пока пуст
      </h3>
      <p style={{
        fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px',
        maxWidth: 460, lineHeight: 1.55,
      }}>
        Настройте онлайн-запись клиентов: добавьте филиалы, специалистов, услуги и подключите оплату — клиенты смогут бронировать прямо в MiniApp.
      </p>

      {onCreate && (
        <button className="svp-primary" style={primaryBtn} onClick={onCreate}>
          <PlusIcon />
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

export default function ServicesPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;

  const { overlay: pageTour } = usePageOnboarding('services', [
    { selector: '[data-tour-page="branches-tab"]', title: 'Начните с филиала', text: 'Адрес, часы работы, контакты — фундамент онлайн-записи.', placement: 'bottom' },
    { selector: '[data-tour-page="specialists-tab"]', title: 'Сотрудники', text: 'Расписание, услуги, цена. Клиенты будут записываться к ним через MiniApp.', placement: 'bottom' },
  ]);

  const [tab, setTab] = useState('branches');
  const [loading, setLoading] = useState(false);

  const [branches, setBranches] = useState([]);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchForm, setBranchForm] = useState({ name: '', city: '', address: '', phone: '', email: '', buffer_time: 0, working_hours: {} });
  const [savingBranch, setSavingBranch] = useState(false);

  const [specialists, setSpecialists] = useState([]);
  const [showSpecialistModal, setShowSpecialistModal] = useState(false);
  const [editingSpecialist, setEditingSpecialist] = useState(null);
  const [specialistForm, setSpecialistForm] = useState({ name: '', position: '', phone: '', email: '', branch_id: '', description: '', max_bookings_per_day: 10, working_hours: {} });
  const [savingSpecialist, setSavingSpecialist] = useState(false);
  const [specialistPhoto, setSpecialistPhoto] = useState(null);
  const [specialistServices, setSpecialistServices] = useState([]);
  const [specialistCustomPrices, setSpecialistCustomPrices] = useState({});

  const [categories, setCategories] = useState([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', parent_id: '' });

  const [services, setServices] = useState([]);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', category_id: '', service_type: 'single', duration_minutes: 60, price: '', max_participants: 1, cancel_hours: 24, color: '#4F46E5' });
  const [savingService, setSavingService] = useState(false);
  const [serviceImage, setServiceImage] = useState(null);

  const [bookings, setBookings] = useState([]);
  const [bookingDateStart, setBookingDateStart] = useState(new Date().toISOString().split('T')[0]);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookingStatus, setBookingStatus] = useState('');
  const [bookingSpecialist, setBookingSpecialist] = useState('');

  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientBookings, setClientBookings] = useState([]);

  const [showManualBooking, setShowManualBooking] = useState(false);
  const [manualBookingForm, setManualBookingForm] = useState({ booking_date: '', start_time: '', end_time: '', client_name: '', client_phone: '', specialist_id: '', service_id: '', notes: '' });
  const [savingManualBooking, setSavingManualBooking] = useState(false);

  const [svcNotifs, setSvcNotifs] = useState([]);
  const [editingSvcNotif, setEditingSvcNotif] = useState(null);
  const [svcNotifForm, setSvcNotifForm] = useState({ message_text: '', is_active: 1 });
  const [savingSvcNotif, setSavingSvcNotif] = useState(false);

  const [settings, setSettings] = useState({ primary_color: '#4F46E5', welcome_text: '', min_booking_hours: 2, slot_step_minutes: 30 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [coverImage, setCoverImage] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const loadBranches = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/services/${tc}/branches`);
      if (data.success) setBranches(data.branches || []);
    } catch {}
  }, [tc]);

  const loadSpecialists = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/services/${tc}/specialists`);
      if (data.success) setSpecialists(data.specialists || []);
    } catch {}
  }, [tc]);

  const loadCategories = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/services/${tc}/categories`);
      if (data.success) setCategories(data.categories || []);
    } catch {}
  }, [tc]);

  const loadServices = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/services/${tc}/services`);
      if (data.success) setServices(data.services || []);
    } catch {}
  }, [tc]);

  const loadBookings = useCallback(async () => {
    if (!tc) return;
    try {
      const startD = new Date(bookingDateStart + 'T00:00:00');
      const endD = new Date(startD);
      endD.setDate(endD.getDate() + 6);
      const endStr = endD.toISOString().split('T')[0];
      let url = `/services/${tc}/bookings?date_from=${bookingDateStart}&date_to=${endStr}`;
      if (bookingStatus) url += `&status=${bookingStatus}`;
      if (bookingSpecialist) url += `&specialist_id=${bookingSpecialist}`;
      const data = await api.get(url);
      if (data.success) setBookings(data.bookings || []);
    } catch {}
  }, [tc, bookingDateStart, bookingStatus, bookingSpecialist]);

  const loadClients = useCallback(async () => {
    if (!tc) return;
    try {
      let url = `/services/${tc}/clients`;
      if (clientSearch) url += `?search=${encodeURIComponent(clientSearch)}`;
      const data = await api.get(url);
      if (data.success) setClients(data.clients || []);
    } catch {}
  }, [tc, clientSearch]);

  const loadClientBookings = useCallback(async (client) => {
    if (!tc || !client) return;
    try {
      const qp = [];
      if (client.client_phone) qp.push(`phone=${encodeURIComponent(client.client_phone)}`);
      if (client.client_name) qp.push(`name=${encodeURIComponent(client.client_name)}`);
      const data = await api.get(`/services/${tc}/client-bookings?${qp.join('&')}`);
      if (data.success) setClientBookings(data.bookings || []);
    } catch {}
  }, [tc]);

  const loadSvcNotifs = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/services/${tc}/notification-templates`);
      if (data.success) setSvcNotifs(data.templates || []);
    } catch {}
  }, [tc]);

  const loadSettings = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/services/${tc}/settings`);
      if (data.success && data.settings) setSettings(data.settings);
    } catch {}
  }, [tc]);

  useEffect(() => {
    if (tab === 'branches') loadBranches();
    if (tab === 'specialists') { loadSpecialists(); loadBranches(); loadServices(); }
    if (tab === 'services') { loadServices(); loadCategories(); }
    if (tab === 'bookings') { loadBookings(); loadSpecialists(); loadServices(); }
    if (tab === 'clients') loadClients();
    if (tab === 'notifications') loadSvcNotifs();
    if (tab === 'appearance') loadSettings();
  }, [tab, tc]);

  useEffect(() => { if (tab === 'bookings') loadBookings(); }, [bookingDateStart, bookingStatus, bookingSpecialist]);

  const saveBranch = async () => {
    if (branchForm.manager_contact_url && !branchForm.manager_contact_url.startsWith('https://t.me/') && !branchForm.manager_contact_url.startsWith('https://max.ru/')) {
      showToast('Ссылка менеджера должна начинаться с https://t.me/ или https://max.ru/', 'error');
      return;
    }
    setSavingBranch(true);
    try {
      const payload = { ...branchForm, buffer_time: parseInt(branchForm.buffer_time) || 0 };
      if (editingBranch) {
        await api.put(`/services/${tc}/branches/${editingBranch.id}`, payload);
        showToast('Филиал обновлён');
      } else {
        await api.post(`/services/${tc}/branches`, payload);
        showToast('Филиал создан');
      }
      setShowBranchModal(false);
      loadBranches();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingBranch(false); }
  };

  const saveSpecialist = async () => {
    setSavingSpecialist(true);
    try {
      const payload = { ...specialistForm, max_bookings_per_day: parseInt(specialistForm.max_bookings_per_day) || 10 };
      if (payload.branch_id) payload.branch_id = parseInt(payload.branch_id);
      else delete payload.branch_id;
      let specId;
      if (editingSpecialist) {
        await api.put(`/services/${tc}/specialists/${editingSpecialist.id}`, payload);
        specId = editingSpecialist.id;
        showToast('Специалист обновлён');
      } else {
        const r = await api.post(`/services/${tc}/specialists`, payload);
        specId = r.id;
        showToast('Специалист добавлен');
      }
      if (specialistPhoto && specId) {
        const fd = new FormData();
        fd.append('file', specialistPhoto);
        await api.upload(`/services/${tc}/specialists/${specId}/photo`, fd);
      }
      if (specId) {
        await api.post(`/services/${tc}/specialists/${specId}/services`, {
          service_ids: specialistServices,
          custom_prices: specialistCustomPrices,
        });
      }
      setShowSpecialistModal(false);
      setSpecialistPhoto(null);
      loadSpecialists();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingSpecialist(false); }
  };

  const loadSpecialistServices = async (specId) => {
    try {
      const data = await api.get(`/services/${tc}/specialists/${specId}/services`);
      if (data.success) {
        setSpecialistServices((data.services || []).map(s => s.id));
        const prices = {};
        (data.services || []).forEach(s => { if (s.custom_price) prices[s.id] = s.custom_price; });
        setSpecialistCustomPrices(prices);
      }
    } catch {}
  };

  const saveService = async () => {
    setSavingService(true);
    try {
      const payload = {
        ...serviceForm,
        duration_minutes: parseInt(serviceForm.duration_minutes) || 60,
        price: parseFloat(serviceForm.price) || 0,
        max_participants: parseInt(serviceForm.max_participants) || 1,
        cancel_hours: parseInt(serviceForm.cancel_hours) || 24,
      };
      if (payload.category_id) payload.category_id = parseInt(payload.category_id);
      else delete payload.category_id;
      let svcId;
      if (editingService) {
        await api.put(`/services/${tc}/services/${editingService.id}`, payload);
        svcId = editingService.id;
        showToast('Услуга обновлена');
      } else {
        const r = await api.post(`/services/${tc}/services`, payload);
        svcId = r.id;
        showToast('Услуга создана');
      }
      if (serviceImage && svcId) {
        const fd = new FormData();
        fd.append('file', serviceImage);
        await api.upload(`/services/${tc}/services/${svcId}/image`, fd);
      }
      setShowServiceModal(false);
      setServiceImage(null);
      loadServices();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingService(false); }
  };

  const updateBookingStatus = async (id, status) => {
    try {
      await api.put(`/services/${tc}/bookings/${id}`, { status });
      showToast(`Статус: ${STATUS_LABELS[status]}`);
      loadBookings();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.post(`/services/${tc}/settings`, settings);
      showToast('Настройки сохранены');
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingSettings(false); }
  };

  if (!tc) return <Paywall><div /></Paywall>;

  const btnSmall = { padding: '6px 14px', fontSize: '0.82rem' };

  const tabs = [
    { id: 'branches', label: 'Филиалы', count: branches.length || null },
    { id: 'specialists', label: 'Специалисты', count: specialists.length || null },
    { id: 'services', label: 'Услуги', count: services.length || null },
    { id: 'bookings', label: 'Бронирования', count: bookings.length || null },
    { id: 'clients', label: 'Клиенты', count: clients.length || null },
    { id: 'notifications', label: 'Уведомления', count: null },
    { id: 'payment', label: 'Оплата', count: null },
    { id: 'appearance', label: 'Внешний вид', count: null },
  ];

  const headerCta = (() => {
    switch (tab) {
      case 'branches':      return { label: 'Добавить филиал',       action: () => { setEditingBranch(null); setBranchForm({ name: '', city: '', address: '', phone: '', email: '', buffer_time: 0, working_hours: {} }); setShowBranchModal(true); } };
      case 'specialists':   return { label: 'Добавить специалиста',  action: () => { setEditingSpecialist(null); setSpecialistForm({ name: '', position: '', phone: '', email: '', branch_id: '', description: '', max_bookings_per_day: 10, working_hours: {} }); setSpecialistPhoto(null); setSpecialistServices([]); setSpecialistCustomPrices({}); setShowSpecialistModal(true); }, disabled: branches.length === 0 };
      case 'services':      return { label: 'Добавить услугу',       action: () => { setEditingService(null); setServiceForm({ name: '', description: '', category_id: '', service_type: 'single', duration_minutes: 60, price: '', max_participants: 1, cancel_hours: 24, color: '#4F46E5' }); setServiceImage(null); setShowServiceModal(true); } };
      case 'bookings':      return { label: 'Создать запись',        action: () => setShowManualBooking(true), disabled: specialists.length === 0 || services.length === 0 };
      default:              return null;
    }
  })();

  const renderTab = () => {
    if (tab === 'branches') {
      return (
        <BranchesTab
          branches={branches} tc={tc} showToast={showToast} loadBranches={loadBranches} btnSmall={btnSmall}
          showBranchModal={showBranchModal} setShowBranchModal={setShowBranchModal}
          editingBranch={editingBranch} setEditingBranch={setEditingBranch}
          branchForm={branchForm} setBranchForm={setBranchForm}
          savingBranch={savingBranch} saveBranch={saveBranch}
          currentChannel={currentChannel}
        />
      );
    }
    if (tab === 'specialists') {
      return (
        <SpecialistsTab
          specialists={specialists} branches={branches} services={services} tc={tc} showToast={showToast}
          loadSpecialists={loadSpecialists} loadSpecialistServices={loadSpecialistServices} btnSmall={btnSmall}
          showSpecialistModal={showSpecialistModal} setShowSpecialistModal={setShowSpecialistModal}
          editingSpecialist={editingSpecialist} setEditingSpecialist={setEditingSpecialist}
          specialistForm={specialistForm} setSpecialistForm={setSpecialistForm}
          specialistPhoto={specialistPhoto} setSpecialistPhoto={setSpecialistPhoto}
          specialistServices={specialistServices} setSpecialistServices={setSpecialistServices}
          specialistCustomPrices={specialistCustomPrices} setSpecialistCustomPrices={setSpecialistCustomPrices}
          savingSpecialist={savingSpecialist} saveSpecialist={saveSpecialist}
        />
      );
    }
    if (tab === 'services') {
      return (
        <ServicesListTab
          services={services} categories={categories} tc={tc} showToast={showToast}
          loadServices={loadServices} loadCategories={loadCategories} btnSmall={btnSmall}
          showServiceModal={showServiceModal} setShowServiceModal={setShowServiceModal}
          editingService={editingService} setEditingService={setEditingService}
          serviceForm={serviceForm} setServiceForm={setServiceForm}
          serviceImage={serviceImage} setServiceImage={setServiceImage}
          savingService={savingService} saveService={saveService}
          showCategoryModal={showCategoryModal} setShowCategoryModal={setShowCategoryModal}
          categoryForm={categoryForm} setCategoryForm={setCategoryForm}
        />
      );
    }
    if (tab === 'bookings') {
      return (
        <BookingsTab
          bookings={bookings} specialists={specialists} services={services} tc={tc} showToast={showToast} btnSmall={btnSmall}
          bookingDateStart={bookingDateStart} setBookingDateStart={setBookingDateStart}
          bookingStatus={bookingStatus} setBookingStatus={setBookingStatus}
          bookingSpecialist={bookingSpecialist} setBookingSpecialist={setBookingSpecialist}
          updateBookingStatus={updateBookingStatus} loadBookings={loadBookings}
          showManualBooking={showManualBooking} setShowManualBooking={setShowManualBooking}
          manualBookingForm={manualBookingForm} setManualBookingForm={setManualBookingForm}
          savingManualBooking={savingManualBooking} setSavingManualBooking={setSavingManualBooking}
        />
      );
    }
    if (tab === 'clients') {
      return (
        <ClientsTab
          clients={clients} clientSearch={clientSearch} setClientSearch={setClientSearch} loadClients={loadClients}
          selectedClient={selectedClient} setSelectedClient={setSelectedClient}
          clientBookings={clientBookings} setClientBookings={setClientBookings} loadClientBookings={loadClientBookings}
        />
      );
    }
    if (tab === 'notifications') {
      return (
        <SvcNotificationsTab
          svcNotifs={svcNotifs} tc={tc} showToast={showToast} loadSvcNotifs={loadSvcNotifs}
          editingSvcNotif={editingSvcNotif} setEditingSvcNotif={setEditingSvcNotif}
          svcNotifForm={svcNotifForm} setSvcNotifForm={setSvcNotifForm}
          savingSvcNotif={savingSvcNotif} setSavingSvcNotif={setSavingSvcNotif}
        />
      );
    }
    if (tab === 'payment') {
      return <PaymentTab tc={tc} showToast={showToast} currentChannel={currentChannel} />;
    }
    if (tab === 'appearance') {
      return (
        <AppearanceTab
          settings={settings} setSettings={setSettings} tc={tc} showToast={showToast}
          saveSettings={saveSettings} savingSettings={savingSettings}
          coverImage={coverImage} setCoverImage={setCoverImage}
          uploadingCover={uploadingCover} setUploadingCover={setUploadingCover}
          currentChannel={currentChannel}
        />
      );
    }
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
        .svp-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .svp-primary[disabled] {
          opacity: 0.55; cursor: not-allowed; transform: none !important; box-shadow: 0 2px 8px ${ACCENT}25 !important;
        }
        .svp-tab {
          flex: 0 0 auto;
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 18px; border-radius: 10px; cursor: pointer;
          background: transparent; border: none;
          color: ${DARK}; font-size: 0.88rem; font-weight: 600;
          letter-spacing: -0.005em;
          transition: all .15s ease;
          white-space: nowrap;
        }
        .svp-tab:hover:not(.active) {
          background: rgba(67,97,238,0.06);
          color: ${ACCENT};
        }
        .svp-tab.active {
          color: #fff;
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          box-shadow: 0 4px 14px ${ACCENT}40;
        }
        .svp-tab-count {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
          font-size: 0.68rem; font-weight: 700; letter-spacing: -0.01em;
          background: rgba(67,97,238,0.10); color: ${ACCENT};
          transition: all .18s ease;
        }
        .svp-tab.active .svp-tab-count {
          background: rgba(255,255,255,0.22);
          color: #fff;
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
                Сервисы и запись
              </div>
              <h1 style={pageTitleStyle}>Услуги и запись</h1>
              <p style={pageSubStyle}>
                Онлайн-запись клиентов: филиалы, специалисты, оплата
              </p>
            </div>
            {headerCta && (
              <button
                className="svp-primary"
                style={primaryBtn}
                onClick={headerCta.action}
                disabled={headerCta.disabled}
                title={headerCta.disabled ? 'Сначала добавьте необходимые сущности' : ''}
              >
                <PlusIcon />
                {headerCta.label}
              </button>
            )}
          </div>
        </section>

        <div style={{
          display: 'flex', gap: 8, padding: 6, background: SOFT_BG,
          borderRadius: 14, marginBottom: 24, overflowX: 'auto',
        }}>
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                data-tour-page={t.id === 'branches' ? 'branches-tab' : t.id === 'specialists' ? 'specialists-tab' : undefined}
                className={`svp-tab${active ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.count != null && <span className="svp-tab-count">{t.count}</span>}
              </button>
            );
          })}
        </div>

        <div style={{ animation: 'dashFadeUp 0.4s ease 0.05s both' }}>
          {renderTab()}
        </div>
      </div>
    </Paywall>
  );
}
