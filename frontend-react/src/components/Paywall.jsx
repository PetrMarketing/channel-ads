import { useNavigate } from 'react-router-dom';
import { useChannels } from '../contexts/ChannelContext';

export default function Paywall({ children }) {
  const { currentChannel } = useChannels();
  const navigate = useNavigate();

  if (!currentChannel) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📢</div>
          <h3 style={{ marginBottom: '12px', fontSize: '1.2rem' }}>Выберите канал</h3>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>Для работы с этим разделом необходимо выбрать канал</p>
        </div>
      </div>
    );
  }

  if (!currentChannel.billing_active) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
          <h3 style={{ marginBottom: '12px', fontSize: '1.2rem' }}>Требуется подписка</h3>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>Для доступа к этому разделу необходима активная подписка</p>
          <button className="btn btn-primary btn-large" onClick={() => navigate('/billing')}>
            Выбрать тариф
          </button>
        </div>
      </div>
    );
  }

  return children;
}
