/**
 * Yandex Metrika + VK Pixel — стандартная схема через очередь stub.
 * init и reachGoal попадают в очередь window.ym.a, скрипт проигрывает их при загрузке.
 *
 * IMPORTANT:
 * - YM stub (window.ym) MUST be created and ym(id, 'init', ...) MUST be called
 *   BEFORE the tag.js <script> is appended, so the queue is populated when the
 *   script loads.
 * - Link-level pixel ids (tl.vk_pixel_id / tl.ym_counter_id) take priority over
 *   channel-level defaults (channel_vk_pixel_id / channel_ym_id / yandex_metrika_id).
 *
 * Returns:
 *   - fireGoals(): client-side reachGoal for YM + VK
 *   - ymClientIdPromise: resolves with the YM ClientID once available, or null
 *     if YM is not configured / unavailable. Used by SubscribePage to attach
 *     ym_client_id to the visit so the server-side fallback fire can attribute.
 */
import { useEffect, useCallback, useMemo, useRef } from 'react';

export function useTrackingPixels(info) {
  // Prefer link-level override, fallback to channel-level default.
  const counterId = info?.ym_counter_id || info?.channel_ym_id || info?.yandex_metrika_id;
  const pixelId = info?.vk_pixel_id || info?.channel_vk_pixel_id;

  // Stable promise for the YM ClientID. Resolves once tag.js loads and the
  // 'getClientID' callback fires; falls back to null if YM not configured or
  // the lookup times out.
  const clientIdResolverRef = useRef(null);
  const ymClientIdPromise = useMemo(() => {
    return new Promise((resolve) => {
      clientIdResolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!counterId) {
      if (info) console.info('[track] YM counter not set — skipping init');
      // Resolve null so SubscribePage doesn't await forever.
      if (clientIdResolverRef.current) clientIdResolverRef.current(null);
      return;
    }

    // 1) stub queue MUST be set up before tag.js loads
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = window.ym.l || Date.now();

    try {
      window.ym(Number(counterId), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
      console.info('[track] init YM counter', counterId);
    } catch (e) {
      console.info('[track] YM init failed', e);
    }

    // Queue a getClientID call — stub queues it, real ym replays after tag.js loads.
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

    // Safety timeout — don't keep the consumer waiting forever if tag.js fails.
    const timeoutId = setTimeout(() => {
      if (!resolved) console.info('[track] YM getClientID timeout — resolving null');
      resolveOnce(null);
    }, 8000);

    // 2) inject tag.js once
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
    // Avoid pushing a duplicate pageView if hook re-runs for the same pixel id.
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

  const ymGoalName = info?.ym_goal_name || 'subscribe_channel';
  const vkGoalName = info?.vk_goal_name || 'subscribe_channel';

  const fireGoals = useCallback(() => {
    if (counterId) {
      // Even if tag.js hasn't loaded, the stub queues reachGoal until it does.
      window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
      try {
        window.ym(Number(counterId), 'reachGoal', ymGoalName);
        console.info('[track] YM reachGoal', counterId, ymGoalName);
      } catch (e) {
        console.info('[track] YM reachGoal failed', e);
      }
    }
    if (pixelId) {
      window._tmr = window._tmr || [];
      try {
        window._tmr.push({ id: pixelId, type: 'reachGoal', goal: vkGoalName });
        console.info('[track] VK reachGoal', pixelId, vkGoalName);
      } catch (e) {
        console.info('[track] VK reachGoal failed', e);
      }
    }
  }, [counterId, pixelId, ymGoalName, vkGoalName]);

  return { fireGoals, ymClientIdPromise };
}
