import { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';

const TABS = ['Overview', 'Users', 'Restaurants', 'Orders'];

export default function AdminDashboard() {
  const showToast = useToast();
  const [tab, setTab] = useState('Overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [restaurants, setRestaurants] = useState(null);
  const [orders, setOrders] = useState(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState('');

  useEffect(() => {
    if (tab === 'Overview') api.get('/admin/stats').then(({ data }) => setStats(data.data));
    if (tab === 'Users') api.get('/admin/users').then(({ data }) => setUsers(data.data.users));
    if (tab === 'Restaurants') api.get('/admin/restaurants').then(({ data }) => setRestaurants(data.data.restaurants));
    if (tab === 'Orders') {
      api.get('/admin/orders', { params: orderStatusFilter ? { status: orderStatusFilter } : {} })
        .then(({ data }) => setOrders(data.data.orders));
    }
  }, [tab, orderStatusFilter]);

  async function toggleUserActive(user) {
    try {
      await api.patch(`/admin/users/${user._id}`, { isActive: !user.isActive });
      showToast('User updated', 'success');
      setUsers((prev) => prev.map((u) => (u._id === user._id ? { ...u, isActive: !u.isActive } : u)));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not update user', 'error');
    }
  }

  return (
    <div className="dashboard-page">
      <h2>Admin Dashboard</h2>
      <div className="tab-row">
        {TABS.map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' && stats && (
        <div className="stats-cards">
          <div className="stat-card"><strong>{stats.totalUsers}</strong><span>Total Users</span></div>
          <div className="stat-card"><strong>{stats.totalRestaurants}</strong><span>Total Restaurants</span></div>
          <div className="stat-card"><strong>{stats.activeOrders}</strong><span>Active Orders</span></div>
          <div className="stat-card"><strong>{stats.completedOrders}</strong><span>Completed Orders</span></div>
          <div className="stat-card"><strong>₹{stats.todaysRevenue}</strong><span>Today's Revenue</span></div>
          <div className="stat-card"><strong>{stats.activeDeliveryPartners}</strong><span>Active Delivery Partners</span></div>
        </div>
      )}

      {tab === 'Users' && (
        <div className="menu-list">
          {users === null ? <p>Loading...</p> : users.map((u) => (
            <div key={u._id} className="menu-item-card">
              <div>
                <h4>{u.name} · {u.role}</h4>
                <p className="muted small">{u.email}</p>
              </div>
              <button className="btn-link" onClick={() => toggleUserActive(u)}>
                {u.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'Restaurants' && (
        <div className="menu-list">
          {restaurants === null ? <p>Loading...</p> : restaurants.map((r) => (
            <div key={r._id} className="menu-item-card">
              <div>
                <h4>{r.name}</h4>
                <p className="muted small">Owner: {r.owner?.name} · Zone: {r.zone}</p>
              </div>
              <span className={r.isOpen ? 'status-open' : 'status-closed'}>{r.isOpen ? 'Open' : 'Closed'}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'Orders' && (
        <div>
          <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)} className="dashboard-select">
            <option value="">All statuses</option>
            <option value="placed">Placed</option>
            <option value="accepted">Accepted</option>
            <option value="preparing">Preparing</option>
            <option value="out_for_delivery">Out for delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <div className="menu-list">
            {orders === null ? <p>Loading...</p> : orders.map((o) => (
              <div key={o._id} className="menu-item-card">
                <div>
                  <h4>#{o._id.slice(-6).toUpperCase()} · {o.restaurant?.name}</h4>
                  <p className="muted small">{o.customer?.name} · ₹{o.pricing.total}</p>
                </div>
                <span>{o.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
