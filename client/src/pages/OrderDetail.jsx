import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import useSocket from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../components/Toast';
import BackButton from '../components/BackButton';
import { billNumber, formatAddress } from './Orders';

const STEPS = ['placed', 'accepted', 'preparing', 'ready', 'rider_assigned', 'out_for_delivery', 'delivered'];
// Mirrors the backend's transition table (order.controller.js) so staff
// only ever see valid next steps — the server re-validates regardless.
const NEXT_STATUS = {
  placed: 'accepted', accepted: 'preparing', preparing: 'ready',
  ready: 'rider_assigned', rider_assigned: 'out_for_delivery', out_for_delivery: 'delivered',
};
const BACK_FOR_ROLE = { customer: '/orders', restaurant_owner: '/restaurant-dashboard', delivery_partner: '/delivery-dashboard', admin: '/admin' };

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, tn, lang } = useLanguage();
  const showToast = useToast();
  const [order, setOrder] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  function refresh() {
    api.get(`/orders/${id}`).then(({ data }) => setOrder(data.data.order));
  }

  useEffect(refresh, [id]);

  // Live status updates land here in real time via the order:{id} room —
  // this is the "customer never needs to refresh" requirement in action.
  useSocket(`order:${id}`, () => refresh());

  async function advanceStatus() {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setUpdating(true);
    try {
      await api.patch(`/orders/${id}/status`, { status: next });
      showToast(t('rd.marked', { status: t(`status.${next}`) }), 'success');
      refresh();
    } catch (err) {
      showToast(err.response?.data?.message || t('od.updateFailed'), 'error');
    } finally {
      setUpdating(false);
    }
  }

  async function cancelOrder() {
    if (!window.confirm(t('od.confirmCancel'))) return;
    setCancelling(true);
    try {
      await api.patch(`/orders/${id}/cancel`);
      showToast(t('od.cancelled'), 'success');
      refresh();
    } catch (err) {
      showToast(err.response?.data?.message || t('od.updateFailed'), 'error');
    } finally {
      setCancelling(false);
    }
  }

  if (!order) return <div className="page-loading">{t('od.loading')}</div>;

  const currentIndex = STEPS.indexOf(order.status);
  const canAdvance = ['restaurant_owner', 'delivery_partner', 'admin'].includes(user.role) && NEXT_STATUS[order.status];
  // Customers may cancel while 'placed' or 'out_for_delivery' (the backend may
  // silently redirect the cooked food to another matching order first).
  const canCancel = user.role === 'customer' && ['placed', 'out_for_delivery'].includes(order.status);
  const p = order.pricing || {};
  const partner = order.deliveryPartner;
  const when = (d) => new Date(d).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' });
  const historyAt = (s) => order.statusHistory?.find((h) => h.status === s)?.at;

  return (
    <div className="order-detail-page">
      <BackButton fallback={BACK_FOR_ROLE[user.role] || '/'} />

      <div className="od-header">
        <div>
          <h2>{t('od.orderId')} #{order._id.slice(-6).toUpperCase()}</h2>
          <p className="muted small">{t('od.billNo')} {billNumber(order)} · {t('od.placedOn')} {when(order.createdAt)}</p>
        </div>
        <span className={`status-pill ${order.status}`}>{t(`status.${order.status}`)}</span>
      </div>

      {order.estimatedDeliveryMinutes && !['delivered', 'cancelled'].includes(order.status) && (
        <p className="eta-banner">{t('od.eta', { n: order.estimatedDeliveryMinutes })}</p>
      )}

      <section className="od-card">
        {order.status === 'cancelled' ? (
          <p className="status-closed">{t('od.wasCancelled')}</p>
        ) : (
          <ol className="status-timeline">
            {STEPS.map((step, i) => (
              <li key={step} className={i <= currentIndex ? 'done' : ''}>
                {t(`status.${step}`)}
                {historyAt(step) && <small>{new Date(historyAt(step)).toLocaleTimeString(lang, { timeStyle: 'short' })}</small>}
              </li>
            ))}
          </ol>
        )}
        <div className="od-actions">
          {canAdvance && (
            <button className="btn-primary-sm" disabled={updating} onClick={advanceStatus}>
              {updating ? t('od.updating') : t('rd.markAs', { status: t(`status.${NEXT_STATUS[order.status]}`) })}
            </button>
          )}
          {canCancel && (
            <button className="btn-danger-outline" disabled={cancelling} onClick={cancelOrder}>
              {cancelling ? t('od.cancelling') : t('od.cancel')}
            </button>
          )}
        </div>
      </section>

      <div className="od-grid">
        <section className="od-card">
          <h3>🍴 {t('od.restaurant')}</h3>
          <p><b>{tn(order.restaurant?.name)}</b></p>
          {order.restaurant?.address?.line1 && <p className="muted small">{formatAddress(order.restaurant.address)}</p>}

          <h3>📍 {t('od.deliveryAddress')}</h3>
          <p>{formatAddress(order.deliveryAddress)}</p>
          <p className="muted small">{t('delivery.zoneLabel', { zone: t(`zone.${order.deliveryAddress?.zone}`) })}</p>
          {order.contactPhone && <p className="muted small">📞 {order.contactPhone}</p>}
        </section>

        <section className="od-card">
          <h3>🛵 {t('od.partner')}</h3>
          {partner?.name ? (
            <>
              <p><b>{partner.name}</b></p>
              <p className="muted small">{t('od.partnerId')}: {String(partner._id).slice(-6).toUpperCase()}</p>
              {partner.phone && <p className="muted small">📞 {partner.phone}</p>}
            </>
          ) : <p className="muted">{t('od.notAssigned')}</p>}

          <h3>💳 {t('od.payment')}</h3>
          <p>{order.paymentMethod === 'cod' ? t('checkout.cod') : t('checkout.online')}
            {' · '}<span className={`pay-badge ${order.paymentStatus}`}>{t(`od.pay.${order.paymentStatus}`)}</span></p>
        </section>
      </div>

      <section className="od-card bill">
        <h3>🧾 {t('od.billDetails')}</h3>
        <p className="muted small">{t('od.billNo')}: {billNumber(order)}</p>
        {order.items.map((item, i) => (
          <div key={i} className="summary-row">
            <span>{item.name} × {item.quantity} <small className="muted">(₹{item.price} each)</small></span>
            <span>₹{item.price * item.quantity}</span>
          </div>
        ))}
        <hr />
        <div className="summary-row"><span>{t('od.subtotal')}</span><span>₹{p.subtotal}</span></div>
        <div className="summary-row"><span>{t('od.tax')}</span><span>₹{p.tax}</span></div>
        <div className="summary-row">
          <span>{t('od.deliveryFee')}{p.surgeApplied && <small className="muted"> ({t('od.surge')})</small>}</span>
          <span>₹{p.deliveryFee}</span>
        </div>
        {p.discount > 0 && (
          <div className="summary-row discount"><span>{t('od.discount')}{p.couponCode ? ` (${p.couponCode})` : ''}</span><span>−₹{p.discount}</span></div>
        )}
        <div className="summary-row total"><strong>{t('od.total')}</strong><strong>₹{p.total}</strong></div>
      </section>
    </div>
  );
}