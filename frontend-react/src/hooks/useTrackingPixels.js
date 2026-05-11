/**
 * Yandex Metrika + VK Pixel — двойная отправка для надёжности:
 *   1. JS API (`ym(id,'reachGoal',name)` / `_tmr.push(...)`) — сработает когда
 *      tag.js загрузится; до загрузки хранится в очереди window.ym.a.
 *   2. Image beacon — прямой GET к `mc.yandex.ru/watch/...` и
 *      `top-fwz1.mail.ru/counter?...`. Работает даже если tag.js упал
 *      (SSL error, MAX in-app browser, AdBlock).
 *
 * Метрика дедуплицирует события по ClientID — двойного счёта обычно нет,
 * но если есть — лучше дубль чем тишина.
 */
import { useEffect, useCallback, useMemo, useRef } from 'react';

// Stable per-browser pseudo-cid stored in our own cookie. Used in MAX in-app
// browser where mc.yandex.ru is unreachable (SSL error) and `_ym_uid` cookie
// never gets set. The same value is sent to YM via the proxy beacon — YM treats
// each unique cid as one synthetic visitor and attributes goals to it.
function getOrCreateCid() {
  if (typeof document === 'undefined') return null;
  try {
    const m = document.cookie.match(/(?:^|;\s*)_ym_uid=([^;]+)/);
    if (m && m[1]) return decodeURIComponent(m[1]);
  } catch {}
  try {
    const m = document.cookie.match(/(?:^|;\s*)pk_cid=([^;]+)/);
    if (m && m[1]) return decodeURIComponent(m[1]);
  } catch {}
  // 19-char numeric cid in the same shape YM uses ({timestamp}{6 random digits}).
  const cid = `${Date.now()}${Math.floor(100000 + Math.random() * 899999)}`;
  try {
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `pk_cid=${cid}; expires=${expires}; path=/; SameSite=Lax`;
  } catch {}
  return cid;
}

export function useTrackingPixels(info) {
  const counterId = info?.ym_counter_id || info?.channel_ym_id || info?.yandex_metrika_id;
  const pixelId = info?.vk_pixel_id || info?.channel_vk_pixel_id;
  const ymGoalName = info?.ym_goal_name || 'subscribe_channel';
  const vkGoalName = info?.vk_goal_name || 'subscribe_channel';

  const clientIdResolverRef = useRef(null);
  const ymClientIdPromise = useMemo(() => {
    return new Promise((resolve) => {
      clientIdResolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!counterId) {
      if (info) console.info('[track] YM counter not set — skipping init');
      if (clientIdResolverRef.current) clientIdResolverRef.current(null);
      return;
    }

    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = window.ym.l || Date.now();

    try {
      window.ym(Number(counterId), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
      console.info('[track] init YM counter', counterId);
    } catch (e) {
      console.info('[track] YM init failed', e);
    }

    let resolved = false;
    const resolveOnce = (value) => {
      if (resolved) return;
      resolved = true;
      if (clientIdResolverRef.current) clientIdResolverRef.current(value);
    };
    try {
      window.ym(Number(counterId), 'getClientID', (clientId) => {
        console.info('[track] YM getClientID resolved', clientId);
        resolveOnce(clientId || null);
      });
    } catch (e) {
      console.info('[track] YM getClientID queue failed', e);
    }

    const timeoutId = setTimeout(() => {
      if (!resolved) console.info('[track] YM getClientID timeout — resolving null');
      resolveOnce(null);
    }, 8000);

    if (!document.querySelector('script[src*="mc.yandex.ru/metrika/tag.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://mc.yandex.ru/metrika/tag.js';
      script.async = true;
      script.onerror = () => console.info('[track] YM tag.js failed to load');
      document.head.appendChild(script);
      console.info('[track] YM tag.js injected');
    }

    // Image-beacon visit registration via our /_ymp proxy — works around
    // MAX in-app browser SSL incompatibility with mc.yandex.ru. The browser
    // hits us (valid SSL), we forward server-to-server with X-Forwarded-For.
    // We attach our own UUID-style cid so YM consistently attributes the
    // visit and any future goal hit to the same synthetic visitor.
    try {
      const cid = getOrCreateCid();
      const cidPart = cid ? `:cid:${encodeURIComponent(cid)}` : '';
      const url = `/_ymp/watch/${encodeURIComponent(counterId)}` +
        `?page-url=${encodeURIComponent(window.location.href)}` +
        `&page-ref=${encodeURIComponent(document.referrer || '')}` +
        `&browser-info=ifr:0${cidPart}:ti:0` +
        `&ut=noindex&t=${Date.now()}`;
      const img = new Image(1, 1);
      img.referrerPolicy = 'no-referrer-when-downgrade';
      img.src = url;
      console.info('[track] YM init beacon fired (proxy)', counterId, 'cid=', cid);
    } catch (e) {
      console.info('[track] YM init beacon failed', e);
    }

    return () => clearTimeout(timeoutId);
  }, [counterId, info, ymClientIdPromise]);

  useEffect(() => {
    if (!pixelId) {
      if (info) console.info('[track] VK pixel not set — skipping init');
      return;
    }

    window._tmr = window._tmr || [];
    const alreadyPaged = window._tmr.some(
      (e) => e && e.id === pixelId && e.type === 'pageView'
    );
    if (!alreadyPaged) {
      window._tmr.push({ id: pixelId, type: 'pageView', start: Date.now() });
      console.info('[track] init VK pixel', pixelId);
    }

    if (!document.querySelector('script[src*="top-fwz1.mail.ru/js/code.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://top-fwz1.mail.ru/js/code.js';
      script.async = true;
      script.onerror = () => console.info('[track] VK code.js failed to load');
      document.head.appendChild(script);
      console.info('[track] VK code.js injected');
    }

    // Image-beacon pageView via our /_vkp proxy — bypasses the same SSL
    // incompatibility MAX has with top-fwz1.mail.ru.
    try {
      const url = `/_vkp/counter?id=${encodeURIComponent(pixelId)}` +
        `&js=na&t=${Date.now()}`;
      const img = new Image(1, 1);
      img.referrerPolicy = 'no-referrer-when-downgrade';
      img.src = url;
      console.info('[track] VK init beacon fired (proxy)', pixelId);
    } catch (e) {
      console.info('[track] VK init beacon failed', e);
    }
  }, [pixelId, info]);

  // Get YM ClientID — three-tier fallback:
  //   1. tag.js global (best — real ClientID)
  //   2. _ym_uid cookie (set by tag.js if it loaded once before)
  //   3. our pk_cid cookie (synthetic UUID for MAX in-app browser case)
  const getYmClientIdSync = useCallback(() => {
    if (!counterId) return null;
    try {
      const counter = window[`yaCounter${counterId}`];
      if (counter && typeof counter.getClientID === 'function') {
        const v = counter.getClientID();
        if (v) return v;
      }
    } catch {}
    return getOrCreateCid();
  }, [counterId]);

  // Fire YM goal via BOTH JS API and image beacon.
  const reachYmGoal = useCallback((goal) => {
    if (!counterId || !goal) return;
    // 1. JS API — works when tag.js loaded; otherwise queues in window.ym.a
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    try {
      window.ym(Number(counterId), 'reachGoal', goal);
      console.info('[track] YM reachGoal (js)', counterId, goal);
    } catch (e) {
      console.info('[track] YM reachGoal (js) failed', e);
    }
    // 2. Image beacon via /_ymp proxy — works in MAX in-app browser too.
    try {
      const cid = getYmClientIdSync();
      const cidPart = cid ? `:cid:${encodeURIComponent(cid)}` : '';
      const url = `/_ymp/watch/${encodeURIComponent(counterId)}` +
        `?browser-info=ifr:0${cidPart}:ti:0:goal:${encodeURIComponent(goal)}` +
        `&page-url=${encodeURIComponent(window.location.href)}` +
        `&ut=noindex&t=${Date.now()}`;
      const img = new Image(1, 1);
      img.referrerPolicy = 'no-referrer-when-downgrade';
      img.src = url;
      console.info('[track] YM reachGoal (proxy beacon)', counterId, goal);
    } catch (e) {
      console.info('[track] YM reachGoal (beacon) failed', e);
    }
  }, [counterId, getYmClientIdSync]);

  // Fire VK Pixel goal via BOTH _tmr.push and image beacon.
  const reachVkGoal = useCallback((goal) => {
    if (!pixelId || !goal) return;
    // 1. JS API — _tmr is a queue, push works whether code.js loaded or not.
    window._tmr = window._tmr || [];
    try {
      window._tmr.push({ id: pixelId, type: 'reachGoal', goal });
      console.info('[track] VK reachGoal (js)', pixelId, goal);
    } catch (e) {
      console.info('[track] VK reachGoal (js) failed', e);
    }
    // 2. Image beacon via /_vkp proxy — формат имитирует то, что делает code.js
    // изнутри: data=base64(JSON), pid=top@mail.ru, js=11, p, domain, urlref.
    // Без этих полей VK может не зачесть событие как goal.
    try {
      const dataObj = { type: 'reachGoal', goal };
      const data = btoa(unescape(encodeURIComponent(JSON.stringify(dataObj))));
      const params = [
        `id=${encodeURIComponent(pixelId)}`,
        `pid=top%40mail.ru`,
        `js=11`,
        `_=${Date.now()}`,
        `data=${encodeURIComponent(data)}`,
        `p=${encodeURIComponent(window.location.href)}`,
        `domain=${encodeURIComponent(window.location.hostname)}`,
        `urlref=${encodeURIComponent(document.referrer || '')}`,
      ].join('&');
      const url = `/_vkp/counter?${params}`;
      const img = new Image(1, 1);
      img.referrerPolicy = 'no-referrer-when-downgrade';
      img.src = url;
      console.info('[track] VK reachGoal (proxy beacon)', pixelId, goal, 'data=', data);
    } catch (e) {
      console.info('[track] VK reachGoal (beacon) failed', e);
    }
  }, [pixelId]);

  const reachGoals = useCallback(() => {
    reachYmGoal(ymGoalName);
    reachVkGoal(vkGoalName);
  }, [reachYmGoal, reachVkGoal, ymGoalName, vkGoalName]);

  return { reachGoals, ymClientIdPromise, getYmClientIdSync };
}
