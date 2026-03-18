import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <div
      className={`theme-toggle ${isDark ? 'dark-theme' : ''}`}
      onClick={() => setIsDark(prev => !prev)}
      title="Сменить тему"
    >
      <div className="theme-toggle-knob" />
    </div>
  );
}
