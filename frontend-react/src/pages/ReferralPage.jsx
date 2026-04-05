import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { useChannels } from '../contexts/ChannelContext';
import Modal from '../components/Modal';

const APP_URL = window.location.origin;

const TIER_LABELS = { 1: '1 мес', 3: '3 мес', 6: '6 мес', 12: '12 мес' };

export default function ReferralPage() {
  const { showToast } = useToast();
  const { channels } = useChannels();
  const [dashboard, setDashboard] = useState(null);
  const [links, setLinks] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newLinkName, setNewLinkName] = useState('');
  const [showUseModal, setShowUseModal] = useState(false);
  const [useForm, setUseForm] = useState({ tracking_code: '', months: 1 });
  const [using, setUsing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, l, e] = await Promise.all([
        api.get('/referrals/dashboard'),
        api.get('/referrals/links'),
        api.get('/referrals/earnings'),
      ]);
      if (d.success) setDashboard(d);
      if (l.success) setLinks(l.links || []);
      if (e.success) setEarnings(e.earnings || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createLink = async () => {
    try {
      const data = await api.post('/referrals/links', { name: newLinkName || 'Основная ссылка' });
      if (data.success) {
        showToast('Ссылка создана');
        setNewLinkName('');
        load();
      }
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const deleteLink = async (id) => {
    if (!confirm('Удалить ссылку?')) return;
    await api.delete(`/referrals/links/${id}`);
    load();
  };

  const copyLink = (code) => {
    navigator.clipboard.writeText(`${APP_URL}/login?ref=${code}`);
    showToast('Ссылка скопирована');
  };

  const useBalance = async () => {
    setUsing(true);
    try {
      const data = await api.post('/referrals/use-balance', useForm);
      if (data.success) {
        showToast(`Подписка активирована! Новый баланс: ${data.new_balance} ₽`);
        setShowUseModal(false);
        load();
      }
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setUsing(false); }
  };

  const tiers = dashboard?.commission_tiers || {};
  const cardStyle = { background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', textAlign: 'center' };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Загрузка...</div>;

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Реферальная система</h2>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary)' }}>{dashboard?.total_invited || 0}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>Всего приглашено</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--success)' }}>{(dashboard?.total_earned || 0).toLocaleString('ru-RU')} ₽</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>Всего заработано</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#7b68ee' }}>{(dashboard?.balance || 0).toLocaleString('ru-RU')} ₽</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>Доступно</div>
        </div>
      </div>

      {dashboard?.balance > 0 && (
        <div style={{ padding: '14px 20px', background: 'rgba(123,104,238,0.08)', borderRadius: 'var(--radius)', border: '1px solid rgba(123,104,238,0.2)', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.9rem' }}>Реферальный баланс можно использовать для оплаты тарифов каналов.</span>
          <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '8px 16px' }} onClick={() => setShowUseModal(true)}>
            Оплатить тарифом
          </button>
        </div>
      )}

      {/* Commission tiers */}
      <div style={{ ...cardStyle, textAlign: 'left', marginBottom: 24, padding: 20 }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Условия реферальной программы</h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
          Ваш доход с КАЖДОГО платежа реферала:
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(tiers).map(([months, pct]) => (
            <div key={months} style={{ padding: '12px 20px', background: 'var(--bg)', borderRadius: 8, textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary)' }}>{pct}%</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>подписка {TIER_LABELS[months] || months + ' мес'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Links */}
      <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Ваши реферальные ссылки</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="form-input" placeholder="Название ссылки (необязательно)" value={newLinkName}
          onChange={e => setNewLinkName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={createLink}>Создать ссылку</button>
      </div>

      {links.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>Нет ссылок. Создайте первую.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {links.map(link => (
            <div key={link.id} style={{ padding: 16, background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{link.name || 'Ссылка'}</strong>
                  <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    <span>Регистраций: <b>{link.signups}</b></span>
                    <span>Заработано: <b>{(link.earned || 0).toLocaleString('ru-RU')} ₽</b></span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                    onClick={() => copyLink(link.code)}>Копировать</button>
                  <button className="btn btn-danger" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                    onClick={() => deleteLink(link.id)}>Удалить</button>
                </div>
              </div>
              <code style={{ display: 'block', marginTop: 8, fontSize: '0.8rem', color: 'var(--primary)', cursor: 'pointer', wordBreak: 'break-all' }}
                onClick={() => copyLink(link.code)}>
                {APP_URL}/login?ref={link.code}
              </code>
            </div>
          ))}
        </div>
      )}

      {/* Earnings */}
      {earnings.length > 0 && (
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>История начислений</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {earnings.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-glass)', borderRadius: 6, fontSize: '0.88rem' }}>
                <span>{e.referred_name || e.referred_username || 'Пользователь'} — {e.commission_percent}%</span>
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>+{e.commission_amount} ₽</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Use balance modal */}
      <Modal isOpen={showUseModal} onClose={() => setShowUseModal(false)} title="Оплатить тарифом">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            Баланс: <strong>{(dashboard?.balance || 0).toLocaleString('ru-RU')} ₽</strong>
          </p>
          <div>
            <label className="form-label">Канал</label>
            <select className="form-input" value={useForm.tracking_code}
              onChange={e => setUseForm(f => ({ ...f, tracking_code: e.target.value }))}>
              <option value="">— Выберите —</option>
              {channels?.map(ch => <option key={ch.tracking_code} value={ch.tracking_code}>{ch.title}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Срок</label>
            <select className="form-input" value={useForm.months}
              onChange={e => setUseForm(f => ({ ...f, months: parseInt(e.target.value) }))}>
              <option value={1}>1 месяц</option>
              <option value={3}>3 месяца</option>
              <option value={6}>6 месяцев</option>
              <option value={12}>12 месяцев</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={() => setShowUseModal(false)}>Отмена</button>
            <button className="btn btn-primary" onClick={useBalance} disabled={using || !useForm.tracking_code}>
              {using ? 'Оплата...' : 'Оплатить'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
