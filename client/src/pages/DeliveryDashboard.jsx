import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import useSocket from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useLanguage } from '../context/LanguageContext';

const TABS = ['Available', 'My Deliveries', 'Earnings'];
const NEXT_STATUS = { rider_assigned: 'out_for_delivery', out_for_delivery: 'delivered' };

export default function DeliveryDashboard() {
  const { user } = useAuth();
  const showToast = useToast();
  const { t, tn } = useLanguage();
  const [tab, setTab] = useState('Available');
  const [available, setAvailable] = useState(null);
  const [mine, setMine] = useState(null);
  const [earnings, setEarnings] = useState(null);

  function refreshAvailable() {
    api.get('/orders/delivery/available').then(({ data }) => setAvailable(data.data.orders));
  }
  function refreshMine() {
    api.get('/orders/delivery/mine').then(({ data }) => setMine(data.data.orders));
  }
  function refreshEarnings() {
    api.get('/orders/delivery/earnings').then(({ data }) => setEarnings(data.data));
  }

  useEffect(() => {
    if (tab === 'Available') refreshAvailable();
    if (tab === 'My Deliveries') refreshMine();
    if (tab === 'Earnings') refreshEarnings();
  }, [tab]);

  // A cancelled-and-redirected delivery (see orderRedirect.service.js on
  // the backend) swaps this rider's drop-off mid-trip — same pickup,
  // new address. React to it live instead of making the rider refresh.
  useSocket(user ? `user:${user._id}` : null, useCallback((payload) => {
    if (payload.deliveryAddress && payload.previousOrderId) {
      showToast(t('delivery.addressUpdated'), 'info');
      if (tab === 'My Deliveries') refreshMine();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, t]));

  async function acceptDelivery(orderId) {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: 'rider_assigned' });
      showToast(t('delivery.accepted'), 'success');
      refreshAvailable();
    } catch (err) {
      showToast(err.response?.data?.message || t('delivery.acceptFailed'), 'error');
    }
  }

  async function advance(orderId, current) {
    const next = NEXT_STATUS[current];
    if (!next) return;
    try {
      await api.patch(`/orders/${orderId}/status`, { status: next });
      showToast(t('delivery.marked', { status: t(`status.${next}`) }), 'success');
      refreshMine();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not update', 'error');
    }
  }

  return (
    <div className="dashboard-page">
      <h2>{t('delivery.title')}</h2>
      <div className="tab-row">
        {TABS.map((tabName) => (
          <button key={tabName} className={`tab-btn ${tab === tabName ? 'active' : ''}`} onClick={() => setTab(tabName)}>{t(`delivery.tab.${tabName}`)}</button>
        ))}
      </div>

      {tab === 'Available' && (
        <div className="menu-list">
          {available === null ? <p>{t('common.loading')}</p> : available.length === 0 ? (
            <p className="muted">{t('delivery.none')}</p>
          ) : available.map((o) => (
            <div key={o._id} className="delivery-order-card">
              <div className="delivery-order-header">
                <h4>{tn(o.restaurant?.name)}</h4>
                <span className="muted small">#{o._id.slice(-6).toUpperCase()}</span>
              </div>
              <p className="muted small">
                {o.items.map((i) => `${i.name} x${i.quantity}`).join(', ')}
              </p>
              <FullAddress address={o.deliveryAddress} />
              <strong>{t('delivery.fee')}: ₹{o.pricing.deliveryFee}</strong>
              <button className="btn-primary-sm" onClick={() => acceptDelivery(o._id)}>{t('delivery.accept')}</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'My Deliveries' && (
        <div className="menu-list">
          {mine === null ? <p>{t('common.loading')}</p> : mine.length === 0 ? (
            <p className="muted">{t('delivery.noneMine')}</p>
          ) : mine.map((o) => (
            <div key={o._id} className="delivery-order-card">
              {o.fulfilledViaRedirect && (
                <div className="surge-banner">
                  {t('delivery.reassigned')}
                </div>
              )}
              <div className="delivery-order-header">
                <h4>{tn(o.restaurant?.name)}</h4>
                <span className="muted small">#{o._id.slice(-6).toUpperCase()}</span>
              </div>
              <p className="muted small">
                {o.items.map((i) => `${i.name} x${i.quantity}`).join(', ')}
              </p>
              <FullAddress address={o.deliveryAddress} />
              {o.contactPhone && <p className="muted small">📞 {o.contactPhone}</p>}
              <span className={o.status === 'cancelled' ? 'status-closed' : o.status === 'delivered' ? 'status-open' : ''}>
                {t(`status.${o.status}`)}
              </span>
              {NEXT_STATUS[o.status] && (
                <button className="btn-primary-sm" onClick={() => advance(o._id, o.status)}>
                  {t('delivery.markAs', { status: t(`status.${NEXT_STATUS[o.status]}`) })}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'Earnings' && earnings && (
        <div className="stats-cards">
          <div className="stat-card"><strong>{earnings.completedDeliveries}</strong><span>{t('delivery.completed')}</span></div>
          <div className="stat-card"><strong>₹{earnings.totalEarnings}</strong><span>{t('delivery.totalEarnings')}</span></div>
        </div>
      )}
    </div>
  );
}

// The one piece of information a rider actually needs to do their job —
// printed in full every time, not just the city, so two orders in the
// same city (or the same restaurant) are never ambiguous.
function FullAddress({ address }) {
  const { t } = useLanguage();
  if (!address) return null;
  return (
    <p className="delivery-address">
      📍 {address.line1}{address.line1 ? ', ' : ''}{address.city}
      {address.state ? `, ${address.state}` : ''}{address.pincode ? ` – ${address.pincode}` : ''}
      {' '}<span className="muted small">({t('delivery.zoneLabel', { zone: t(`zone.${address.zone}`) })})</span>
    </p>
  );
}