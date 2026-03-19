import { useNavigate } from 'react-router-dom';
import { useChannels } from '../contexts/ChannelContext';

export default function Paywall({ children }) {
  const { currentChannel } = useChannels();
  const navigate = useNavigate();

  if (!currentChannel) {
    return (
      <div className="paywall-overlay">
        <div className="paywall-content">
          <h3>Выберите канал</h3>
          <p>Для работы с этим разделом необходимо выбрать канал</p>
        </div>
      </div>
    );
  }

  if (!currentChannel.billing_active) {
    return (
      <div className="paywall-overlay">
        <div className="paywall-content">
          <h3>Требуется подписка</h3>
          <p>Для доступа к этому разделу необходима активная подписка</p>
          <button className="btn btn-primary btn-large" onClick={() => navigate('/billing')}>
            Выбрать тариф
          </button>
        </div>
      </div>
    );
  }

  return children;
}
