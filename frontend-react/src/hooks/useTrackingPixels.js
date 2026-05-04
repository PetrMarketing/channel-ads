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

    // Image-beacon visit registration. Fires in parallel with tag.js so the
    // visit is recorded even when tag.js fails (SSL error in MAX in-app
    // browser, AdBlock, network filter). YM accepts the GET, sets _ym_uid
    // cookie and registers the hit. Subsequent reads of `_ym_uid` give us
    // a stable cid even if tag.js never loads.
    try {
      const url = `https://mc.yandex.ru/watch/${encodeURIComponent(counterId)}` +
        `?page-url=${encodeURIComponent(window.location.href)}` +
        `&page-ref=${encodeURIComponent(document.referrer || '')}` +
        `&browser-info=ifr:0:ti:0` +
        `&ut=noindex&t=${Date.now()}`;
      const img = new Image(1, 1);
      img.referrerPolicy = 'no-referrer-when-downgrade';
      img.src = url;
      console.info('[track] YM init beacon fired', counterId);
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
  }, [pixelId, info]);

  // Get YM ClientID — try tag.js global first, fall back to _ym_uid cookie
  // (which is the same value YM uses internally). Cookie fallback is critical
  // for MAX in-app browser where tag.js fails SSL but image beacons still set
  // the cookie.
  const getYmClientIdSync = useCallback(() => {
    if (!counterId) return null;
    try {
      const counter = window[`yaCounter${counterId}`];
      if (counter && typeof counter.getClientID === 'function') {
        const v = counter.getClientID();
        if (v) return v;
      }
    } catch {}
    try {
      const m = document.cookie.match(/(?:^|;\s*)_ym_uid=([^;]+)/);
      if (m && m[1]) return decodeURIComponent(m[1]);
    } catch {}
    return null;
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
    // 2. Image beacon — direct GET to mc.yandex.ru, works without tag.js.
    try {
      const cid = getYmClientIdSync();
      const cidPart = cid ? `:cid:${encodeURIComponent(cid)}` : '';
      const url = `https://mc.yandex.ru/watch/${encodeURIComponent(counterId)}` +
        `?browser-info=ifr:0${cidPart}:ti:0:goal:${encodeURIComponent(goal)}` +
        `&page-url=${encodeURIComponent(window.location.href)}` +
        `&ut=noindex&t=${Date.now()}`;
      const img = new Image(1, 1);
      img.referrerPolicy = 'no-referrer-when-downgrade';
      img.src = url;
      console.info('[track] YM reachGoal (beacon)', counterId, goal);
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
    // 2. Image beacon — Top.Mail.Ru noscript fallback URL.
    try {
      const url = `https://top-fwz1.mail.ru/counter?id=${encodeURIComponent(pixelId)}` +
        `&type=reachGoal&goal=${encodeURIComponent(goal)}&js=na&t=${Date.now()}`;
      const img = new Image(1, 1);
      img.referrerPolicy = 'no-referrer-when-downgrade';
      img.src = url;
      console.info('[track] VK reachGoal (beacon)', pixelId, goal);
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
