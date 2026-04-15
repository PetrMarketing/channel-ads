import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import Paywall from '../components/Paywall';
import { STATUS_LABELS } from './services/constants';
import BranchesTab from './services/BranchesTab';
import SpecialistsTab from './services/SpecialistsTab';
import ServicesListTab from './services/ServicesListTab';
import BookingsTab from './services/BookingsTab';
import ClientsTab from './services/ClientsTab';
import SvcNotificationsTab from './services/SvcNotificationsTab';
import AppearanceTab from './services/AppearanceTab';
import PaymentTab from './services/PaymentTab';

export default function ServicesPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;

  const [tab, setTab] = useState('branches');
  const [loading, setLoading] = useState(false);

  // Branches
  const [branches, setBranches] = useState([]);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchForm, setBranchForm] = useState({ name: '', city: '', address: '', phone: '', email: '', buffer_time: 0, working_hours: {} });
  const [savingBranch, setSavingBranch] = useState(false);

  // Specialists
  const [specialists, setSpecialists] = useState([]);
  const [showSpecialistModal, setShowSpecialistModal] = useState(false);
  const [editingSpecialist, setEditingSpecialist] = useState(null);
  const [specialistForm, setSpecialistForm] = useState({ name: '', position: '', phone: '', email: '', branch_id: '', description: '', max_bookings_per_day: 10, working_hours: {} });
  const [savingSpecialist, setSavingSpecialist] = useState(false);
  const [specialistPhoto, setSpecialistPhoto] = useState(null);
  const [specialistServices, setSpecialistServices] = useState([]);
  const [specialistCustomPrices, setSpecialistCustomPrices] = useState({});

  // Categories
  const [categories, setCategories] = useState([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', parent_id: '' });

  // Services
  const [services, setServices] = useState([]);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', category_id: '', service_type: 'single', duration_minutes: 60, price: '', max_participants: 1, cancel_hours: 24, color: '#4F46E5' });
  const [savingService, setSavingService] = useState(false);
  const [serviceImage, setServiceImage] = useState(null);

  // Bookings
  const [bookings, setBookings] = useState([]);
  const [bookingDateStart, setBookingDateStart] = useState(new Date().toISOString().split('T')[0]);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookingStatus, setBookingStatus] = useState('');
  const [bookingSpecialist, setBookingSpecialist] = useState('');
  // Clients
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientBookings, setClientBookings] = useState([]);

  const [showManualBooking, setShowManualBooking] = useState(false);
  const [manualBookingForm, setManualBookingForm] = useState({ booking_date: '', start_time: '', end_time: '', client_name: '', client_phone: '', specialist_id: '', service_id: '', notes: '' });
  const [savingManualBooking, setSavingManualBooking] = useState(false);

  // Notifications
  const [svcNotifs, setSvcNotifs] = useState([]);
  const [editingSvcNotif, setEditingSvcNotif] = useState(null);
  const [svcNotifForm, setSvcNotifForm] = useState({ message_text: '', is_active: 1 });
  const [savingSvcNotif, setSavingSvcNotif] = useState(false);

  // Settings
  const [settings, setSettings] = useState({ primary_color: '#4F46E5', welcome_text: '', min_booking_hours: 2, slot_step_minutes: 30 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [coverImage, setCoverImage] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const tabs = [
    { id: 'branches', label: 'Филиалы' },
    { id: 'specialists', label: 'Специалисты' },
    { id: 'services', label: 'Услуги' },
    { id: 'bookings', label: 'Бронирования' },
    { id: 'clients', label: 'Клиенты' },
    { id: 'notifications', label: 'Уведомления' },
    { id: 'payment', label: 'Оплата' },
    { id: 'appearance', label: 'Внешний вид' },
  ];

  // Loaders
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
      // Load 7 days for calendar view
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

  // Branch CRUD
  const saveBranch = async () => {
    // Validate manager contact URL
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

  // Specialist CRUD
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
      // Upload photo if selected
      if (specialistPhoto && specId) {
        const fd = new FormData();
        fd.append('file', specialistPhoto);
        await api.upload(`/services/${tc}/specialists/${specId}/photo`, fd);
      }
      // Save specialist services
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

  // Service CRUD
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

  // Booking status update
  const updateBookingStatus = async (id, status) => {
    try {
      await api.put(`/services/${tc}/bookings/${id}`, { status });
      showToast(`Статус: ${STATUS_LABELS[status]}`);
      loadBookings();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  // Settings save
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

  return (
    <Paywall>
    <div>
      <div className="page-header"><h1>Услуги и запись</h1></div>

      {/* Tabs */}
      <div className="pc-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`pc-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'branches' && (
        <BranchesTab
          branches={branches} tc={tc} showToast={showToast} loadBranches={loadBranches} btnSmall={btnSmall}
          showBranchModal={showBranchModal} setShowBranchModal={setShowBranchModal}
          editingBranch={editingBranch} setEditingBranch={setEditingBranch}
          branchForm={branchForm} setBranchForm={setBranchForm}
          savingBranch={savingBranch} saveBranch={saveBranch}
          currentChannel={currentChannel}
        />
      )}

      {tab === 'specialists' && (
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
      )}

      {tab === 'services' && (
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
      )}

      {tab === 'bookings' && (
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
      )}

      {tab === 'clients' && (
        <ClientsTab
          clients={clients} clientSearch={clientSearch} setClientSearch={setClientSearch} loadClients={loadClients}
          selectedClient={selectedClient} setSelectedClient={setSelectedClient}
          clientBookings={clientBookings} setClientBookings={setClientBookings} loadClientBookings={loadClientBookings}
        />
      )}

      {tab === 'notifications' && (
        <SvcNotificationsTab
          svcNotifs={svcNotifs} tc={tc} showToast={showToast} loadSvcNotifs={loadSvcNotifs}
          editingSvcNotif={editingSvcNotif} setEditingSvcNotif={setEditingSvcNotif}
          svcNotifForm={svcNotifForm} setSvcNotifForm={setSvcNotifForm}
          savingSvcNotif={savingSvcNotif} setSavingSvcNotif={setSavingSvcNotif}
        />
      )}

      {tab === 'payment' && <PaymentTab tc={tc} showToast={showToast} currentChannel={currentChannel} />}

      {tab === 'appearance' && (
        <AppearanceTab
          settings={settings} setSettings={setSettings} tc={tc} showToast={showToast}
          saveSettings={saveSettings} savingSettings={savingSettings}
          coverImage={coverImage} setCoverImage={setCoverImage}
          uploadingCover={uploadingCover} setUploadingCover={setUploadingCover}
          currentChannel={currentChannel}
        />
      )}
    </div>
    </Paywall>
  );
}
