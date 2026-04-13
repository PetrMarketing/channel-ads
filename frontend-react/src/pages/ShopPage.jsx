import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import Paywall from '../components/Paywall';
import ShopMainTab from './shop/ShopMainTab';
import ShopCategoriesTab from './shop/ShopCategoriesTab';
import ShopProductsTab from './shop/ShopProductsTab';
import ShopPaymentTab from './shop/ShopPaymentTab';
import ShopDeliveryTab from './shop/ShopDeliveryTab';
import ShopPromotionsTab from './shop/ShopPromotionsTab';
import ShopOrdersTab from './shop/ShopOrdersTab';
import ShopClientsTab from './shop/ShopClientsTab';
import ShopAppearanceTab from './shop/ShopAppearanceTab';

export default function ShopPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;

  const [tab, setTab] = useState('main');
  const [loading, setLoading] = useState(false);

  // Settings
  const [settings, setSettings] = useState({ shop_name: '', primary_color: '#4F46E5', banner_url: '', welcome_text: '', currency: 'RUB', min_order_amount: 0, require_phone: true, require_email: false, require_address: true });
  const [savingSettings, setSavingSettings] = useState(false);

  // Categories
  const [categories, setCategories] = useState([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', parent_id: '', sort_order: 0 });
  const [savingCategory, setSavingCategory] = useState(false);

  // Products
  const [products, setProducts] = useState([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', description: '', category_id: '', price: '', compare_at_price: '', sku: '', stock: -1, is_hit: false, is_new: false, image_url: '' });
  const [savingProduct, setSavingProduct] = useState(false);
  const [productFilter, setProductFilter] = useState('');

  // Delivery
  const [deliveryMethods, setDeliveryMethods] = useState([]);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [deliveryForm, setDeliveryForm] = useState({ name: '', price: 0, free_from: '', estimated_days: '' });
  const [savingDelivery, setSavingDelivery] = useState(false);

  // Promotions
  const [promotions, setPromotions] = useState([]);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [promoForm, setPromoForm] = useState({ name: '', promo_type: 'percent', code: '', discount_value: '', min_order_amount: '', max_uses: '', starts_at: '', expires_at: '' });
  const [savingPromo, setSavingPromo] = useState(false);

  // Orders
  const [orders, setOrders] = useState([]);
  const [orderStats, setOrderStats] = useState({ total_products: 0, total_orders: 0, total_revenue: 0 });
  const [orderStatusFilter, setOrderStatusFilter] = useState('');

  // Clients
  const [clients, setClients] = useState([]);

  const tabs = [
    { id: 'main', label: 'Главная' },
    { id: 'categories', label: 'Категории' },
    { id: 'products', label: 'Товары' },
    { id: 'payment', label: 'Оплата' },
    { id: 'delivery', label: 'Доставка' },
    { id: 'promotions', label: 'Акции' },
    { id: 'orders', label: 'Заказы' },
    { id: 'clients', label: 'Клиенты' },
    { id: 'appearance', label: 'Внешний вид' },
  ];

  // Loaders
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

  const loadClients = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/shop/${tc}/clients`);
      if (data.success) setClients(data.clients || []);
    } catch {}
  }, [tc]);

  useEffect(() => {
    if (tab === 'main') { loadOrderStats(); loadProducts(); loadSettings(); }
    if (tab === 'categories') loadCategories();
    if (tab === 'products') { loadProducts(); loadCategories(); }
    if (tab === 'delivery') loadDeliveryMethods();
    if (tab === 'promotions') loadPromotions();
    if (tab === 'orders') { loadOrders(); loadOrderStats(); }
    if (tab === 'clients') loadClients();
    if (tab === 'appearance') loadSettings();
  }, [tab, tc]);

  useEffect(() => { if (tab === 'orders') loadOrders(); }, [orderStatusFilter]);
  useEffect(() => { if (tab === 'products') loadProducts(); }, [productFilter]);

  // Category CRUD
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

  // Product CRUD
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

  // Delivery CRUD
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

  // Promotion CRUD
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

  // Order status update
  const updateOrderStatus = async (id, status) => {
    try {
      await api.put(`/shop/${tc}/orders/${id}`, { status });
      showToast('Статус обновлён');
      loadOrders();
      loadOrderStats();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  // Settings save
  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.post(`/shop/${tc}/settings`, settings);
      showToast('Настройки сохранены');
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingSettings(false); }
  };

  if (!tc) return <Paywall><div /></Paywall>;

  const btnSmall = { padding: '6px 14px', fontSize: '0.82rem' };

  return (
    <Paywall>
    <div>
      <div className="page-header"><h1>Магазин</h1></div>

      {/* Tabs */}
      <div className="pc-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`pc-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'main' && (
        <ShopMainTab
          tc={tc} settings={settings} setSettings={setSettings}
          orderStats={orderStats} products={products}
          showToast={showToast} currentChannel={currentChannel}
          saveSettings={saveSettings} savingSettings={savingSettings}
        />
      )}

      {tab === 'categories' && (
        <ShopCategoriesTab
          categories={categories} tc={tc} showToast={showToast} loadCategories={loadCategories} btnSmall={btnSmall}
          showCategoryModal={showCategoryModal} setShowCategoryModal={setShowCategoryModal}
          editingCategory={editingCategory} setEditingCategory={setEditingCategory}
          categoryForm={categoryForm} setCategoryForm={setCategoryForm}
          savingCategory={savingCategory} saveCategory={saveCategory}
        />
      )}

      {tab === 'products' && (
        <ShopProductsTab
          products={products} categories={categories} tc={tc} showToast={showToast}
          loadProducts={loadProducts} btnSmall={btnSmall}
          showProductModal={showProductModal} setShowProductModal={setShowProductModal}
          editingProduct={editingProduct} setEditingProduct={setEditingProduct}
          productForm={productForm} setProductForm={setProductForm}
          savingProduct={savingProduct} saveProduct={saveProduct}
          productFilter={productFilter} setProductFilter={setProductFilter}
        />
      )}

      {tab === 'payment' && (
        <ShopPaymentTab />
      )}

      {tab === 'delivery' && (
        <ShopDeliveryTab
          deliveryMethods={deliveryMethods} tc={tc} showToast={showToast}
          loadDeliveryMethods={loadDeliveryMethods} btnSmall={btnSmall}
          showDeliveryModal={showDeliveryModal} setShowDeliveryModal={setShowDeliveryModal}
          editingDelivery={editingDelivery} setEditingDelivery={setEditingDelivery}
          deliveryForm={deliveryForm} setDeliveryForm={setDeliveryForm}
          savingDelivery={savingDelivery} saveDelivery={saveDelivery}
        />
      )}

      {tab === 'promotions' && (
        <ShopPromotionsTab
          promotions={promotions} tc={tc} showToast={showToast}
          loadPromotions={loadPromotions} btnSmall={btnSmall}
          showPromoModal={showPromoModal} setShowPromoModal={setShowPromoModal}
          editingPromo={editingPromo} setEditingPromo={setEditingPromo}
          promoForm={promoForm} setPromoForm={setPromoForm}
          savingPromo={savingPromo} savePromo={savePromo}
        />
      )}

      {tab === 'orders' && (
        <ShopOrdersTab
          orders={orders} tc={tc} showToast={showToast} btnSmall={btnSmall}
          orderStatusFilter={orderStatusFilter} setOrderStatusFilter={setOrderStatusFilter}
          updateOrderStatus={updateOrderStatus}
        />
      )}

      {tab === 'clients' && (
        <ShopClientsTab clients={clients} />
      )}

      {tab === 'appearance' && (
        <ShopAppearanceTab
          settings={settings} setSettings={setSettings} tc={tc} showToast={showToast}
          saveSettings={saveSettings} savingSettings={savingSettings}
          currentChannel={currentChannel}
        />
      )}
    </div>
    </Paywall>
  );
}
