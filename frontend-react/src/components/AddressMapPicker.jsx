import { useState, useRef, useEffect, useCallback } from 'react';

let ymapsPromise = null;
function loadYmaps() {
  if (window.ymaps && window.ymaps.Map) return Promise.resolve();
  if (ymapsPromise) return ymapsPromise;
  ymapsPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://api-maps.yandex.ru/2.1/?lang=ru_RU';
    s.onload = () => { window.ymaps.ready(resolve); };
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return ymapsPromise;
}

async function reverseGeocode(coords) {
  try {
    const res = await fetch(`/api/geo/reverse?lat=${coords[0]}&lon=${coords[1]}`);
    const data = await res.json();
    return data.address || null;
  } catch { return null; }
}

export default function AddressMapPicker({ value, onChange, placeholder = 'Начните вводить адрес...', city = '' }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const mapContainerRef = useRef(null);
  const mapObjRef = useRef(null);
  const markRef = useRef(null);
  const timerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.addr-picker-wrap')) setShowSuggest(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const search = (q) => {
    clearTimeout(timerRef.current);
    if (q.length < 3) { setSuggestions([]); setShowSuggest(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const searchQuery = city ? `${city}, ${q}` : q;
        const res = await fetch(`/api/geo/suggest?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (data.results?.length) { setSuggestions(data.results); setShowSuggest(true); }
        else { setSuggestions([]); setShowSuggest(false); }
      } catch { setSuggestions([]); }
    }, 400);
  };

  const placeMark = useCallback((lat, lon) => {
    const map = mapObjRef.current;
    if (!map || !window.ymaps) return;
    if (markRef.current) map.geoObjects.remove(markRef.current);
    markRef.current = new window.ymaps.Placemark([lat, lon], {}, {
      preset: 'islands#redDotIcon',
      draggable: true,
    });
    markRef.current.events.add('dragend', async () => {
      const c = markRef.current.geometry.getCoordinates();
      const addr = await reverseGeocode(c);
      if (addr) { setQuery(addr); onChangeRef.current(addr); }
    });
    map.geoObjects.add(markRef.current);
  }, []);

  const openMap = useCallback(async (lat, lon) => {
    setShowMap(true);
    await loadYmaps();
    if (!window.ymaps || !window.ymaps.Map) return;
    // Wait for container to mount
    await new Promise(r => setTimeout(r, 100));
    const el = mapContainerRef.current;
    if (!el) return;
    if (mapObjRef.current) {
      mapObjRef.current.setCenter([lat, lon], 16);
    } else {
      mapObjRef.current = new window.ymaps.Map(el, {
        center: [lat, lon], zoom: 16,
        controls: ['zoomControl'],
      });
      mapObjRef.current.events.add('click', async (e) => {
        const c = e.get('coords');
        placeMark(c[0], c[1]);
        const addr = await reverseGeocode(c);
        if (addr) { setQuery(addr); onChangeRef.current(addr); }
      });
    }
    placeMark(lat, lon);
  }, [placeMark]);

  const selectSuggestion = (s) => {
    setQuery(s.display);
    onChange(s.display);
    setSuggestions([]);
    setShowSuggest(false);
    if (s.lat && s.lon) openMap(s.lat, s.lon);
  };

  return (
    <div className="addr-picker-wrap">
      <div style={{ position: 'relative' }}>
        <input
          className="form-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); search(e.target.value); }}
          onFocus={() => { if (suggestions.length) setShowSuggest(true); }}
          placeholder={placeholder}
          autoComplete="off"
        />
        {showSuggest && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
            border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px',
            zIndex: 20, maxHeight: 240, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)',
          }}>
            {suggestions.map((s, i) => (
              <div key={i} onClick={() => selectSuggestion(s)} style={{
                padding: '10px 14px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
                fontSize: '0.85rem', color: 'var(--text-primary, #333)',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-glass, #f5f5f5)'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                {s.display}
              </div>
            ))}
          </div>
        )}
      </div>
      {showMap && (
        <div ref={mapContainerRef} style={{ height: 250, borderRadius: 8, marginTop: 8, border: '1px solid var(--border)' }} />
      )}
      {!showMap && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          Введите адрес — появится карта. Можно перетащить метку для уточнения.
        </p>
      )}
    </div>
  );
}
