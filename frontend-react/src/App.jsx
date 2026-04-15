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
import CommentsPage from './pages/CommentsPage';
import OrdPage from './pages/OrdPage';
import ReferralPage from './pages/ReferralPage';

// Public pages (standalone, no layout)
import SubscribePage from './pages/public/SubscribePage';
import PaymentSuccessPage from './pages/public/PaymentSuccessPage';
import PaidChatPayPage from './pages/public/PaidChatPayPage';
import StaffInvitePage from './pages/public/StaffInvitePage';
import DocumentationPage from './pages/public/DocumentationPage';
import LeadMagnetLandingPage from './pages/public/LeadMagnetLandingPage';

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

function PrivateRoute({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

function AdminPrivateRoute({ children }) {
  const { adminToken } = useAdminAuth();
  return adminToken ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Public pages */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/subscribe/:shortCode" element={<SubscribePage />} />
      <Route path="/lm/:shortCode" element={<LeadMagnetLandingPage />} />
      <Route path="/pay/:tc" element={<PaidChatPayPage />} />
      <Route path="/paid-chat-pay/success/:orderId" element={<PaymentSuccessPage />} />
      <Route path="/paid-chat-pay/fail/:orderId" element={<PaidChatPayPage />} />
      <Route path="/payment-success" element={<PaymentSuccessPage />} />
      <Route path="/staff-invite/:token" element={<StaffInvitePage />} />
      <Route path="/documentation" element={<DocumentationPage />} />
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
        <Route path="landings" element={<AdminLandingsPage />} />
      </Route>

      {/* Dashboard (protected) */}
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="ai-design" element={<AiDesignPage />} />
        <Route path="links" element={<LinksPage />} />
        <Route path="pins" element={<PinsPage />} />
        <Route path="broadcasts" element={<BroadcastsPage />} />
        <Route path="funnels" element={<FunnelsPage />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="giveaways" element={<GiveawaysPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="referrals" element={<ReferralPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="paid-chats" element={<PaidChatsPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="shop" element={<ShopPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="comments" element={<CommentsPage />} />
        <Route path="ord" element={<OrdPage />} />
      </Route>
    </Routes>
  );
}
