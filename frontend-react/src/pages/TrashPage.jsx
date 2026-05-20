/**
 * «Корзина» — мягко-удалённые каналы (deleted_at != NULL).
 * Можно восстановить или удалить окончательно. Авточистка кроном через 30 дней.
 */
import { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';

export default function TrashPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    api.get('/channels/trash').then(d => {
      if (d?.success) setItems(d.channels || []);
      else setItems([]);
    }).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const restore = async (tc) => {
    if (!confirm('Восстановить канал? Он снова появится в списке активных.')) return;
    try {
      const d = await api.post(`/channels/${tc}/restore`);
      if (d?.success) { showToast('Канал восстановлен'); load(); }
    } catch (e) { showToast(e?.message || 'Ошибка', 'error'); }
  };

  const purge = async (tc) => {
    if (!confirm('Удалить навсегда? Действие необратимо — пропадут все посты, лид-магниты, воронки, статистика.')) return;
    try {
      const d = await api.delete(`/channels/${tc}/purge`);
      if (d?.success) { showToast('Удалено навсегда'); load(); }
    } catch (e) { showToast(e?.message || 'Ошибка', 'error'); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: '0 0 6px', letterSpacing: '-0.02em' }}>🗑 Корзина</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24, maxWidth: 640 }}>
        Удалённые каналы хранятся 30 дней. До этого срока вы можете восстановить любой канал
        со всем контентом. После — данные будут удалены автоматически.
      </p>

      {items === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Загрузка…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', borderRadius: 16, background: '#fafbfc', border: '1px dashed #e5e7eb' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🗑</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Корзина пуста</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map(ch => {
            const daysLeft = Math.max(0, Math.round((ch.seconds_until_purge || 0) / 86400));
            const isExpiringSoon = daysLeft <= 7;
            return (
              <div key={ch.id} style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                padding: '14px 18px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 15, marginBottom: 4 }}>{ch.title || `Канал #${ch.id}`}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>
                    Удалён: {new Date(ch.deleted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {' · '}
                    <span style={{ color: isExpiringSoon ? '#dc2626' : '#6b7280', fontWeight: isExpiringSoon ? 600 : 400 }}>
                      {daysLeft > 0 ? `Будет удалён через ${daysLeft} ${plurDays(daysLeft)}` : 'Готов к окончательному удалению'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => restore(ch.tracking_code)} style={{
                    padding: '8px 16px', borderRadius: 8, border: '1px solid #4361ee',
                    background: '#eef2ff', color: '#4361ee', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>↩ Восстановить</button>
                  <button onClick={() => purge(ch.tracking_code)} style={{
                    padding: '8px 14px', borderRadius: 8, border: '1px solid #fecaca',
                    background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>× Удалить навсегда</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function plurDays(n) {
  const last = n % 10, teen = n % 100;
  if (teen >= 11 && teen <= 14) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}
