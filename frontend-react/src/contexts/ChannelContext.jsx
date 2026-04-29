import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

const ChannelContext = createContext(null);

export function ChannelProvider({ children }) {
  const { token } = useAuth();
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadChannels = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const data = await api.get('/channels');
      if (data.success) {
        setChannels(prev => {
          // Skip update if nothing meaningful changed — avoids re-firing dependent
          // effects (e.g. BillingPage's loadStatuses) on every 10s poll.
          if (prev.length === data.channels.length &&
              prev.every((p, i) => {
                const n = data.channels[i];
                return p.tracking_code === n.tracking_code &&
                       p.title === n.title &&
                       p.billing_active === n.billing_active &&
                       p.billing_expires_at === n.billing_expires_at &&
                       p.max_users === n.max_users;
              })) {
            return prev;
          }
          return data.channels;
        });
        setCurrentChannel(prev => {
          const savedTc = localStorage.getItem('selected_channel');
          if (!prev && data.channels.length > 0) {
            // Restore saved channel or pick first
            if (savedTc) {
              const saved = data.channels.find(c => c.tracking_code === savedTc);
              if (saved) return saved;
            }
            return data.channels[0];
          }
          // Update current channel data if it changed
          if (prev) {
            const updated = data.channels.find(c => c.tracking_code === prev.tracking_code);
            return updated || prev;
          }
          return prev;
        });
      }
    } catch (e) {
      console.error('Failed to load channels:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  const selectChannel = useCallback((channel) => {
    setCurrentChannel(channel);
    if (channel?.tracking_code) {
      localStorage.setItem('selected_channel', channel.tracking_code);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    // On first load, scan for channels (catches missed bot_added events)
    api.post('/channels/scan').catch(() => {}).then(() => loadChannels());
    const interval = setInterval(() => loadChannels(true), 10000);
    return () => clearInterval(interval);
  }, [token, loadChannels]);

  return (
    <ChannelContext.Provider value={{
      channels, currentChannel, loading,
      loadChannels, selectChannel,
    }}>
      {children}
    </ChannelContext.Provider>
  );
}

export function useChannels() {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error('useChannels must be used within ChannelProvider');
  return ctx;
}
