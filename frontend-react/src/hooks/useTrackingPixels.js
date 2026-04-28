/**
 * Yandex Metrika + VK Pixel — стандартная схема через очередь stub.
 * init и reachGoal попадают в очередь window.ym.a, скрипт проигрывает их при загрузке.
 */
import { useEffect, useCallback } from 'react';

export function useTrackingPixels(info) {
  const counterId = info?.ym_counter_id || info?.yandex_metrika_id;
  const pixelId = info?.vk_pixel_id;

  useEffect(() => {
    if (!counterId) return;

    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    try {
      window.ym(Number(counterId), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
    } catch {}

    if (!document.querySelector('script[src*="mc.yandex.ru/metrika/tag.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://mc.yandex.ru/metrika/tag.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, [counterId]);

  useEffect(() => {
    if (!pixelId) return;

    window._tmr = window._tmr || [];
    window._tmr.push({ id: pixelId, type: 'pageView', start: Date.now() });

    if (!document.querySelector('script[src*="top-fwz1.mail.ru/js/code.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://top-fwz1.mail.ru/js/code.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, [pixelId]);

  const ymGoalName = info?.ym_goal_name || 'subscribe_channel';
  const vkGoalName = info?.vk_goal_name || 'subscribe_channel';

  const fireGoals = useCallback(() => {
    if (counterId && window.ym) {
      try { window.ym(Number(counterId), 'reachGoal', ymGoalName); } catch {}
    }
    if (pixelId && window._tmr) {
      try { window._tmr.push({ id: pixelId, type: 'reachGoal', goal: vkGoalName }); } catch {}
    }
  }, [counterId, pixelId, ymGoalName, vkGoalName]);

  return { fireGoals };
}
