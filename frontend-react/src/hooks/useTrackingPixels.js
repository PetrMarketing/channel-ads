/**
 * Yandex Metrika + VK Pixel initialization and browser delivery.
 * Yandex goals use only the documented tag.js reachGoal API. A callback proves
 * that the browser transport completed, not that the goal was accounted for.
 */
import { useEffect, useCallback, useMemo, useRef } from 'react';

function getExistingYmCid() {
  if (typeof document === 'undefined') return null;
  try {
    const m = document.cookie.match(/(?:^|;\s*)_ym_uid=([^;]+)/);
    if (m && m[1]) return decodeURIComponent(m[1]);
  } catch {}
  return null;
}

export function useTrackingPixels(info) {
  // Пиксели ТОЛЬКО на уровне ссылки — канальный fallback снят.
  // Юзер настраивает YM/VK для каждой рекламной ссылки отдельно.
  const counterId = info?.ym_counter_id;
  const pixelId = info?.vk_pixel_id;
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

  // Only a ClientID actually issued by tag.js/cookie is valid attribution.
  const getYmClientIdSync = useCallback(() => {
    if (!counterId) return null;
    try {
      const counter = window[`yaCounter${counterId}`];
      if (counter && typeof counter.getClientID === 'function') {
        const v = counter.getClientID();
        if (v) return v;
      }
    } catch {}
    return getExistingYmCid();
  }, [counterId]);

  // Legacy synchronous helper used by non-MAX confirmed-subscription pages.
  const reachYmGoal = useCallback((goal) => {
    if (!counterId || !goal) return;
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    try {
      window.ym(Number(counterId), 'reachGoal', goal);
      console.info('[track] YM reachGoal (js)', counterId, goal);
    } catch (e) {
      console.info('[track] YM reachGoal (js) failed', e);
    }
  }, [counterId]);

  const deliverConfirmedYmGoal = useCallback((claimedCounterId, goal, timeoutMs = 8000) => (
    new Promise((resolve) => {
      if (!claimedCounterId || !goal || typeof window === 'undefined') {
        resolve({ accepted: false, error: 'Yandex counter unavailable in browser' });
        return;
      }
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        finish({ accepted: false, error: 'Yandex reachGoal callback timeout' });
      }, timeoutMs);
      try {
        window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
        window.ym(Number(claimedCounterId), 'reachGoal', goal, {}, () => {
          finish({ accepted: true });
        });
      } catch (e) {
        finish({ accepted: false, error: String(e?.message || e) });
      }
    })
  ), []);

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

  return { reachGoals, deliverConfirmedYmGoal, ymClientIdPromise, getYmClientIdSync };
}
