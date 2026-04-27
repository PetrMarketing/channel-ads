/**
 * Shared hook for Yandex Metrika + VK Pixel injection and goal firing.
 * Used by SubscribePage and LeadMagnetLandingPage.
 */
import { useEffect, useRef, useCallback } from 'react';

export function useTrackingPixels(info) {
  const ymReady = useRef(false);
  const fallbackTimer = useRef(null);

  // Inject Yandex Metrika — init on script load
  useEffect(() => {
    if (!info) return;
    const counterId = info.ym_counter_id || info.yandex_metrika_id;
    if (!counterId) return;

    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();

    const script = document.createElement('script');
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    script.async = true;
    script.onload = () => {
      try { window.ym(Number(counterId), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true }); } catch {}
      ymReady.current = true;
    };
    document.head.appendChild(script);

    fallbackTimer.current = setTimeout(() => {
      if (!ymReady.current && window.ym) {
        try { window.ym(Number(counterId), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true }); } catch {}
        ymReady.current = true;
      }
    }, 3000);

    return () => {
      clearTimeout(fallbackTimer.current);
      try { document.head.removeChild(script); } catch {}
    };
  }, [info]);

  // Inject VK Pixel
  useEffect(() => {
    if (!info) return;
    const pixelId = info.vk_pixel_id;
    if (!pixelId) return;

    window._tmr = window._tmr || [];
    window._tmr.push({ id: pixelId, type: 'pageView', start: Date.now() });

    const script = document.createElement('script');
    script.src = 'https://top-fwz1.mail.ru/js/code.js';
    script.async = true;
    document.head.appendChild(script);

    return () => { try { document.head.removeChild(script); } catch {} };
  }, [info]);

  // Fire goals with retry
  const fireGoals = useCallback(() => {
    if (!info) return;
    const retryTimers = [];

    const counterId = info.ym_counter_id || info.yandex_metrika_id;
    const goalName = info.ym_goal_name || 'subscribe_channel';
    const fireYm = (attempt = 0) => {
      if (!counterId) return;
      if (ymReady.current && window.ym) {
        try { window.ym(Number(counterId), 'reachGoal', goalName); } catch {}
      } else if (attempt < 10) {
        retryTimers.push(setTimeout(() => fireYm(attempt + 1), 1000));
      }
    };
    fireYm();

    const vkPixelId = info.vk_pixel_id;
    const vkGoalName = info.vk_goal_name || 'subscribe_channel';
    if (vkPixelId && window._tmr) {
      try { window._tmr.push({ id: vkPixelId, type: 'reachGoal', goal: vkGoalName }); } catch {}
    }

    return () => retryTimers.forEach(clearTimeout);
  }, [info]);

  return { ymReady, fireGoals };
}
