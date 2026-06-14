import { useChannels } from '../contexts/ChannelContext';
import PollsTab from './content/PollsTab';

export default function PollsPage() {
  const { currentChannel } = useChannels();
  const tc = currentChannel?.tracking_code;
  if (!tc) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666' }}>
        Выберите канал в верхнем меню, чтобы управлять опросами.
      </div>
    );
  }
  return (
    <div style={{ padding: '20px 24px' }}>
      <PollsTab tc={tc} />
    </div>
  );
}
