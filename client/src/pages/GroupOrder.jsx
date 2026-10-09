import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import useSocket from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function GroupOrder() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [menu, setMenu] = useState([]);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    api.get(`/groups/${groupId}`).then(({ data }) => setGroup(data.data.group)).catch((err) => {
      setError(err.response?.data?.message || 'Group order not found');
    });
  }, [groupId]);

  // Real-time updates: any member's action (add/remove/join/checkout)
  // arrives here via the Redis Pub/Sub -> Socket.IO bridge, no polling.
  useSocket(`group:${groupId}`, useCallback((payload) => {
    if (payload.type === 'checked_out') {
      showToast('The group order has been placed!', 'success');
      navigate(`/order/${payload.orderId}`);
      return;
    }
    refresh();
    if (payload.type === 'member_joined' && payload.userId !== user?._id) {
      showToast(`${payload.name} joined the group order`, 'info');
    } else if (payload.type === 'item_added' && payload.userId !== user?._id) {
      showToast(`Someone added ${payload.name || 'an item'}`, 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]));

  useEffect(() => {
    async function init() {
      try {
        // Joining is idempotent — safe to call every time the page loads,
        // including for the creator who is already a member.
        await api.post(`/groups/${groupId}/join`);
        setJoined(true);
        refresh();
      } catch (err) {
        setError(err.response?.data?.message || 'Could not join group order');
      }
    }
    init();
  }, [groupId, refresh]);

  useEffect(() => {
    if (group?.restaurant) {
      api.get(`/restaurants/${group.restaurant}/menu`).then(({ data }) => setMenu(data.data.menu));
    }
  }, [group?.restaurant]);

  async function addItem(menuItemId) {
    try {
      await api.post(`/groups/${groupId}/items`, { menuItemId, quantity: 1 });
      // No need to manually refresh — the Pub/Sub event will update everyone, including us.
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not add item', 'error');
    }
  }

  async function removeMyItem(menuItemId) {
    try {
      await api.delete(`/groups/${groupId}/items/${menuItemId}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove item', 'error');
    }
  }

  if (error) return <div className="empty-state">{error}</div>;
  if (!joined || !group) return <div className="page-loading">Joining group order...</div>;

  const shareUrl = `${window.location.origin}/group/${groupId}`;
  const myLines = group.lines.filter((l) => l.addedBy === user._id);

  return (
    <div className="group-order-page">
      <header className="group-header">
        <h1>Group Order · {groupId}</h1>
        <div className="share-box">
          <input readOnly value={shareUrl} onClick={(e) => e.target.select()} />
          <button className="btn-primary-sm" onClick={() => {
            navigator.clipboard.writeText(shareUrl);
            showToast('Link copied!', 'success');
          }}>Copy link</button>
        </div>
        <div className="members-row">
          {group.members.map((m) => (
            <span key={m.userId} className="member-chip">
              {m.name}{m.userId === group.creatorId ? ' (host)' : ''}
            </span>
          ))}
        </div>
      </header>

      <div className="group-order-grid">
        <section>
          <h2>Menu</h2>
          <div className="menu-list">
            {menu.map((item) => (
              <div key={item._id} className="menu-item-card">
                <div>
                  <h4>{item.isVeg ? '🟢' : '🔴'} {item.name}</h4>
                  <strong>₹{item.price}</strong>
                </div>
                <button className="btn-primary-sm" onClick={() => addItem(item._id)}>Add</button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>Shared Cart</h2>
          {group.items.length === 0 ? (
            <p className="muted">No items yet — add something from the menu.</p>
          ) : (
            <div className="menu-list">
              {group.items.map((item) => (
                <div key={item.menuItem} className="menu-item-card">
                  <div>
                    <h4>{item.name} × {item.quantity}</h4>
                    <p className="muted small">
                      added by {item.addedBy.map((uid) => group.members.find((m) => m.userId === uid)?.name || 'someone').join(', ')}
                    </p>
                    <strong>₹{item.price * item.quantity}</strong>
                  </div>
                  {myLines.some((l) => l.menuItem === item.menuItem) && (
                    <button className="btn-link" onClick={() => removeMyItem(item.menuItem)}>Remove mine</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="group-subtotal"><strong>Subtotal: ₹{group.subtotal}</strong></div>

          {user._id === group.creatorId ? (
            <button className="btn-primary" onClick={() => navigate(`/group/${groupId}/checkout`)}>
              Checkout for everyone
            </button>
          ) : (
            <p className="muted small">Only the host who created this group order can check out.</p>
          )}
        </section>
      </div>
    </div>
  );
}
