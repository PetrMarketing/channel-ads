import { useState, useEffect, useCallback, useRef } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import BroadcastList from './broadcasts/BroadcastList';
import BroadcastModal from './broadcasts/BroadcastModal';

function defaultFilterValue(type) {
  if (type === 'lead_magnet') return { lead_magnet_id: '' };
  if (type === 'registration_date') return { date: '', direction: 'before' };
  if (type === 'giveaway_participant') return { giveaway_id: '' };
  return {};
}

function scrollToRef(ref) {
  if (ref?.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current.classList.add('field-shake');
    setTimeout(() => ref.current.classList.remove('field-shake'), 500);
  }
}

export default function BroadcastsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [broadcasts, setBroadcasts] = useState([]);
  const [leadMagnets, setLeadMagnets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingBc, setEditingBc] = useState(null);
  const [form, setForm] = useState({
    title: '', message_text: '', target_type: 'all_leads',
    target_lead_magnet_id: '', scheduled_at: '', inline_buttons: '', attach_type: '',
  });
  const [filterRules, setFilterRules] = useState([]);
  const [bcFile, setBcFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recipientCount, setRecipientCount] = useState(null);
  const [addFilterType, setAddFilterType] = useState('');
  const [giveaways, setGiveaways] = useState([]);
  const [errors, setErrors] = useState({});
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [modalTab, setModalTab] = useState('edit'); // 'edit' | 'preview'
  const [showEditSentModal, setShowEditSentModal] = useState(false);
  const [editSentBc, setEditSentBc] = useState(null);
  const [editSentText, setEditSentText] = useState('');
  const [editSentSaving, setEditSentSaving] = useState(false);

  const messageRef = useRef(null);
  const dropdownRef = useRef(null);

  const tc = currentChannel?.tracking_code;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadBroadcasts = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/broadcasts/${tc}`);
      if (data.success) setBroadcasts(data.broadcasts || []);
    } catch {
      showToast('Ошибка загрузки рассылок', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  const loadLeadMagnets = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/broadcasts/${tc}/lead-magnets`);
      if (data.success) setLeadMagnets(data.leadMagnets || []);
    } catch {}
  }, [tc]);

  const loadGiveaways = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/giveaways/${tc}`);
      if (data.success) setGiveaways(data.giveaways || []);
    } catch {}
  }, [tc]);

  useEffect(() => { loadBroadcasts(); loadLeadMagnets(); loadGiveaways(); }, [loadBroadcasts, loadLeadMagnets, loadGiveaways]);

  const resetForm = () => {
    setForm({ title: '', message_text: '', target_type: 'all_leads', target_lead_magnet_id: '', scheduled_at: '', inline_buttons: '', attach_type: '' });
    setFilterRules([]);
    setBcFile(null);
    setAddFilterType('');
    setErrors({});
    setModalTab('edit');
  };

  const loadRecipientCount = useCallback(async (bcId, rules) => {
    if (!tc) return;
    try {
      if (rules && rules.length > 0) {
        const data = await api.post(`/broadcasts/${tc}/count-recipients`, { filter_rules: rules });
        if (data.success) setRecipientCount(data.count);
      } else if (bcId) {
        const data = await api.get(`/broadcasts/${tc}/${bcId}/recipients-count`);
        if (data.success) setRecipientCount(data.count);
      } else {
        const data = await api.get(`/broadcasts/${tc}/total-recipients`);
        if (data.success) setRecipientCount(data.leads || 0);
      }
    } catch { setRecipientCount(null); }
  }, [tc]);

  // Recount when filters change
  useEffect(() => {
    if (!showModal) return;
    loadRecipientCount(editingBc?.id, filterRules);
  }, [filterRules, showModal]);

  const openCreate = () => {
    setEditingBc(null);
    resetForm();
    setRecipientCount(null);
    setShowModal(true);
    loadRecipientCount(null);
  };

  const openEdit = (bc) => {
    setEditingBc(bc);
    let btns = '';
    if (bc.inline_buttons) {
      try { btns = typeof bc.inline_buttons === 'string' ? bc.inline_buttons : JSON.stringify(bc.inline_buttons); } catch {}
    }
    let rules = [];
    if (bc.filter_rules) {
      try { rules = typeof bc.filter_rules === 'string' ? JSON.parse(bc.filter_rules) : bc.filter_rules; } catch {}
    }
    setForm({
      title: bc.title || '',
      message_text: bc.message_text || '',
      target_type: bc.target_type || 'all_leads',
      target_lead_magnet_id: bc.target_lead_magnet_id || '',
      scheduled_at: bc.scheduled_at ? bc.scheduled_at.slice(0, 16) : '',
      inline_buttons: btns,
      attach_type: bc.attach_type || '',
    });
    setFilterRules(Array.isArray(rules) ? rules : []);
    setBcFile(null);
    setAddFilterType('');
    setErrors({});
    setModalTab('edit');
    setRecipientCount(bc.total_count || null);
    setShowModal(true);
    loadRecipientCount(bc.id);
  };

  const deriveTargetType = (rules) => {
    if (!rules || rules.length === 0) return 'all_leads';
    if (rules.length === 1 && rules[0].type === 'lead_magnet' && !rules[0].negate && rules[0].value?.lead_magnet_id) {
      return 'specific_lead_magnet';
    }
    return 'custom_filter';
  };

  const validate = () => {
    const newErrors = {};
    if (!form.message_text.trim()) newErrors.message_text = 'Текст сообщения обязателен';
    setErrors(newErrors);
    if (newErrors.message_text) { scrollToRef(messageRef); }
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const defaultTitle = form.title.trim() || `Рассылка от ${new Date().toLocaleDateString('ru-RU')}`;
      const payload = {
        title: defaultTitle,
        message_text: form.message_text,
        target_type: deriveTargetType(filterRules),
        target_lead_magnet_id: form.target_lead_magnet_id || null,
        scheduled_at: form.scheduled_at || null,
        filter_rules: filterRules.length > 0 ? JSON.stringify(filterRules) : null,
        attach_type: form.attach_type || null,
      };

      if (form.inline_buttons && form.inline_buttons.trim()) {
        try { payload.inline_buttons = JSON.parse(form.inline_buttons); } catch {
          showToast('Неверный формат JSON для кнопок', 'error');
          setSaving(false);
          return;
        }
      }

      let data;
      if (bcFile) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          if (v !== null && v !== undefined) {
            fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
          }
        });
        fd.append('file', bcFile);
        if (editingBc) {
          data = await api.upload(`/broadcasts/${tc}/${editingBc.id}`, fd);
        } else {
          data = await api.upload(`/broadcasts/${tc}`, fd);
        }
      } else {
        if (editingBc) {
          data = await api.put(`/broadcasts/${tc}/${editingBc.id}`, payload);
        } else {
          data = await api.post(`/broadcasts/${tc}`, payload);
        }
      }

      if (data.success) {
        showToast(editingBc ? 'Рассылка обновлена' : 'Рассылка создана');
        setShowModal(false);
        loadBroadcasts();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!editingBc) {
      showToast('Сначала сохраните рассылку', 'error');
      return;
    }
    try {
      const data = await api.post(`/broadcasts/${tc}/${editingBc.id}/send-test`);
      if (data.success) {
        showToast('Тестовое сообщение отправлено');
      } else {
        showToast(data.error || 'Ошибка отправки', 'error');
      }
    } catch {
      showToast('Ошибка отправки тестового сообщения', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить рассылку?')) return;
    try {
      const data = await api.delete(`/broadcasts/${tc}/${id}`);
      if (data.success) { showToast('Рассылка удалена'); loadBroadcasts(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handleSend = async (bc) => {
    if (!window.confirm('Отправить рассылку сейчас?')) return;
    try {
      const data = await api.post(`/broadcasts/${tc}/${bc.id}/send`);
      if (data.success) {
        showToast(`Отправка начата (${data.total} получателей)`);
        loadBroadcasts();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch { showToast('Ошибка отправки', 'error'); }
  };

  const handleCopy = async (bc) => {
    try {
      const data = await api.post(`/broadcasts/${tc}/${bc.id}/copy`);
      if (data.success) {
        showToast('Рассылка скопирована');
        loadBroadcasts();
      } else {
        showToast(data.error || 'Ошибка копирования', 'error');
      }
    } catch {
      showToast('Ошибка копирования', 'error');
    }
  };

  const handleStats = async (bc) => {
    try {
      const data = await api.get(`/broadcasts/${tc}/${bc.id}/stats`);
      if (data.success) {
        setStatsData({ ...data, title: bc.title || `Рассылка #${bc.id}` });
        setShowStatsModal(true);
      } else {
        showToast(data.error || 'Ошибка загрузки статистики', 'error');
      }
    } catch {
      showToast('Ошибка загрузки статистики', 'error');
    }
  };

  const handleEditSentOpen = (bc) => {
    setEditSentBc(bc);
    setEditSentText(bc.message_text || '');
    setShowEditSentModal(true);
  };

  const handleEditSentSubmit = async () => {
    if (!editSentText.trim()) {
      showToast('Введите текст сообщения', 'error');
      return;
    }
    setEditSentSaving(true);
    try {
      const data = await api.post(`/broadcasts/${tc}/${editSentBc.id}/edit-sent`, { message_text: editSentText });
      if (data.success) {
        showToast(`Отредактировано: ${data.edited}, ошибок: ${data.failed}`);
        setShowEditSentModal(false);
        loadBroadcasts();
      } else {
        showToast(data.error || 'Ошибка редактирования', 'error');
      }
    } catch {
      showToast('Ошибка редактирования отправленных', 'error');
    } finally {
      setEditSentSaving(false);
    }
  };

  const handleDeleteSent = async (bc) => {
    if (!window.confirm('Удалить все отправленные сообщения этой рассылки у получателей?')) return;
    try {
      const data = await api.post(`/broadcasts/${tc}/${bc.id}/delete-sent`);
      if (data.success) {
        showToast(`Удалено: ${data.deleted}, ошибок: ${data.failed}`);
      } else {
        showToast(data.error || 'Ошибка удаления', 'error');
      }
    } catch {
      showToast('Ошибка удаления отправленных', 'error');
    }
  };

  /* --- Filter rules helpers --- */
  const addFilter = () => {
    if (!addFilterType) return;
    setFilterRules(prev => [...prev, { type: addFilterType, value: defaultFilterValue(addFilterType), negate: false }]);
    setAddFilterType('');
  };

  const updateFilter = (idx, patch) => {
    setFilterRules(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const updateFilterValue = (idx, valPatch) => {
    setFilterRules(prev => prev.map((r, i) => i === idx ? { ...r, value: { ...r.value, ...valPatch } } : r));
  };

  const removeFilter = (idx) => {
    setFilterRules(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <Paywall>
      <div>
        <BroadcastList
          loading={loading}
          broadcasts={broadcasts}
          openDropdownId={openDropdownId}
          setOpenDropdownId={setOpenDropdownId}
          dropdownRef={dropdownRef}
          onEdit={openEdit}
          onSend={handleSend}
          onDelete={handleDelete}
          onStats={handleStats}
          onCopy={handleCopy}
          onEditSentOpen={handleEditSentOpen}
          onDeleteSent={handleDeleteSent}
          onCreateClick={openCreate}
        />

        <BroadcastModal
          showModal={showModal}
          setShowModal={setShowModal}
          editingBc={editingBc}
          form={form}
          setForm={setForm}
          errors={errors}
          setErrors={setErrors}
          filterRules={filterRules}
          updateFilter={updateFilter}
          updateFilterValue={updateFilterValue}
          removeFilter={removeFilter}
          addFilterType={addFilterType}
          setAddFilterType={setAddFilterType}
          addFilter={addFilter}
          bcFile={bcFile}
          setBcFile={setBcFile}
          recipientCount={recipientCount}
          leadMagnets={leadMagnets}
          giveaways={giveaways}
          modalTab={modalTab}
          setModalTab={setModalTab}
          messageRef={messageRef}
          saving={saving}
          handleSave={handleSave}
          handleSendTest={handleSendTest}
          showStatsModal={showStatsModal}
          setShowStatsModal={setShowStatsModal}
          statsData={statsData}
          showEditSentModal={showEditSentModal}
          setShowEditSentModal={setShowEditSentModal}
          editSentBc={editSentBc}
          editSentText={editSentText}
          setEditSentText={setEditSentText}
          editSentSaving={editSentSaving}
          handleEditSentSubmit={handleEditSentSubmit}
        />
      </div>
    </Paywall>
  );
}
