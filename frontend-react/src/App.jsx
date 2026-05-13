import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useAdminAuth } from './contexts/AdminAuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LinksPage from './pages/LinksPage';
import PinsPage from './pages/PinsPage';
import BroadcastsPage from './pages/BroadcastsPage';
import FunnelsPage from './pages/FunnelsPage';
import ContentPage from './pages/ContentPage';
import GiveawaysPage from './pages/GiveawaysPage';
import BillingPage from './pages/BillingPage';
import StaffPage from './pages/StaffPage';
import PaidChatsPage from './pages/PaidChatsPage';
import ServicesPage from './pages/ServicesPage';
import ShopPage from './pages/ShopPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AiDesignPage from './pages/AiDesignPage';
import AiLandingPage from './pages/AiLandingPage';
import AiTokensPage from './pages/AiTokensPage';
import CommentsPage from './pages/CommentsPage';
import OrdPage from './pages/OrdPage';
import AchievementsPage from './pages/AchievementsPage';
import ReferralPage from './pages/ReferralPage';

// Public pages (standalone, no layout)
import SubscribePage from './pages/public/SubscribePage';
import PaymentSuccessPage from './pages/public/PaymentSuccessPage';
import PaidChatPayPage from './pages/public/PaidChatPayPage';
import StaffInvitePage from './pages/public/StaffInvitePage';
import DocumentationPage from './pages/public/DocumentationPage';
import LeadMagnetLandingPage from './pages/public/LeadMagnetLandingPage';
import GoMiniAppPage from './pages/public/GoMiniAppPage';
import ClickLandingPage from './pages/public/ClickLandingPage';
import CheckListPage from './pages/CheckListPage';
import BlogIndexPage from './pages/public/BlogIndexPage';
import BlogArticlePage from './pages/public/BlogArticlePage';

// Admin pages
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminUserProfilePage from './pages/admin/AdminUserProfilePage';
import AdminChannelsPage from './pages/admin/AdminChannelsPage';
import AdminChannelProfilePage from './pages/admin/AdminChannelProfilePage';
import AdminSubscribersPage from './pages/admin/AdminSubscribersPage';
import AdminSubscriberDetailPage from './pages/admin/AdminSubscriberDetailPage';
import AdminAdminsPage from './pages/admin/AdminAdminsPage';
import AdminTariffsPage from './pages/admin/AdminTariffsPage';
import AdminFinancePage from './pages/admin/AdminFinancePage';
import AdminLandingsPage from './pages/admin/AdminLandingsPage';
import AdminActionLogPage from './pages/admin/AdminActionLogPage';
import AdminReferralsPage from './pages/admin/AdminReferralsPage';
import AdminFunnelPage from './pages/admin/AdminFunnelPage';
import AdminNotificationsPage from './pages/admin/AdminNotificationsPage';
import AdminBroadcastsUsersPage from './pages/admin/AdminBroadcastsUsersPage';
import AdminOnboardingPage from './pages/admin/AdminOnboardingPage';
import AdminGenerationsPage from './pages/admin/AdminGenerationsPage';
import AdminSupportPage from './pages/admin/AdminSupportPage';

function PrivateRoute({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

function AdminPrivateRoute({ children }) {
  const { adminToken } = useAdminAuth();
  return adminToken ? children : <Navigate to="/admin/login" replace />;
}

/**
 * Aggressive scan: MAX SDK exposes init_data on multiple possible globals.
 * The actual MAX bridge (https://st.max.ru/js/max-web-app.js) lives at
 * `window.WebApp` with `initDataUnsafe.start_param` — same shape as Telegram.
 * We also try every other plausible global in case the SDK changes.
 */
export function readStartParam() {
  if (typeof window === 'undefined') return null;
  // 1. MAX/Telegram SDK init data — try every known global + property path.
  try {
    const sdks = [
      window.WebApp, window.webapp,
      window.maxApp, window.MaxApp, window.maxsdk, window.MaxSDK,
      window.MaxJsSdk, window.maxJsSdk, window.MAX, window.max,
      window.Telegram?.WebApp,
    ];
    for (const sdk of sdks) {
      if (!sdk) continue;
      const inits = [
        sdk.initDataUnsafe, sdk.initData, sdk.launchParams,
        sdk.startParams, sdk.initParams,
      ];
      for (const init of inits) {
        if (!init || typeof init !== 'object') continue;
        const v = init.start_param || init.startParam || init.startapp
          || init.tgWebAppStartParam || init.payload;
        if (v) return String(v);
      }
      if (sdk.startParam) return String(sdk.startParam);
      if (sdk.start_param) return String(sdk.start_param);
    }
  } catch {}
  // 2. Query string ?startapp=... (also WebAppStartParam used by MAX deep-links)
  try {
    const qp = new URLSearchParams(window.location.search);
    const v = qp.get('startapp') || qp.get('start_param') || qp.get('start')
      || qp.get('tgWebAppStartParam') || qp.get('WebAppStartParam');
    if (v) return v;
  } catch {}
  // 3. Hash #tgWebAppStartParam=... / #startapp=...
  try {
    const hash = window.location.hash.replace(/^#/, '');
    const hp = new URLSearchParams(hash);
    const v = hp.get('tgWebAppStartParam') || hp.get('startapp')
      || hp.get('start_param') || hp.get('start') || hp.get('WebAppStartParam');
    if (v) return v;
  } catch {}
  return null;
}

export default function App() {
  // Initial sync read — picks up URL fallbacks / SDK if already loaded.
  const [startParam, setStartParam] = useState(() => readStartParam());
  // Wait until MAX SDK loads (or 4s deadline) before falling through to auth
  // routing. Otherwise unauthenticated users land on /login and see "только
  // кнопка" instead of GoMiniAppPage. Marker `window.__maxSdkReady` is set by
  // the bootstrap script in index.html — both onload and a 4s timeout flip it.
  const [sdkReady, setSdkReady] = useState(() =>
    typeof window !== 'undefined' && (!!window.__maxSdkReady || !!startParam),
  );

  useEffect(() => {
    if (sdkReady) return;
    if (typeof window === 'undefined') return;

    let cancelled = false;
    function check() {
      if (cancelled) return;
      const sp = readStartParam();
      if (sp) {
        console.info('[startapp] detected:', sp);
        setStartParam(sp);
        setSdkReady(true);
        return true;
      }
      if (window.__maxSdkReady) {
        setSdkReady(true);
        return true;
      }
      return false;
    }

    if (check()) return;
    const onReady = () => {
      console.info('[startapp] sdk-ready event fired');
      check();
    };
    window.addEventListener('max-sdk-ready', onReady);
    // Belt-and-suspenders: poll every 200ms up to 5 sec in case the event
    // was dispatched before this effect attached. Cheap, bounded.
    let attempts = 0;
    const handle = setInterval(() => {
      attempts += 1;
      if (check() || attempts >= 25) {
        clearInterval(handle);
        if (!cancelled) {
          // Force fall-through after 5s even if SDK never resolved — better
          // to render the diagnostic than spin forever.
          setSdkReady(true);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.removeEventListener('max-sdk-ready', onReady);
      clearInterval(handle);
    };
  }, [sdkReady]);

  // Once SDK is ready, do a final read in case start_param appeared via SDK.
  useEffect(() => {
    if (!sdkReady || startParam) return;
    const sp = readStartParam();
    if (sp) {
      console.info('[startapp] detected after sdkReady:', sp);
      setStartParam(sp);
    } else {
      try {
        console.info('[startapp] not found after sdkReady; window keys:',
          Object.keys(window).filter((k) => /max|tg|init|app|start|webapp/i.test(k)));
      } catch {}
    }
  }, [sdkReady, startParam]);

  // Top-level miniapp deep-link short-circuit — render channel card before
  // touching React Router (avoids the unauth /login redirect flicker).
  if (startParam && startParam.startsWith('go_')) {
    return <GoMiniAppPage />;
  }

  // SDK still loading → render a neutral splash instead of letting Routes
  // navigate to /login (which is the "только кнопка" bug from the brief).
  if (!sdkReady && typeof window !== 'undefined' && window.location.pathname === '/') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f8f9fc',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid #e5e7eb', borderTopColor: '#7B68EE',
            margin: '0 auto 12px', animation: 'spin .7s linear infinite',
          }} />
          <p style={{ fontSize: 14, margin: 0 }}>Загрузка…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public pages */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/subscribe/:shortCode" element={<SubscribePage />} />
      <Route path="/click/:shortCode" element={<ClickLandingPage />} />
      <Route path="/lm/:shortCode" element={<LeadMagnetLandingPage />} />
      <Route path="/pay/:tc" element={<PaidChatPayPage />} />
      <Route path="/paid-chat-pay/success/:orderId" element={<PaymentSuccessPage />} />
      <Route path="/paid-chat-pay/fail/:orderId" element={<PaidChatPayPage />} />
      <Route path="/payment-success" element={<PaymentSuccessPage />} />
      <Route path="/staff-invite/:token" element={<StaffInvitePage />} />
      <Route path="/documentation" element={<DocumentationPage />} />
      <Route path="/check-list" element={<CheckListPage />} />
      <Route path="/blog" element={<BlogIndexPage />} />
      <Route path="/blog/category/:categorySlug" element={<BlogIndexPage />} />
      <Route path="/blog/:slug" element={<BlogArticlePage />} />
      {/* /go/:code handled by backend directly — instant 302 redirect */}

      {/* Admin panel */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminPrivateRoute><AdminLayout /></AdminPrivateRoute>}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="users/:userId" element={<AdminUserProfilePage />} />
        <Route path="channels" element={<AdminChannelsPage />} />
        <Route path="channels/:channelId" element={<AdminChannelProfilePage />} />
        <Route path="subscribers" element={<AdminSubscribersPage />} />
        <Route path="subscribers/:identifier" element={<AdminSubscriberDetailPage />} />
        <Route path="admins" element={<AdminAdminsPage />} />
        <Route path="tariffs" element={<AdminTariffsPage />} />
        <Route path="finance" element={<AdminFinancePage />} />
        <Route path="generations" element={<AdminGenerationsPage />} />
        <Route path="support" element={<AdminSupportPage />} />
        <Route path="landings" element={<AdminLandingsPage />} />
        <Route path="action-log" element={<AdminActionLogPage />} />
        <Route path="referrals" element={<AdminReferralsPage />} />
        <Route path="funnel" element={<AdminFunnelPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="broadcasts-users" element={<AdminBroadcastsUsersPage />} />
        <Route path="onboarding" element={<AdminOnboardingPage />} />
      </Route>

      {/* Dashboard (protected) */}
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="ai-design" element={<AiDesignPage />} />
        <Route path="ai-landing" element={<AiLandingPage />} />
        <Route path="links" element={<LinksPage />} />
        <Route path="pins" element={<PinsPage />} />
        <Route path="broadcasts" element={<BroadcastsPage />} />
        <Route path="funnels" element={<FunnelsPage />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="giveaways" element={<GiveawaysPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="ai-tokens" element={<AiTokensPage />} />
        <Route path="referrals" element={<ReferralPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="paid-chats" element={<PaidChatsPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="shop" element={<ShopPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="comments" element={<CommentsPage />} />
        <Route path="ord" element={<OrdPage />} />
        <Route path="achievements" element={<AchievementsPage />} />
      </Route>
    </Routes>
  );
}
