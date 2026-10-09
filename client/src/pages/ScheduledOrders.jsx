import { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';

export default function ScheduledOrders() {
  const showToast = useToast();
  const [orders, setOrders] = useState(null);

  function refresh() {
    api.get('/scheduled-orders').then(({ data }) => setOrders(data.data.scheduledOrders));
  }

  useEffect(refresh, []);

  async function cancel(id) {
    try {
      await api.patch(`/scheduled-orders/${id}/cancel`);
      showToast('Scheduled order cancelled', 'success');
      refresh();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not cancel', 'error');
    }
  }

  const statusColor = { pending: 'muted', completed: 'status-open', failed: 'status-closed', cancelled: 'muted' };

  if (!orders) return <div className="page-loading">Loading...</div>;

  return (
    <div className="scheduled-orders-page">
      <h2>Scheduled Orders</h2>
      {orders.length === 0 ? (
        <div className="empty-state">
          No scheduled orders yet. Open a restaurant's menu and choose "Schedule for later" at checkout.
        </div>
      ) : (
        <div className="menu-list">
          {orders.map((o) => (
            <div key={o._id} className="menu-item-card">
              <div>
                <h4>{o.restaurant?.name}</h4>
                <p className="muted small">
                  Scheduled for {new Date(o.scheduledFor).toLocaleString()}
                </p>
                <span className={statusColor[o.status]}>{o.status}</span>
                {o.failureReason && <p className="alert-error">{o.failureReason}</p>}
              </div>
              {o.status === 'pending' && (
                <button className="btn-link" onClick={() => cancel(o._id)}>Cancel</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
