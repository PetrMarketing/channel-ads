/**
 * Yandex Metrika для страниц блога — подгружает tag.js один раз,
 * шлёт hit на изменение URL и предоставляет helper для целей.
 *
 * Counter ID: 109186249 (с вебвизором и трекингом ссылок).
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const YM_ID = 109186249;

let _ymLoaded = false;

function loadYmScript() {
  if (_ymLoaded || typeof window === 'undefined') return;
  _ymLoaded = true;

  // Стандартный snippet от Яндекс.Метрики
  // eslint-disable-next-line
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) {
      if (document.scripts[j].src === r) return;
    }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0];
    k.async = 1; k.src = r;
    a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + YM_ID, 'ym');

  try {
    window.ym(YM_ID, 'init', {
      ssr: true,
      webvisor: true,
      clickmap: true,
      accurateTrackBounce: true,
      trackLinks: true,
    });
  } catch {}
}

export function useBlogYandexMetrika() {
  const location = useLocation();
  useEffect(() => {
    loadYmScript();
    // Хит на каждое SPA-перемещение
    try {
      if (window.ym) {
        window.ym(YM_ID, 'hit', window.location.href, {
          referer: document.referrer,
          title: document.title,
        });
      }
    } catch {}
  }, [location.pathname]);
}

export function ymReachGoal(goal, params) {
  try {
    if (window.ym) window.ym(YM_ID, 'reachGoal', goal, params || undefined);
  } catch {}
}
