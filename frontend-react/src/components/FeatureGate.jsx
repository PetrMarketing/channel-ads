import React from 'react';
import { useFeatureVisibility } from '../hooks/useFeatureVisibility';
import ComingSoonStub from './ComingSoonStub';

/** Обёртка для роута: проверяет feature_visibility и если статус
 *  coming_soon — показывает заглушку вместо реальной страницы. */
export default function FeatureGate({ featureKey, title, icon, children }) {
  const { get } = useFeatureVisibility();
  const flag = get(featureKey);
  if (flag.visibility === 'coming_soon') {
    return (
      <div style={{ padding: '24px' }}>
        <ComingSoonStub
          title={title || flag.title || 'Раздел'}
          message={flag.coming_soon_message || 'Этот раздел скоро появится'}
          icon={icon || '🚀'}
        />
      </div>
    );
  }
  if (flag.visibility === 'hidden') {
    return (
      <div style={{ padding: '24px' }}>
        <ComingSoonStub title="Раздел временно недоступен" icon="🔒"
          message="Этот раздел скрыт администратором." />
      </div>
    );
  }
  return children;
}
