import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useSocket from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../components/Toast';

const ICONS = {
  new_order: '🛎️', order_accepted: '✅', order_preparing: '👨‍🍳', order_ready: '🍽️', rider_assigned: '🛵',
  out_for_delivery: '🚚', delivered: '🎉', order_cancelled: '❌', flash_deal: '⚡',
};

export default function NotificationBell() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const showToast = useToast();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    api.get('/notifications', { params: { unreadOnly: true } }).then(({ data }) => {
      setUnreadCount(data.data.unreadCount);
    }).catch(() => {});
  }, [user]);

  // Real-time push via the notify:{userId} -> notification:new bridge.
  useSocket(user ? `user:${user._id}` : null, (payload) => {
    if (!payload.title) return;
    showToast(payload.title, 'info');
    if (open) {
      // Panel is open: the user is looking at it, so show it and keep it read.
      setItems((list) => [{ ...payload, _id: payload.id || `live-${Date.now()}`, createdAt: new Date().toISOString(), fresh: true }, ...list]);
      if (payload.id) api.patch(`/notifications/${payload.id}/read`).catch(() => {});
    } else {
      setUnreadCount((c) => c + 1);
    }
  });

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openPanel = useCallback(async () => {
    setOpen(true);
    try {
      const { data } = await api.get('/notifications');
      // Remember which were unread so they stay highlighted while the panel is open...
      setItems(data.data.notifications.map((n) => ({ ...n, fresh: !n.isRead })));
      // ...but they are now "read": clear the badge and persist it.
      if (data.data.unreadCount > 0) {
        setUnreadCount(0);
        api.patch('/notifications/read-all').catch(() => {});
      }
    } catch { /* leave panel empty */ }
  }, []);

  function go(n) {
    setOpen(false);
    const orderId = n.data?.orderId;
    if (user.role === 'customer' && orderId) navigate(`/order/${orderId}`);
    else if (user.role === 'restaurant_owner') navigate('/restaurant-dashboard');
    else if (user.role === 'delivery_partner') navigate('/delivery-dashboard');
  }

  if (!user) return null;
  return (
    <div className="notification-wrap" ref={wrapRef}>
      <button
        className="notification-bell"
        title={t('notif.unread', { n: unreadCount })}
        aria-label={t('notif.title')}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        🔔{unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-head">{t('notif.title')}</div>
          {items.length === 0 ? (
            <p className="notification-empty">{t('notif.empty')}</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n._id} className={n.fresh ? 'fresh' : ''} onClick={() => go(n)}>
                  <span className="notification-icon">{ICONS[n.type] || '🔔'}</span>
                  <div>
                    <b>{n.title}</b>
                    <p>{n.message}</p>
                    <small>{new Date(n.createdAt).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })}</small>
                  </div>
                  {n.fresh && <span className="dot" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}