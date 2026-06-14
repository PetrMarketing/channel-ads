import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

let _cache = null;
let _pending = null;

async function fetchVisibility() {
  if (_cache) return _cache;
  if (_pending) return _pending;
  _pending = fetch(`${API_BASE}/feature-visibility/`)
    .then(r => r.json())
    .then(d => {
      const map = {};
      for (const it of (d?.items || [])) {
        map[it.feature_key] = it;
      }
      _cache = map;
      _pending = null;
      return map;
    })
    .catch(() => {
      _pending = null;
      return {};
    });
  return _pending;
}

/** Возвращает {flags, get(key)}. По умолчанию пустые → визуально считаются 'visible'. */
export function useFeatureVisibility() {
  const [flags, setFlags] = useState(_cache || {});
  useEffect(() => {
    if (_cache) return;
    fetchVisibility().then(setFlags);
  }, []);
  const get = (key) => flags[key] || { visibility: 'visible', title: '', coming_soon_message: '' };
  return { flags, get };
}

export function clearVisibilityCache() { _cache = null; }
