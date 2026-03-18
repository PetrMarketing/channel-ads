import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useChannels } from '../contexts/ChannelContext';

export function useChannelData(endpoint, deps = []) {
  const { currentChannel } = useChannels();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!currentChannel) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(`/${endpoint}/${currentChannel.tracking_code}`);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentChannel?.tracking_code, endpoint, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, currentChannel };
}
