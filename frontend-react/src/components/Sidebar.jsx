import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { useFeatureVisibility } from '../hooks/useFeatureVisibility';

/* CoreUI-style SVG icons */
const icons = {
  dashboard: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  marketing: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  links: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  pins: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  broadcasts: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  ),
  funnels: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  ),
  content: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  ),
  publications: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  giveaways: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12"/>
      <rect x="2" y="7" width="20" height="5"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  ),
  billing: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  staff: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  trash: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
  paidChats: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <path d="M12 8v8"/>
      <path d="M8 12h8"/>
    </svg>
  ),
  services: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <circle cx="12" cy="15" r="2"/>
    </svg>
  ),
  ai: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>
      <path d="M17.8 11.8L19 13"/><path d="M15 9h0"/><path d="M17.8 6.2L19 5"/>
      <path d="M3 21l9-9"/><path d="M12.2 6.2L11 5"/>
      <path d="M12.2 11.8L11 13"/>
    </svg>
  ),
  shop: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 01-8 0"/>
    </svg>
  ),
  analytics: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  comments: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
};

const menuItems = [
  { path: '/', label: 'Обзор', icon: icons.dashboard, standalone: true, tour: 'dashboard' },
  { path: '/ai-assistant', label: 'ИИ Помощник', icon: icons.ai || icons.dashboard, standalone: true, badge: 'NEW' },
  {
    category: 'marketing', label: 'Маркетинг', icon: icons.marketing,
    items: [
      { path: '/ai-design', featureKey: 'ai_design', label: 'ИИ Оформление', icon: icons.ai, tour: 'ai-design' },
      { path: '/links', featureKey: 'links', label: 'Ссылки', icon: icons.links, tour: 'links' },
      { path: '/pins', featureKey: 'pins', label: 'Закрепы', icon: icons.pins, tour: 'pins' },
      { path: '/broadcasts', featureKey: 'broadcasts', label: 'Рассылки', icon: icons.broadcasts, tour: 'broadcasts' },
      { path: '/funnels', featureKey: 'funnels', label: 'Воронки', icon: icons.funnels, tour: 'funnels' },
      { path: '/analytics', featureKey: 'analytics', label: 'Аналитика', icon: icons.analytics, tour: 'analytics' },
      { path: '/ord', featureKey: 'ord', label: 'Отчёты о рекламе', icon: icons.analytics, tour: 'ord' },
      { path: 'https://pkmarketing.ru', label: 'ПК Маркетинг', icon: icons.marketing, external: true },
    ],
  },
  {
    category: 'content', label: 'Контент', icon: icons.content,
    items: [
      { path: '/content', featureKey: 'content', label: 'Публикации', icon: icons.publications, tour: 'content' },
      { path: '/polls', featureKey: 'content_polls', label: 'Опросы', icon: icons.publications },
      { path: '/streams', featureKey: 'content_streams', label: 'Эфиры', icon: icons.publications },
      { path: '/giveaways', featureKey: 'giveaways', label: 'Розыгрыши', icon: icons.giveaways, tour: 'giveaways' },
      { path: '/comments', featureKey: 'comments', label: 'Комментарии', icon: icons.comments, tour: 'comments' },
    ],
  },
  {
    category: 'monetization', label: 'Монетизация', icon: icons.paidChats,
    items: [
      { path: '/paid-chats', featureKey: 'paid_chats', label: 'Платные чаты', icon: icons.paidChats, tour: 'paid-chats' },
      { path: '/services', featureKey: 'services', label: 'Услуги и запись', icon: icons.services, tour: 'services' },
      { path: '/shop', featureKey: 'shop', label: 'Магазин', icon: icons.shop, tour: 'shop' },
    ],
  },
  { path: '/staff', featureKey: 'staff', label: 'Сотрудники', icon: icons.staff, standalone: true, tour: 'staff' },
  { path: '/trash', featureKey: 'trash', label: 'Корзина', icon: icons.trash, standalone: true },
  {
    category: 'billing', label: 'Подписка', icon: icons.billing,
    items: [
      { path: '/billing', label: 'Тарифы', icon: icons.billing, tour: 'billing' },
      { path: '/ai-tokens', featureKey: 'ai_tokens', label: 'ИИ Токены', icon: icons.ai, tour: 'ai-tokens' },
      { path: '/referrals', featureKey: 'referrals', label: 'Реферальная система', icon: icons.links, tour: 'referrals' },
    ],
  },
];

export default function Sidebar({ isOpen, mobileOpen, onClose }) {
  const location = useLocation();
  const { currentChannel } = useChannels();
  const { get: getVisibility } = useFeatureVisibility();
  const [openCategories, setOpenCategories] = useState(new Set(['marketing']));

  // Эффективный бейдж: «Скоро» если featureKey в coming_soon, иначе исходный item.badge
  const effectiveBadge = (item) => {
    if (item.featureKey) {
      const f = getVisibility(item.featureKey);
      if (f.visibility === 'coming_soon') return 'Скоро';
      if (f.visibility === 'hidden') return null;
    }
    return item.badge || null;
  };

  const toggleCategory = (cat) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const isDisabled = !currentChannel;

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
      <button
        type="button"
        className="sidebar-close-btn"
        aria-label="Закрыть меню"
        onClick={onClose}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div className="sidebar-inner">
        {menuItems.map((item) => {
          if (item.standalone) {
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `sidebar-item ${isActive ? 'active' : ''}`
                }
                onClick={onClose}
                data-tour={item.tour}
              >
                <span className="sidebar-icon gradient-icon">{item.icon}</span> {item.label}
                {effectiveBadge(item) && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', padding: '1px 6px', borderRadius: 8, background: effectiveBadge(item) === 'Скоро' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #7B68EE, #4F46E5)', color: '#fff', fontWeight: 700 }}>{effectiveBadge(item)}</span>}
              </NavLink>
            );
          }

          const isCatOpen = openCategories.has(item.category);
          const hasActive = item.items.some(sub => location.pathname === sub.path);

          return (
            <div
              key={item.category}
              className={`sidebar-category ${isCatOpen || hasActive ? 'open' : ''} ${isDisabled && item.category !== 'billing' ? 'disabled' : ''}`}
            >
              <button
                className="sidebar-category-toggle"
                onClick={() => toggleCategory(item.category)}
                data-tour={`cat-${item.category}`}
              >
                <span className="sidebar-icon gradient-icon">{item.icon}</span> {item.label}
                <span className="sidebar-chevron">›</span>
              </button>
              <div className="sidebar-subitems">
                <div>
                  {item.items.map(sub => sub.external ? (
                    <a
                      key={sub.path}
                      href={sub.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sidebar-item sub-item"
                      onClick={(e) => {
                        // Гарантированно открываем в новой вкладке/окне.
                        // В MAX/Telegram in-app browser <a target="_blank"> может
                        // игнорироваться — поэтому делаем явно через window.open.
                        e.preventDefault();
                        const w = window.open(sub.path, '_blank', 'noopener,noreferrer');
                        if (!w) {
                          // Браузер заблокировал popup — фоллбэк
                          window.location.assign(sub.path);
                        }
                        if (onClose) onClose();
                      }}
                    >
                      {sub.icon && <span className="sidebar-icon gradient-icon sub-icon">{sub.icon}</span>}
                      {sub.label}
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.5 }}>↗</span>
                    </a>
                  ) : (
                    <NavLink
                      key={sub.path}
                      to={sub.path}
                      className={({ isActive }) =>
                        `sidebar-item sub-item ${isActive ? 'active' : ''}`
                      }
                      onClick={onClose}
                      data-tour={sub.tour}
                    >
                      {sub.icon && <span className="sidebar-icon gradient-icon sub-icon">{sub.icon}</span>}
                      {sub.label}
                      {effectiveBadge(sub) && <span style={{ marginLeft: 'auto', fontSize: '0.6rem', padding: '1px 6px', borderRadius: 8, background: effectiveBadge(sub) === 'Скоро' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #7B68EE, #4F46E5)', color: '#fff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{effectiveBadge(sub)}</span>}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
