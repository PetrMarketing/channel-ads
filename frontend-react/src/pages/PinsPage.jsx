import { useState, useEffect, useCallback } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import ButtonBuilder from '../components/ButtonBuilder';
import AttachmentPicker from '../components/AttachmentPicker';
import MessagePreview from '../components/MessagePreview';

const STATUS_LABELS = { draft: 'Черновик', published: 'Опубликован' };
const STATUS_COLORS = { draft: '#888', published: 'var(--success)' };

export default function PinsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [pins, setPins] = useState([]);
  const [leadMagnets, setLeadMagnets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showLmModal, setShowLmModal] = useState(false);
  const [editingPin, setEditingPin] = useState(null);
  const [editingLm, setEditingLm] = useState(null);
  const [pinForm, setPinForm] = useState({ title: '', message_text: '', lead_magnet_id: '', inline_buttons: '', attach_type: '' });
  const [pinFile, setPinFile] = useState(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [lmForm, setLmForm] = useState({ title: '', message_text: '', attach_type: '', subscribers_only: false });
  const [lmFile, setLmFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('pins');

  // Inline lead magnet creation state
  const [showInlineLm, setShowInlineLm] = useState(false);
  const [inlineLmForm, setInlineLmForm] = useState({ title: '', message_text: '', attach_type: '' });
  const [inlineLmFile, setInlineLmFile] = useState(null);

  const tc = currentChannel?.tracking_code;

  const loadPins = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/pins/${tc}`);
      if (data.success) setPins(data.pins || []);
    } catch {
      showToast('Ошибка загрузки пинов', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  const loadLeadMagnets = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/pins/${tc}/lead-magnets`);
      if (data.success) setLeadMagnets(data.leadMagnets || []);
    } catch {}
  }, [tc]);

  useEffect(() => { loadPins(); loadLeadMagnets(); }, [loadPins, loadLeadMagnets]);

  // Pin CRUD
  const openCreatePin = () => {
    setEditingPin(null);
    setPinForm({ title: '', message_text: '', lead_magnet_id: '', inline_buttons: '', attach_type: '' });
    setPinFile(null);
    setRemoveExistingFile(false);
    setShowInlineLm(false);
    setInlineLmForm({ title: '', message_text: '', attach_type: '' });
    setInlineLmFile(null);
    setShowPinModal(true);
  };

  const openEditPin = (pin) => {
    setEditingPin(pin);
    let btns = '';
    if (pin.inline_buttons) {
      try {
        btns = typeof pin.inline_buttons === 'string' ? pin.inline_buttons : JSON.stringify(pin.inline_buttons, null, 2);
      } catch { btns = ''; }
    }
    setPinForm({
      title: pin.title || '',
      message_text: pin.message_text || '',
      lead_magnet_id: pin.lead_magnet_id || '',
      inline_buttons: btns,
      attach_type: pin.attach_type || '',
    });
    setPinFile(null);
    setRemoveExistingFile(false);
    setShowInlineLm(false);
    setInlineLmForm({ title: '', message_text: '' });
    setInlineLmFile(null);
    setShowPinModal(true);
  };

  const handleSavePin = async () => {
    const title = pinForm.title.trim() || `Закреп от ${new Date().toLocaleDateString('ru-RU')}`;
    const formToSave = { ...pinForm, title };
    setSaving(true);
    setUploadProgress(0);
    try {
      let parsedButtons = null;
      if (formToSave.inline_buttons.trim()) {
        try {
          parsedButtons = JSON.parse(formToSave.inline_buttons);
        } catch {
          showToast('Неверный формат JSON для кнопок', 'error');
          setSaving(false);
          return;
        }
      }

      let data;
      if (pinFile) {
        const formData = new FormData();
        formData.append('title', formToSave.title);
        formData.append('message_text', formToSave.message_text);
        formData.append('lead_magnet_id', formToSave.lead_magnet_id || '');
        if (parsedButtons) {
          formData.append('inline_buttons', JSON.stringify(parsedButtons));
        }
        if (formToSave.attach_type) formData.append('attach_type', formToSave.attach_type);
        formData.append('file', pinFile);

        const progressCb = (p) => setUploadProgress(p);
        if (editingPin) {
          data = await api.upload(`/pins/${tc}/${editingPin.id}/upload`, formData, 'POST', progressCb);
        } else {
          data = await api.upload(`/pins/${tc}/upload`, formData, 'POST', progressCb);
        }
      } else {
        const payload = {
          title: formToSave.title,
          message_text: formToSave.message_text,
          lead_magnet_id: formToSave.lead_magnet_id || null,
        };
        if (parsedButtons) {
          payload.inline_buttons = parsedButtons;
        }
        if (formToSave.attach_type) payload.attach_type = formToSave.attach_type;
        if (removeExistingFile) payload.remove_file = true;
        if (editingPin) {
          data = await api.put(`/pins/${tc}/${editingPin.id}`, payload);
        } else {
          data = await api.post(`/pins/${tc}`, payload);
        }
      }

      if (data.success) {
        showToast(editingPin ? 'Пин обновлён' : 'Пин создан');
        setShowPinModal(false);
        setPinFile(null);
        loadPins();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleDeletePin = async (id) => {
    if (!window.confirm('Удалить пин?')) return;
    try {
      const data = await api.delete(`/pins/${tc}/${id}`);
      if (data.success) { showToast('Пин удалён'); loadPins(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handlePublishPin = async (pin) => {
    try {
      const data = await api.post(`/pins/${tc}/${pin.id}/publish`);
      if (data.success) { showToast('Пин опубликован и закреплён'); loadPins(); }
      else showToast(data.error || 'Ошибка публикации', 'error');
    } catch { showToast('Ошибка публикации', 'error'); }
  };

  const handleUnpinPin = async (pin) => {
    try {
      const data = await api.post(`/pins/${tc}/${pin.id}/unpin`);
      if (data.success) { showToast('Сообщение откреплено'); loadPins(); }
      else showToast(data.error || 'Ошибка', 'error');
    } catch { showToast('Ошибка', 'error'); }
  };

  // Lead magnet CRUD
  const openCreateLm = () => {
    setEditingLm(null);
    setLmForm({ title: '', message_text: '', attach_type: '', subscribers_only: false });
    setLmFile(null);
    setShowLmModal(true);
  };

  const openEditLm = (lm) => {
    setEditingLm(lm);
    setLmForm({ title: lm.title || '', message_text: lm.message_text || '', attach_type: lm.attach_type || '', subscribers_only: !!lm.subscribers_only });
    setLmFile(null);
    setShowLmModal(true);
  };

  const handleSaveLm = async () => {
    const lmTitle = lmForm.title.trim() || `Лид-магнит от ${new Date().toLocaleDateString('ru-RU')}`;
    setSaving(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('title', lmTitle);
      formData.append('message_text', lmForm.message_text);
      if (lmForm.attach_type) formData.append('attach_type', lmForm.attach_type);
      formData.append('subscribers_only', lmForm.subscribers_only ? 'true' : 'false');
      if (lmFile) formData.append('file', lmFile);

      const progressCb = lmFile ? (p) => setUploadProgress(p) : null;
      let data;
      if (editingLm) {
        data = await api.upload(`/pins/${tc}/lead-magnets/${editingLm.id}`, formData, 'PUT', progressCb);
      } else {
        data = await api.upload(`/pins/${tc}/lead-magnets`, formData, 'POST', progressCb);
      }
      if (data.success) {
        showToast(editingLm ? 'Лид-магнит обновлён' : 'Лид-магнит создан');
        setShowLmModal(false);
        setLmForm({ title: '', message_text: '', attach_type: '' });
        setLmFile(null);
        setEditingLm(null);
        loadLeadMagnets();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteLm = async (id) => {
    if (!window.confirm('Удалить лид-магнит? Связанные лиды тоже будут удалены.')) return;
    try {
      const data = await api.delete(`/pins/${tc}/lead-magnets/${id}`);
      if (data.success) { showToast('Лид-магнит удалён'); loadLeadMagnets(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  // Inline lead magnet creation (from pin modal)
  const handleCreateInlineLm = async () => {
    const inlineTitle = inlineLmForm.title.trim() || `Лид-магнит от ${new Date().toLocaleDateString('ru-RU')}`;
    setSaving(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('title', inlineTitle);
      formData.append('message_text', inlineLmForm.message_text);
      if (inlineLmForm.attach_type) formData.append('attach_type', inlineLmForm.attach_type);
      if (inlineLmFile) formData.append('file', inlineLmFile);

      const progressCb = inlineLmFile ? (p) => setUploadProgress(p) : null;
      const data = await api.upload(`/pins/${tc}/lead-magnets`, formData, 'POST', progressCb);
      if (data.success) {
        showToast('Лид-магнит создан');
        // Reload lead magnets and select the new one
        const lmData = await api.get(`/pins/${tc}/lead-magnets`);
        if (lmData.success) {
          const updatedLms = lmData.leadMagnets || [];
          setLeadMagnets(updatedLms);
          // Select the newly created lead magnet (first one — list is DESC by created_at)
          if (updatedLms.length > 0) {
            const newLm = updatedLms[0];
            setPinForm(p => ({ ...p, lead_magnet_id: String(newLm.id) }));
          }
        }
        setShowInlineLm(false);
        setInlineLmForm({ title: '', message_text: '', attach_type: '' });
        setInlineLmFile(null);
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Ошибка создания', 'error');
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleLeadMagnetDropdownChange = (val) => {
    if (val === 'create_new') {
      setShowInlineLm(true);
      setPinForm(p => ({ ...p, lead_magnet_id: '' }));
    } else {
      setShowInlineLm(false);
      setPinForm(p => ({ ...p, lead_magnet_id: val }));
    }
  };

  return (
    <Paywall>
      <div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '2px solid var(--border)', paddingBottom: '0' }}>
          <button
            style={{ ...tabStyle, borderBottomColor: activeTab === 'pins' ? 'var(--primary)' : 'transparent', color: activeTab === 'pins' ? 'var(--primary)' : 'var(--text-secondary)' }}
            onClick={() => setActiveTab('pins')}
          >
            Пин-посты
          </button>
          <button
            style={{ ...tabStyle, borderBottomColor: activeTab === 'magnets' ? 'var(--primary)' : 'transparent', color: activeTab === 'magnets' ? 'var(--primary)' : 'var(--text-secondary)' }}
            onClick={() => setActiveTab('magnets')}
          >
            Лид-магниты ({leadMagnets.length})
          </button>
        </div>

        {/* Pins Tab */}
        {activeTab === 'pins' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.1rem' }}>Пин-посты</h2>
              <button className="btn btn-primary" onClick={openCreatePin}>+ Создать пин</button>
            </div>
            {loading ? <Loading /> : pins.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                Нет пинов. Создайте первый пин-пост.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pins.map(pin => (
                  <div key={pin.id} style={{
                    background: 'var(--bg-glass)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{pin.title || 'Без названия'}</span>
                          <span style={{
                            fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px',
                            background: STATUS_COLORS[pin.status] || '#888', color: '#fff',
                          }}>
                            {STATUS_LABELS[pin.status] || pin.status || 'Черновик'}
                          </span>
                        </div>
                        <div
                          style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '6px', maxHeight: '80px', overflowY: 'auto', lineHeight: 1.5 }}
                          dangerouslySetInnerHTML={{ __html: pin.message_text || '' }}
                        />
                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {pin.lm_title && <span>Лид-магнит: {pin.lm_title}</span>}
                          {pin.published_at && <span>Опубликован: {new Date(pin.published_at).toLocaleString('ru-RU')}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button className="btn btn-outline" style={btnSmall} onClick={() => openEditPin(pin)}>Ред.</button>
                        <button className="btn btn-primary" style={btnSmall} onClick={() => handlePublishPin(pin)}>
                          {pin.status === 'published' ? 'Обновить' : 'Опубликовать'}
                        </button>
                        {pin.status === 'published' && (
                          <button className="btn btn-outline" style={btnSmall} onClick={() => handleUnpinPin(pin)}>
                            Открепить
                          </button>
                        )}
                        <button className="btn btn-danger" style={btnSmall} onClick={() => handleDeletePin(pin.id)}>Удалить</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Lead Magnets Tab */}
        {activeTab === 'magnets' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.1rem' }}>Лид-магниты</h2>
              <button className="btn btn-primary" onClick={openCreateLm}>
                + Создать лид-магнит
              </button>
            </div>
            {leadMagnets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                Нет лид-магнитов. Создайте первый.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {leadMagnets.map(lm => (
                  <div key={lm.id} style={{
                    background: 'var(--bg-glass)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{lm.title}</span>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          <span>Код: <code>{lm.code}</code></span>
                          {lm.file_type && <span>Файл: {lm.file_type}</span>}
                        </div>
                        {lm.message_text && (
                          <div
                            style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px', maxHeight: '60px', overflowY: 'auto', lineHeight: 1.5 }}
                            dangerouslySetInnerHTML={{ __html: lm.message_text }}
                          />
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-outline" style={btnSmall} onClick={() => openEditLm(lm)}>Ред.</button>
                        <button className="btn btn-danger" style={btnSmall} onClick={() => handleDeleteLm(lm.id)}>Удалить</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Pin Modal */}
        <Modal isOpen={showPinModal} onClose={() => setShowPinModal(false)} title={editingPin ? 'Редактировать пин' : 'Создать пин-пост'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Название *</label>
              <input className="form-input" placeholder="Закреп с лид-магнитом" value={pinForm.title}
                onChange={e => setPinForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Текст сообщения</label>
              <RichTextEditor
                value={pinForm.message_text}
                onChange={v => setPinForm(p => ({ ...p, message_text: v }))}
                placeholder="Текст закреплённого сообщения..."
                rows={5}
                showEmoji={true}
              />
            </div>
            <div>
              <label className="form-label">Вложение (опционально)</label>
              <AttachmentPicker
                file={pinFile}
                onFileChange={setPinFile}
                attachType={pinForm.attach_type}
                onAttachTypeChange={v => setPinForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={!removeExistingFile ? (editingPin?.file_type || '') : ''}
                existingFileUrl={!removeExistingFile && editingPin?.file_path ? '/uploads/' + editingPin.file_path.split('/uploads/').pop() : ''}
                onRemoveExisting={editingPin?.file_path ? () => setRemoveExistingFile(true) : undefined}
              />
            </div>
            <div>
              <label className="form-label">Лид-магнит (опционально)</label>
              <select className="form-input" value={showInlineLm ? 'create_new' : pinForm.lead_magnet_id}
                onChange={e => handleLeadMagnetDropdownChange(e.target.value)}>
                <option value="">— Без лид-магнита —</option>
                {leadMagnets.map(lm => (
                  <option key={lm.id} value={lm.id}>{lm.title} ({lm.code})</option>
                ))}
                <option value="create_new">+ Создать лид-магнит</option>
              </select>
              {!showInlineLm && leadMagnets.length === 0 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Нет лид-магнитов. Выберите «Создать лид-магнит» выше.
                </p>
              )}
              {showInlineLm && (
                <div style={{
                  marginTop: '10px', padding: '12px', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', background: 'var(--bg)',
                  display: 'flex', flexDirection: 'column', gap: '10px',
                }}>
                  <div>
                    <label className="form-label">Название лид-магнита *</label>
                    <input className="form-input" placeholder="Бесплатный PDF-гайд" value={inlineLmForm.title}
                      onChange={e => setInlineLmForm(p => ({ ...p, title: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Сообщение (текст при выдаче)</label>
                    <RichTextEditor
                      value={inlineLmForm.message_text}
                      onChange={v => setInlineLmForm(p => ({ ...p, message_text: v }))}
                      placeholder="Вот ваш гайд! Скачайте файл ниже."
                      rows={3}
                      showEmoji={true}
                    />
                  </div>
                  <div>
                    <label className="form-label">Вложение</label>
                    <AttachmentPicker
                      file={inlineLmFile}
                      onFileChange={setInlineLmFile}
                      attachType={inlineLmForm.attach_type}
                      onAttachTypeChange={v => setInlineLmForm(p => ({ ...p, attach_type: v }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" style={{ fontSize: '0.85rem' }} onClick={handleCreateInlineLm} disabled={saving}>
                      {saving ? 'Создание...' : 'Создать лид-магнит'}
                    </button>
                    <button className="btn btn-outline" style={{ fontSize: '0.85rem' }} onClick={() => setShowInlineLm(false)}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="form-label">Инлайн-кнопки (опционально)</label>
              <ButtonBuilder
                value={pinForm.inline_buttons}
                onChange={v => setPinForm(p => ({ ...p, inline_buttons: v }))}
                leadMagnets={leadMagnets}
                showLeadMagnet={true}
              />
            </div>
            {saving && uploadProgress > 0 && (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <span>Загрузка файла...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary)', borderRadius: '3px', transition: 'width 0.2s' }} />
                </div>
              </div>
            )}
            <MessagePreview
              messageText={pinForm.message_text}
              buttons={pinForm.inline_buttons}
              file={pinFile}
              fileUrl={!pinFile && !removeExistingFile && editingPin?.file_path ? '/uploads/' + editingPin.file_path.split('/uploads/').pop() : ''}
              tc={tc}
              entityType="pin"
              entityId={editingPin?.id}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowPinModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSavePin} disabled={saving}>
                {saving ? (uploadProgress > 0 ? `Загрузка ${uploadProgress}%` : 'Сохранение...') : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Lead Magnet Modal */}
        <Modal isOpen={showLmModal} onClose={() => setShowLmModal(false)} title={editingLm ? 'Редактировать лид-магнит' : 'Создать лид-магнит'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Название *</label>
              <input className="form-input" placeholder="Бесплатный PDF-гайд" value={lmForm.title}
                onChange={e => setLmForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Сообщение (текст при выдаче)</label>
              <RichTextEditor
                value={lmForm.message_text}
                onChange={v => setLmForm(p => ({ ...p, message_text: v }))}
                placeholder="Вот ваш гайд! Скачайте файл ниже."
                rows={3}
                showEmoji={true}
              />
            </div>
            <div>
              <label className="form-label">Вложение</label>
              <AttachmentPicker
                file={lmFile}
                onFileChange={setLmFile}
                attachType={lmForm.attach_type}
                onAttachTypeChange={v => setLmForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={editingLm?.file_type || ''}
              />
            </div>
            {saving && uploadProgress > 0 && (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <span>Загрузка файла...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary)', borderRadius: '3px', transition: 'width 0.2s' }} />
                </div>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={lmForm.subscribers_only}
                onChange={e => setLmForm(p => ({ ...p, subscribers_only: e.target.checked }))} />
              Выдавать только подписчикам канала
            </label>
            <MessagePreview
              messageText={lmForm.message_text}
              file={lmFile}
              tc={tc}
              entityType="lead_magnet"
              entityId={editingLm?.id}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowLmModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSaveLm} disabled={saving}>
                {saving ? (uploadProgress > 0 ? `Загрузка ${uploadProgress}%` : 'Сохранение...') : (editingLm ? 'Сохранить' : 'Создать')}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Paywall>
  );
}

const btnSmall = { padding: '4px 10px', fontSize: '0.8rem' };
const tabStyle = {
  background: 'none', border: 'none', borderBottom: '2px solid transparent',
  padding: '8px 16px', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem',
  transition: 'all 0.2s',
};
