import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

const ChannelContext = createContext(null);

export function ChannelProvider({ children }) {
  const { token } = useAuth();
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadChannels = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.get('/channels');
      if (data.success) {
        setChannels(data.channels);
        // Auto-select first channel if none selected
        setCurrentChannel(prev => {
          if (!prev && data.channels.length > 0) return data.channels[0];
          return prev;
        });
      }
    } catch (e) {
      console.error('Failed to load channels:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const selectChannel = useCallback((channel) => {
    setCurrentChannel(channel);
  }, []);

  useEffect(() => {
    loadChannels();
  }, [token]);

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
