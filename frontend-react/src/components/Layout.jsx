import { Outlet, useLocation } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import SupportChat from './SupportChat';
import { ChannelProvider } from '../contexts/ChannelContext';
import { ToastProvider } from './Toast';
import { OnboardingProvider } from './OnboardingTour';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(prev => !prev);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  // Body scroll lock when mobile drawer is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileSidebarOpen]);

  // Onboarding tour can request the mobile drawer to open/close so it can
  // highlight sidebar items on mobile. Decoupled via custom events to avoid
  // threading state through OnboardingProvider.
  useEffect(() => {
    const open = () => setMobileSidebarOpen(true);
    const close = () => setMobileSidebarOpen(false);
    window.addEventListener('onboarding:open-sidebar', open);
    window.addEventListener('onboarding:close-sidebar', close);
    return () => {
      window.removeEventListener('onboarding:open-sidebar', open);
      window.removeEventListener('onboarding:close-sidebar', close);
    };
  }, []);

  const isOpenCombined = sidebarOpen || mobileSidebarOpen;

  return (
    <ChannelProvider>
      <ToastProvider>
        <OnboardingProvider>
        <div className="app-container">
          <Header onToggleSidebar={toggleSidebar} onBurgerClick={toggleMobileSidebar} />
          <div className="app-layout">
            <Sidebar
              isOpen={isOpenCombined}
              mobileOpen={mobileSidebarOpen}
              onClose={() => { closeSidebar(); closeMobileSidebar(); }}
            />
            {isOpenCombined && (
              <div
                className={`sidebar-overlay active ${mobileSidebarOpen ? 'mobile' : ''}`}
                onClick={() => { closeSidebar(); closeMobileSidebar(); }}
              />
            )}
            <div className="main-area">
              <main className="main-content" style={{ padding: '24px' }}>
                <Outlet />
              </main>
            </div>
          </div>
        </div>
        <SupportChat />
        </OnboardingProvider>
      </ToastProvider>
    </ChannelProvider>
  );
}
