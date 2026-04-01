import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from './Toast';
import Modal from './Modal';

export default function EridModal({ isOpen, onClose, tc, onEridReceived, defaultText = '', defaultName = '' }) {
  const { showToast } = useToast();
  const [persons, setPersons] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    external_id: '',
    contract_external_id: '',
    person_external_id: '',
    self_promo: false,
    form: 'text_block',
    texts: '',
    brand: '',
    target_urls: '',
    kktus: '1.1.1',
    name: '',
  });

  useEffect(() => {
    if (!isOpen || !tc) return;
    setLoading(true);
    Promise.all([
      api.get(`/ord/${tc}/persons`).catch(() => ({ persons: [] })),
      api.get(`/ord/${tc}/contracts`).catch(() => ({ contracts: [] })),
    ]).then(([pData, cData]) => {
      setPersons(pData.persons || []);
      setContracts(cData.contracts || []);
    }).finally(() => setLoading(false));
  }, [isOpen, tc]);

  useEffect(() => {
    if (isOpen) {
      const id = `creative-${Date.now()}`;
      setForm(f => ({
        ...f,
        external_id: id,
        texts: defaultText,
        name: defaultName,
      }));
    }
  }, [isOpen, defaultText, defaultName]);

  const handleSubmit = async () => {
    if (!form.external_id.trim()) {
      showToast('Укажите ID креатива', 'error');
      return;
    }
    setSaving(true);
    try {
      const texts = form.texts.split('\n').filter(t => t.trim());
      const target_urls = form.target_urls.split('\n').filter(u => u.trim());
      const kktus = form.kktus.split(',').map(k => k.trim()).filter(Boolean);
      const payload = {
        external_id: form.external_id,
        form: form.form,
        texts,
        target_urls,
        kktus,
        brand: form.brand,
        name: form.name,
        pay_type: 'other',
      };
      if (form.self_promo) {
        payload.person_external_id = form.person_external_id;
      } else {
        payload.contract_external_id = form.contract_external_id;
      }
      const data = await api.post(`/ord/${tc}/creatives`, payload);
      if (data.success && data.erid) {
        showToast(`ERID получен: ${data.erid}`);
        onEridReceived(data.erid);
        onClose();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка получения ERID', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Получить ERID-токен">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Загрузка...</div>
        ) : persons.length === 0 ? (
          <div style={{ padding: '16px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>
              Сначала настройте ORD: добавьте API-токен, контрагентов и договор в разделе
              <strong> Маркетинг → Отчёты о рекламе</strong>.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="form-label">ID креатива</label>
              <input className="form-input" value={form.external_id}
                onChange={e => setForm(f => ({ ...f, external_id: e.target.value }))} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
              <input type="checkbox" checked={form.self_promo}
                onChange={e => setForm(f => ({ ...f, self_promo: e.target.checked }))} />
              Самореклама (без договора)
            </label>
            {form.self_promo ? (
              <div>
                <label className="form-label">Контрагент</label>
                <select className="form-input" value={form.person_external_id}
                  onChange={e => setForm(f => ({ ...f, person_external_id: e.target.value }))}>
                  <option value="">— Выберите —</option>
                  {persons.map(p => <option key={p.external_id} value={p.external_id}>{p.name} ({p.inn})</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="form-label">Договор</label>
                <select className="form-input" value={form.contract_external_id}
                  onChange={e => setForm(f => ({ ...f, contract_external_id: e.target.value }))}>
                  <option value="">— Выберите —</option>
                  {contracts.map(c => <option key={c.external_id} value={c.external_id}>{c.serial || c.external_id} ({c.client_external_id} → {c.contractor_external_id})</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="form-label">Бренд рекламодателя</label>
              <input className="form-input" value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                placeholder="Название бренда" />
            </div>
            <div>
              <label className="form-label">Текст рекламы</label>
              <textarea className="form-input" rows={3} value={form.texts}
                onChange={e => setForm(f => ({ ...f, texts: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Ссылка</label>
              <input className="form-input" value={form.target_urls}
                onChange={e => setForm(f => ({ ...f, target_urls: e.target.value }))}
                placeholder="https://..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={onClose}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Получение...' : 'Получить ERID'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
