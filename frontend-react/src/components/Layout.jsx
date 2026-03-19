import { Outlet } from 'react-router-dom';
import { useState, useCallback } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { ChannelProvider } from '../contexts/ChannelContext';
import { ToastProvider } from './Toast';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <ChannelProvider>
      <ToastProvider>
        <div className="app-container">
          <Header onToggleSidebar={toggleSidebar} />
          <div className="app-layout">
            <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
            {sidebarOpen && (
              <div className="sidebar-overlay active" onClick={closeSidebar} />
            )}
            <div className="main-area">
              <main className="main-content" style={{ padding: '24px' }}>
                <Outlet />
              </main>
            </div>
          </div>
        </div>
      </ToastProvider>
    </ChannelProvider>
  );
}
