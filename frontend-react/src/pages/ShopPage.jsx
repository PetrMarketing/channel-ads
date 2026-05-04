import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import Paywall from '../components/Paywall';
import { usePageOnboarding } from '../components/OnboardingTour';
import ShopMainTab from './shop/ShopMainTab';
import ShopCategoriesTab from './shop/ShopCategoriesTab';
import ShopProductsTab from './shop/ShopProductsTab';
import ShopPaymentTab from './shop/ShopPaymentTab';
import ShopDeliveryTab from './shop/ShopDeliveryTab';
import ShopPromotionsTab from './shop/ShopPromotionsTab';
import ShopOrdersTab from './shop/ShopOrdersTab';
import ShopClientsTab from './shop/ShopClientsTab';
import ShopAppearanceTab from './shop/ShopAppearanceTab';
import ShopAttributesTab from './shop/ShopAttributesTab';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.88rem', fontWeight: 600,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform .15s ease, box-shadow .15s ease',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.84rem', fontWeight: 500,
  transition: 'border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease',
};

const pageHeaderWrap = {
  position: 'relative', overflow: 'hidden',
  background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}`,
  padding: '26px 28px 24px', marginBottom: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const pageHeaderBlur1 = {
  position: 'absolute', top: -50, right: -30, width: 180, height: 180,
  borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT2}24 0%, transparent 70%)`,
  pointerEvents: 'none', animation: 'heroBlobFloat 6s ease-in-out infinite',
};
const pageHeaderBlur2 = {
  position: 'absolute', bottom: -70, left: -50, width: 200, height: 200,
  borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT}1c 0%, transparent 70%)`,
  pointerEvents: 'none', animation: 'heroBlobFloat 8s ease-in-out infinite reverse',
};
const pageHeaderRow = {
  position: 'relative', display: 'flex', justifyContent: 'space-between',
  alignItems: 'center', gap: 16, flexWrap: 'wrap',
};
const eyebrowStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  fontSize: '0.72rem', fontWeight: 600, color: MUTED,
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10,
};
const pageTitleStyle = {
  margin: 0, fontSize: 'clamp(1.6rem, 2.4vw, 2rem)', fontWeight: 800,
  color: DARK, letterSpacing: '-0.04em', lineHeight: 1.05,
};
const pageSubStyle = {
  margin: '8px 0 0', fontSize: '0.92rem', color: MUTED,
  lineHeight: 1.5, maxWidth: 620,
};

function PlusIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ShopBagIcon({ size = 54, color = '#fff', strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z" />
      <path d="M9 11V7a3 3 0 0 1 6 0v4" />
      <circle cx="9" cy="14" r="0.6" fill={color} stroke="none" />
      <circle cx="15" cy="14" r="0.6" fill={color} stroke="none" />
    </svg>
  );
}

function EmptyShop({ tabLabel, onCreate, ctaLabel }) {
  return (
    <div
      style={{
        ...cardBase,
        padding: '56px 32px',
        textAlign: 'center',
        position: 'relative', overflow: 'hidden',
        animation: 'dashFadeUp 0.4s ease 0.1s both',
      }}
    >
      <div aria-hidden style={{
        position: 'relative', width: 120, height: 120, margin: '0 auto 26px',
      }}>
        <div style={{
          position: 'absolute', inset: -16, borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT}30 0%, transparent 70%)`,
          animation: 'dashPulse 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 14px 36px ${ACCENT}45`,
          animation: 'heroBlobFloat 5s ease-in-out infinite',
        }}>
          <ShopBagIcon size={52} strokeWidth={1.7} />
        </div>
        <div style={{
          position: 'absolute', right: -4, bottom: -4,
          width: 34, height: 34, borderRadius: '50%',
          background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '1.25rem', fontWeight: 800,
          boxShadow: `0 4px 12px ${SUCCESS}55`,
          border: '3px solid #fff',
        }}>+</div>
      </div>

      <h3 style={{
        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em',
        color: DARK, margin: '0 0 8px',
      }}>
        Раздел «{tabLabel}» пока пуст
      </h3>
      <p style={{
        fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px',
        maxWidth: 460, lineHeight: 1.55,
      }}>
        Постройте полный интернет-магазин в MiniApp: каталог, корзина, доставка, промокоды и оплата — всё работает без отдельного сайта.
      </p>

      {onCreate && (
        <button className="shp-primary" style={primaryBtn} onClick={onCreate}>
          <PlusIcon />
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

export default function ShopPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;

  const { overlay: pageTour } = usePageOnboarding('shop', [
    { selector: '[data-tour-page="main-tab"]', title: 'Настройка магазина', text: 'Название, валюта, цвета, минимальная сумма заказа.', placement: 'bottom' },
    { selector: '[data-tour-page="products-tab"]', title: 'Каталог', text: 'Создавайте товары с категориями, фото, ценами, наличием.', placement: 'bottom' },
  ]);

  const [tab, setTab] = useState('main');
  const [loading, setLoading] = useState(false);

  const [settings, setSettings] = useState({ shop_name: '', primary_color: '#4F46E5', banner_url: '', welcome_text: '', currency: 'RUB', min_order_amount: 0, require_phone: true, require_email: false, require_address: true });
  const [savingSettings, setSavingSettings] = useState(false);

  const [categories, setCategories] = useState([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', parent_id: '', sort_order: 0 });
  const [savingCategory, setSavingCategory] = useState(false);

  const [products, setProducts] = useState([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', description: '', category_id: '', price: '', compare_at_price: '', sku: '', stock: -1, is_hit: false, is_new: false, image_url: '', attribute_value_ids: [] });
  const [savingProduct, setSavingProduct] = useState(false);
  const [productFilter, setProductFilter] = useState('');

  const [deliveryMethods, setDeliveryMethods] = useState([]);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [deliveryForm, setDeliveryForm] = useState({ name: '', price: 0, free_from: '', estimated_days: '' });
  const [savingDelivery, setSavingDelivery] = useState(false);

  const [promotions, setPromotions] = useState([]);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [promoForm, setPromoForm] = useState({ name: '', promo_type: 'percent', code: '', discount_value: '', min_order_amount: '', max_uses: '', starts_at: '', expires_at: '' });
  const [savingPromo, setSavingPromo] = useState(false);

  const [orders, setOrders] = useState([]);
  const [orderStats, setOrderStats] = useState({ total_products: 0, total_orders: 0, total_revenue: 0 });
  const [orderStatusFilter, setOrderStatusFilter] = useState('');

  const [attributes, setAttributes] = useState([]);

  const [clients, setClients] = useState([]);
  const [clientsFunnel, setClientsFunnel] = useState({});

  const loadSettings = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/shop/${tc}/settings`);
      if (data.success && data.settings) setSettings(data.settings);
    } catch {}
  }, [tc]);

  const loadCategories = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/shop/${tc}/categories`);
      if (data.success) setCategories(data.categories || []);
    } catch {}
  }, [tc]);

  const loadProducts = useCallback(async () => {
    if (!tc) return;
    try {
      let url = `/shop/${tc}/products`;
      if (productFilter) url += `?category_id=${productFilter}`;
      const data = await api.get(url);
      if (data.success) setProducts(data.products || []);
    } catch {}
  }, [tc, productFilter]);

  const loadDeliveryMethods = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/shop/${tc}/delivery`);
      if (data.success) setDeliveryMethods(data.delivery_methods || []);
    } catch {}
  }, [tc]);

  const loadPromotions = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/shop/${tc}/promotions`);
      if (data.success) setPromotions(data.promotions || []);
    } catch {}
  }, [tc]);

  const loadOrders = useCallback(async () => {
    if (!tc) return;
    try {
      let url = `/shop/${tc}/orders`;
      if (orderStatusFilter) url += `?status=${orderStatusFilter}`;
      const data = await api.get(url);
      if (data.success) setOrders(data.orders || []);
    } catch {}
  }, [tc, orderStatusFilter]);

  const loadOrderStats = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/shop/${tc}/stats`);
      if (data.success) setOrderStats(data.stats || { total_products: 0, total_orders: 0, total_revenue: 0 });
    } catch {}
  }, [tc]);

  const loadAttributes = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/shop/${tc}/attributes`);
      if (data.success) setAttributes(data.attributes || []);
    } catch {}
  }, [tc]);

  const loadClients = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/shop/${tc}/clients`);
      if (data.success) {
        setClients(data.clients || []);
        setClientsFunnel({ funnel: data.funnel || {}, visitors: data.visitors || [], carts: data.carts || [] });
      }
    } catch {}
  }, [tc]);

  useEffect(() => {
    if (tab === 'main') { loadOrderStats(); loadProducts(); loadSettings(); }
    if (tab === 'categories') loadCategories();
    if (tab === 'products') { loadProducts(); loadCategories(); }
    if (tab === 'attributes') loadAttributes();
    if (tab === 'delivery') loadDeliveryMethods();
    if (tab === 'promotions') loadPromotions();
    if (tab === 'orders') { loadOrders(); loadOrderStats(); }
    if (tab === 'clients') loadClients();
    if (tab === 'appearance') loadSettings();
  }, [tab, tc]);

  useEffect(() => { if (tab === 'orders') loadOrders(); }, [orderStatusFilter]);
  useEffect(() => { if (tab === 'products') loadProducts(); }, [productFilter]);

  const saveCategory = async () => {
    setSavingCategory(true);
    try {
      const payload = { ...categoryForm, sort_order: parseInt(categoryForm.sort_order) || 0 };
      if (payload.parent_id) payload.parent_id = parseInt(payload.parent_id);
      else delete payload.parent_id;
      if (editingCategory) {
        await api.put(`/shop/${tc}/categories/${editingCategory.id}`, payload);
        showToast('Категория обновлена');
      } else {
        await api.post(`/shop/${tc}/categories`, payload);
        showToast('Категория создана');
      }
      setShowCategoryModal(false);
      loadCategories();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingCategory(false); }
  };

  const saveProduct = async () => {
    setSavingProduct(true);
    try {
      const payload = {
        ...productForm,
        price: parseFloat(productForm.price) || 0,
        compare_at_price: productForm.compare_at_price ? parseFloat(productForm.compare_at_price) : null,
        stock: parseInt(productForm.stock),
        is_hit: productForm.is_hit ? 1 : 0,
        is_new: productForm.is_new ? 1 : 0,
      };
      if (payload.category_id) payload.category_id = parseInt(payload.category_id);
      else delete payload.category_id;
      if (editingProduct) {
        await api.put(`/shop/${tc}/products/${editingProduct.id}`, payload);
        showToast('Товар обновлён');
      } else {
        await api.post(`/shop/${tc}/products`, payload);
        showToast('Товар создан');
      }
      setShowProductModal(false);
      loadProducts();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingProduct(false); }
  };

  const saveDelivery = async () => {
    setSavingDelivery(true);
    try {
      const payload = {
        ...deliveryForm,
        price: parseFloat(deliveryForm.price) || 0,
        free_from: deliveryForm.free_from ? parseFloat(deliveryForm.free_from) : null,
        estimated_days: deliveryForm.estimated_days ? parseInt(deliveryForm.estimated_days) : null,
      };
      if (editingDelivery) {
        await api.put(`/shop/${tc}/delivery/${editingDelivery.id}`, payload);
        showToast('Способ доставки обновлён');
      } else {
        await api.post(`/shop/${tc}/delivery`, payload);
        showToast('Способ доставки создан');
      }
      setShowDeliveryModal(false);
      loadDeliveryMethods();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingDelivery(false); }
  };

  const savePromo = async () => {
    setSavingPromo(true);
    try {
      const payload = {
        ...promoForm,
        discount_value: parseFloat(promoForm.discount_value) || 0,
        min_order_amount: promoForm.min_order_amount ? parseFloat(promoForm.min_order_amount) : null,
        max_uses: promoForm.max_uses ? parseInt(promoForm.max_uses) : null,
      };
      if (editingPromo) {
        await api.put(`/shop/${tc}/promotions/${editingPromo.id}`, payload);
        showToast('Акция обновлена');
      } else {
        await api.post(`/shop/${tc}/promotions`, payload);
        showToast('Акция создана');
      }
      setShowPromoModal(false);
      loadPromotions();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingPromo(false); }
  };

  const updateOrderStatus = async (id, status) => {
    try {
      await api.put(`/shop/${tc}/orders/${id}`, { status });
      showToast('Статус обновлён');
      loadOrders();
      loadOrderStats();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const saveSettings = async () => {
    if (settings.manager_contact_url && !settings.manager_contact_url.startsWith('https://t.me/') && !settings.manager_contact_url.startsWith('https://max.ru/')) {
      showToast('Ссылка менеджера должна начинаться с https://t.me/ или https://max.ru/', 'error');
      return;
    }
    setSavingSettings(true);
    try {
      await api.post(`/shop/${tc}/settings`, settings);
      showToast('Настройки сохранены');
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingSettings(false); }
  };

  if (!tc) return <Paywall><div /></Paywall>;

  const btnSmall = { padding: '6px 14px', fontSize: '0.82rem' };

  const tabs = [
    { id: 'main', label: 'Главная', count: null },
    { id: 'categories', label: 'Категории', count: categories.length || null },
    { id: 'products', label: 'Товары', count: products.length || null },
    { id: 'attributes', label: 'Параметры', count: attributes.length || null },
    { id: 'payment', label: 'Оплата', count: null },
    { id: 'delivery', label: 'Доставка', count: deliveryMethods.length || null },
    { id: 'promotions', label: 'Акции', count: promotions.length || null },
    { id: 'orders', label: 'Заказы', count: orders.length || null },
    { id: 'clients', label: 'Клиенты', count: clients.length || null },
    { id: 'appearance', label: 'Внешний вид', count: null },
  ];

  const headerCta = (() => {
    switch (tab) {
      case 'products':    return { label: 'Добавить товар',     action: () => { setEditingProduct(null); setProductForm({ name: '', description: '', category_id: '', price: '', compare_at_price: '', sku: '', stock: -1, is_hit: false, is_new: false, image_url: '', attribute_value_ids: [] }); setShowProductModal(true); } };
      case 'categories':  return { label: 'Добавить категорию', action: () => { setEditingCategory(null); setCategoryForm({ name: '', description: '', parent_id: '', sort_order: 0 }); setShowCategoryModal(true); } };
      case 'delivery':    return { label: 'Способ доставки',    action: () => { setEditingDelivery(null); setDeliveryForm({ name: '', price: 0, free_from: '', estimated_days: '' }); setShowDeliveryModal(true); } };
      case 'promotions':  return { label: 'Создать акцию',      action: () => { setEditingPromo(null); setPromoForm({ name: '', promo_type: 'percent', code: '', discount_value: '', min_order_amount: '', max_uses: '', starts_at: '', expires_at: '' }); setShowPromoModal(true); } };
      default:            return { label: 'Добавить товар',     action: () => { setTab('products'); setTimeout(() => { setEditingProduct(null); setProductForm({ name: '', description: '', category_id: '', price: '', compare_at_price: '', sku: '', stock: -1, is_hit: false, is_new: false, image_url: '', attribute_value_ids: [] }); setShowProductModal(true); }, 60); } };
    }
  })();

  const renderTab = () => {
    if (tab === 'main') {
      return (
        <ShopMainTab
          tc={tc} settings={settings} setSettings={setSettings}
          orderStats={orderStats} products={products}
          showToast={showToast} currentChannel={currentChannel}
          saveSettings={saveSettings} savingSettings={savingSettings}
        />
      );
    }
    if (tab === 'categories') {
      return (
        <ShopCategoriesTab
          categories={categories} tc={tc} showToast={showToast} loadCategories={loadCategories} btnSmall={btnSmall}
          showCategoryModal={showCategoryModal} setShowCategoryModal={setShowCategoryModal}
          editingCategory={editingCategory} setEditingCategory={setEditingCategory}
          categoryForm={categoryForm} setCategoryForm={setCategoryForm}
          savingCategory={savingCategory} saveCategory={saveCategory}
        />
      );
    }
    if (tab === 'products') {
      return (
        <ShopProductsTab
          products={products} categories={categories} tc={tc} showToast={showToast}
          loadProducts={loadProducts} btnSmall={btnSmall}
          showProductModal={showProductModal} setShowProductModal={setShowProductModal}
          editingProduct={editingProduct} setEditingProduct={setEditingProduct}
          productForm={productForm} setProductForm={setProductForm}
          savingProduct={savingProduct} saveProduct={saveProduct}
          productFilter={productFilter} setProductFilter={setProductFilter}
          attributes={attributes} onGoToAttributes={() => setTab('attributes')}
        />
      );
    }
    if (tab === 'attributes') {
      return (
        <ShopAttributesTab
          tc={tc} showToast={showToast}
          attributes={attributes} loadAttributes={loadAttributes}
        />
      );
    }
    if (tab === 'payment') {
      return <ShopPaymentTab tc={tc} showToast={showToast} currentChannel={currentChannel} />;
    }
    if (tab === 'delivery') {
      return (
        <ShopDeliveryTab
          deliveryMethods={deliveryMethods} tc={tc} showToast={showToast}
          loadDeliveryMethods={loadDeliveryMethods} btnSmall={btnSmall}
          showDeliveryModal={showDeliveryModal} setShowDeliveryModal={setShowDeliveryModal}
          editingDelivery={editingDelivery} setEditingDelivery={setEditingDelivery}
          deliveryForm={deliveryForm} setDeliveryForm={setDeliveryForm}
          savingDelivery={savingDelivery} saveDelivery={saveDelivery}
        />
      );
    }
    if (tab === 'promotions') {
      return (
        <ShopPromotionsTab
          promotions={promotions} tc={tc} showToast={showToast}
          loadPromotions={loadPromotions} btnSmall={btnSmall}
          showPromoModal={showPromoModal} setShowPromoModal={setShowPromoModal}
          editingPromo={editingPromo} setEditingPromo={setEditingPromo}
          promoForm={promoForm} setPromoForm={setPromoForm}
          savingPromo={savingPromo} savePromo={savePromo}
        />
      );
    }
    if (tab === 'orders') {
      return (
        <ShopOrdersTab
          orders={orders} tc={tc} showToast={showToast} btnSmall={btnSmall}
          orderStatusFilter={orderStatusFilter} setOrderStatusFilter={setOrderStatusFilter}
          updateOrderStatus={updateOrderStatus}
        />
      );
    }
    if (tab === 'clients') {
      return <ShopClientsTab clients={clients} funnel={clientsFunnel.funnel} visitors={clientsFunnel.visitors} carts={clientsFunnel.carts} />;
    }
    if (tab === 'appearance') {
      return (
        <ShopAppearanceTab
          settings={settings} setSettings={setSettings} tc={tc} showToast={showToast}
          saveSettings={saveSettings} savingSettings={savingSettings}
          currentChannel={currentChannel}
        />
      );
    }
    return null;
  };

  return (
    <Paywall>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .shp-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .shp-primary[disabled] {
          opacity: 0.55; cursor: not-allowed; transform: none !important; box-shadow: 0 2px 8px ${ACCENT}25 !important;
        }
        .shp-tab {
          flex: 0 0 auto;
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 18px; border-radius: 10px; cursor: pointer;
          background: transparent; border: none;
          color: ${DARK}; font-size: 0.88rem; font-weight: 600;
          letter-spacing: -0.005em;
          transition: all .15s ease;
          white-space: nowrap;
        }
        .shp-tab:hover:not(.active) {
          background: rgba(67,97,238,0.06);
          color: ${ACCENT};
        }
        .shp-tab.active {
          color: #fff;
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          box-shadow: 0 4px 14px ${ACCENT}40;
        }
        .shp-tab-count {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
          font-size: 0.68rem; font-weight: 700; letter-spacing: -0.01em;
          background: rgba(67,97,238,0.10); color: ${ACCENT};
          transition: all .18s ease;
        }
        .shp-tab.active .shp-tab-count {
          background: rgba(255,255,255,0.22);
          color: #fff;
        }
      `}</style>

      <div style={{ animation: 'dashFade 0.4s ease' }}>
        <section style={pageHeaderWrap}>
          <div style={pageHeaderBlur1} />
          <div style={pageHeaderBlur2} />
          <div style={pageHeaderRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={eyebrowStyle}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
                Электронная коммерция
              </div>
              <h1 style={pageTitleStyle}>Магазин</h1>
              <p style={pageSubStyle}>
                Полный интернет-магазин в MiniApp: каталог, корзина, доставка, промокоды
              </p>
            </div>
            {headerCta && (
              <button
                className="shp-primary"
                style={primaryBtn}
                onClick={headerCta.action}
                disabled={headerCta.disabled}
              >
                <PlusIcon />
                {headerCta.label}
              </button>
            )}
          </div>
        </section>

        <div style={{
          display: 'flex', gap: 8, padding: 6, background: SOFT_BG,
          borderRadius: 14, marginBottom: 24, overflowX: 'auto',
        }}>
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                data-tour-page={t.id === 'main' ? 'main-tab' : t.id === 'products' ? 'products-tab' : undefined}
                className={`shp-tab${active ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.count != null && <span className="shp-tab-count">{t.count}</span>}
              </button>
            );
          })}
        </div>

        <div style={{ animation: 'dashFadeUp 0.4s ease 0.05s both' }}>
          {renderTab()}
        </div>
      </div>
    </Paywall>
  );
}
