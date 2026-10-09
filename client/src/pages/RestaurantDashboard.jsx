import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../services/api';
import useSocket from '../hooks/useSocket';
import { useToast } from '../components/Toast';
import { useLanguage } from '../context/LanguageContext';

const TABS = ['Orders', 'Menu', 'Stats'];
const NEXT_STATUS = { placed: 'accepted', accepted: 'preparing', preparing: 'ready' };

export default function RestaurantDashboard() {
  const showToast = useToast();
  const { t, tn } = useLanguage();
  const [restaurants, setRestaurants] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('Orders');
  const [orders, setOrders] = useState(null);
  const [menu, setMenu] = useState(null);
  const [stats, setStats] = useState(null);
  const [newItem, setNewItem] = useState({ name: '', price: '', category: 'Main Course', isVeg: true });

  useEffect(() => {
    api.get('/restaurants/mine').then(({ data }) => {
      setRestaurants(data.data.restaurants);
      if (data.data.restaurants.length > 0) setSelected(data.data.restaurants[0]._id);
    });
  }, []);

  function refreshOrders() {
    if (!selected) return;
    api.get(`/orders/restaurant/${selected}`).then(({ data }) => setOrders(data.data.orders));
  }
  function refreshMenu() {
    if (!selected) return;
    api.get(`/restaurants/${selected}/menu`).then(({ data }) => setMenu(data.data.menu));
  }
  function refreshStats() {
    if (!selected) return;
    api.get(`/restaurants/${selected}/stats`).then(({ data }) => setStats(data.data));
  }

  useEffect(() => {
    if (tab === 'Orders') refreshOrders();
    if (tab === 'Menu') refreshMenu();
    if (tab === 'Stats') refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selected]);

  // Live feed: new incoming orders appear without a refresh.
  useSocket(selected ? `restaurant:${selected}` : null, () => {
    if (tab === 'Orders') refreshOrders();
  });

  async function advanceOrder(orderId, current) {
    const next = NEXT_STATUS[current];
    if (!next) return;
    try {
      await api.patch(`/orders/${orderId}/status`, { status: next });
      showToast(t('rd.marked', { status: t(`status.${next}`) }), 'success');
      refreshOrders();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not update order', 'error');
    }
  }

  async function toggleAvailability(item) {
    try {
      await api.patch(`/menu/${item._id}/availability`, { isAvailable: !item.isAvailable });
      refreshMenu();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not update item', 'error');
    }
  }

  async function deleteItem(itemId) {
    try {
      await api.delete(`/menu/${itemId}`);
      showToast(t('rd.itemDeleted'), 'success');
      refreshMenu();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not delete item', 'error');
    }
  }

  async function addItem(e) {
    e.preventDefault();
    try {
      await api.post('/menu', { ...newItem, restaurant: selected, price: Number(newItem.price) });
      showToast(t('rd.itemAdded'), 'success');
      setNewItem({ name: '', price: '', category: 'Main Course', isVeg: true });
      refreshMenu();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not add item', 'error');
    }
  }

  if (!restaurants) return <div className="page-loading">{t('common.loading')}</div>;
  if (restaurants.length === 0) return <div className="empty-state">{t('rd.noRestaurants')}</div>;

  return (
    <div className="dashboard-page">
      <h2>{t('rd.title')}</h2>
      <select value={selected} onChange={(e) => setSelected(e.target.value)} className="dashboard-select">
        {restaurants.map((r) => <option key={r._id} value={r._id}>{tn(r.name)}</option>)}
      </select>

      <div className="tab-row">
        {TABS.map((tabName) => (
          <button key={tabName} className={`tab-btn ${tab === tabName ? 'active' : ''}`} onClick={() => setTab(tabName)}>{t(`rd.tab.${tabName}`)}</button>
        ))}
      </div>

      {tab === 'Orders' && (
        <div className="menu-list">
          {orders === null ? <p>{t('common.loading')}</p> : orders.length === 0 ? (
            <p className="muted">{t('rd.noOrders')}</p>
          ) : orders.map((o) => (
            <div key={o._id} className="menu-item-card">
              <div>
                <h4>{t('rd.order')} #{o._id.slice(-6).toUpperCase()} · {o.customer?.name}</h4>
                <p className="muted small">
                  {o.items.map((i) => `${i.name} x${i.quantity}`).join(', ')}
                </p>
                <strong>₹{o.pricing.total}</strong> · <span>{t(`status.${o.status}`)}</span>
              </div>
              {NEXT_STATUS[o.status] && (
                <button className="btn-primary-sm" onClick={() => advanceOrder(o._id, o.status)}>
                  {t('rd.markAs', { status: t(`status.${NEXT_STATUS[o.status]}`) })}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'Menu' && (
        <div>
          <form className="add-item-form" onSubmit={addItem}>
            <input placeholder={t('rd.dishName')} required value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
            <input placeholder={t('rd.price')} type="number" required value={newItem.price}
              onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} />
            <select value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}>
              <option value="Starters">{t('rd.cat.Starters')}</option><option value="Main Course">{t('rd.cat.Main Course')}</option><option value="Desserts">{t('rd.cat.Desserts')}</option><option value="Beverages">{t('rd.cat.Beverages')}</option>
            </select>
            <label className="inline-check">
              <input type="checkbox" checked={newItem.isVeg}
                onChange={(e) => setNewItem({ ...newItem, isVeg: e.target.checked })} /> {t('rd.veg')}
            </label>
            <button className="btn-primary-sm" type="submit">{t('rd.addItem')}</button>
          </form>

          <div className="menu-list">
            {menu === null ? <p>{t('common.loading')}</p> : menu.map((item) => (
              <div key={item._id} className="menu-item-card">
                <div>
                  <h4>{item.isVeg ? '🟢' : '🔴'} {item.name}</h4>
                  <strong>₹{item.price}</strong> · {item.category}
                </div>
                <div>
                  <button className="btn-link" onClick={() => toggleAvailability(item)}>
                    {item.isAvailable ? t('rd.markUnavailable') : t('rd.markAvailable')}
                  </button>
                  <button className="btn-link" onClick={() => deleteItem(item._id)}>{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Stats' && stats && (
        <div>
          <div className="stats-cards">
            <div className="stat-card"><strong>{stats.totalOrders}</strong><span>{t('rd.totalOrders')}</span></div>
            <div className="stat-card"><strong>₹{stats.totalRevenue}</strong><span>{t('rd.totalRevenue')}</span></div>
            <div className="stat-card"><strong>{stats.liveStats?.activeOrders ?? 0}</strong><span>{t('rd.activeOrders')}</span></div>
            <div className="stat-card"><strong>{stats.liveStats?.currentPrepTime ?? '—'} min</strong><span>{t('rd.prepTime')}</span></div>
          </div>

          <h3>{t('rd.chartTitle')}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.dailySeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="_id" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="orders" fill="#ff5a1f" name={t('rd.ordersLabel')} />
              <Bar dataKey="revenue" fill="#4338ca" name={t('rd.revenueLabel')} />
            </BarChart>
          </ResponsiveContainer>

          <h3>{t('rd.popular')}</h3>
          <ol>
            {stats.popularDishes.map((d) => <li key={d.name}>{d.name} — {t('rd.sold', { n: d.quantity })}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}