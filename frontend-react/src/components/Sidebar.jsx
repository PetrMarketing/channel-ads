import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useChannels } from '../contexts/ChannelContext';

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
  paidChats: (
    <svg className="sidebar-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <path d="M12 8v8"/>
      <path d="M8 12h8"/>
    </svg>
  ),
};

const menuItems = [
  { path: '/', label: 'Обзор', icon: icons.dashboard, standalone: true },
  {
    category: 'marketing', label: 'Маркетинг', icon: icons.marketing,
    items: [
      { path: '/links', label: 'Ссылки', icon: icons.links },
      { path: '/pins', label: 'Закрепы', icon: icons.pins },
      { path: '/broadcasts', label: 'Рассылки', icon: icons.broadcasts },
      { path: '/funnels', label: 'Воронки', icon: icons.funnels },
    ],
  },
  {
    category: 'content', label: 'Контент', icon: icons.content,
    items: [
      { path: '/content', label: 'Публикации', icon: icons.publications },
      { path: '/giveaways', label: 'Розыгрыши', icon: icons.giveaways },
    ],
  },
  {
    category: 'monetization', label: 'Монетизация', icon: icons.paidChats,
    items: [
      { path: '/paid-chats', label: 'Платные чаты', icon: icons.paidChats },
    ],
  },
  { path: '/staff', label: 'Сотрудники', icon: icons.staff, standalone: true },
  { path: '/billing', label: 'Подписка', icon: icons.billing, standalone: true },
];

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const { currentChannel } = useChannels();
  const [openCategories, setOpenCategories] = useState(new Set(['marketing']));

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
    <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
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
              >
                <span className="sidebar-icon gradient-icon">{item.icon}</span> {item.label}
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
              >
                <span className="sidebar-icon gradient-icon">{item.icon}</span> {item.label}
                <span className="sidebar-chevron">›</span>
              </button>
              <div className="sidebar-subitems">
                <div>
                  {item.items.map(sub => (
                    <NavLink
                      key={sub.path}
                      to={sub.path}
                      className={({ isActive }) =>
                        `sidebar-item sub-item ${isActive ? 'active' : ''}`
                      }
                      onClick={onClose}
                    >
                      {sub.icon && <span className="sidebar-icon gradient-icon sub-icon">{sub.icon}</span>}
                      {sub.label}
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
