import { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';

export default function Subscriptions() {
  const showToast = useToast();
  const [subs, setSubs] = useState(null);

  function refresh() {
    api.get('/subscriptions').then(({ data }) => setSubs(data.data.subscriptions));
  }
  useEffect(refresh, []);

  async function act(id, action) {
    try {
      await api.patch(`/subscriptions/${id}/${action}`);
      showToast(`Subscription ${action}d`, 'success');
      refresh();
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed', 'error');
    }
  }

  if (!subs) return <div className="page-loading">Loading...</div>;

  return (
    <div className="subscriptions-page">
      <h2>My Subscriptions</h2>
      {subs.length === 0 ? (
        <div className="empty-state">No recurring orders set up yet.</div>
      ) : (
        <div className="menu-list">
          {subs.map((s) => (
            <div key={s._id} className="menu-item-card">
              <div>
                <h4>{s.restaurant?.name} · {s.frequency}</h4>
                <p className="muted small">
                  {s.frequency === 'weekly' && `Day ${s.dayOfWeek} · `}
                  {s.frequency === 'monthly' && `Day ${s.dayOfMonth} · `}
                  {s.timeOfDay} · Next: {new Date(s.nextRunAt).toLocaleString()}
                </p>
                <span className={s.status === 'active' ? 'status-open' : 'muted'}>{s.status}</span>
                <p className="muted small">{s.totalOrdersGenerated} orders generated so far</p>
              </div>
              <div>
                {s.status === 'active' && <button className="btn-link" onClick={() => act(s._id, 'pause')}>Pause</button>}
                {s.status === 'paused' && <button className="btn-link" onClick={() => act(s._id, 'resume')}>Resume</button>}
                {s.status !== 'cancelled' && <button className="btn-link" onClick={() => act(s._id, 'cancel')}>Cancel</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
