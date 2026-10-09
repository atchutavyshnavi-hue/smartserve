import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import BackButton from '../components/BackButton';

export function billNumber(order) {
  const d = new Date(order.createdAt);
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `SS-${ymd}-${order._id.slice(-6).toUpperCase()}`;
}

export function formatAddress(a) {
  if (!a) return '—';
  return [a.line1, a.city, a.state].filter(Boolean).join(', ') + (a.pincode ? ` – ${a.pincode}` : '');
}

export default function Orders() {
  const { t, tn, lang } = useLanguage();
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.get('/orders').then(({ data }) => setOrders(data.data.orders));
  }, []);

  if (orders === null) return <div className="page-loading">{t('orders.loading')}</div>;

  if (orders.length === 0) {
    return (
      <div className="empty-state">
        <p>{t('orders.none')}</p>
        <Link to="/restaurants" className="btn-primary-sm">{t('common.browse')}</Link>
      </div>
    );
  }

  return (
    <div className="orders-page">
      <BackButton fallback="/" />
      <h2>{t('orders.title')}</h2>
      <div className="orders-list">
        {orders.map((o) => {
          const partner = o.deliveryPartner;
          return (
            <Link key={o._id} to={`/order/${o._id}`} className={`order-card status-${o.status}`}>
              <div className="order-card-top">
                <div>
                  <h4>🍴 {tn(o.restaurant?.name) || t('orders.restaurant')}</h4>
                  <p className="muted small">
                    {t('od.orderId')}: <b>#{o._id.slice(-6).toUpperCase()}</b> · {t('od.billNo')} {billNumber(o)}
                  </p>
                </div>
                <span className={`status-pill ${o.status}`}>{t(`status.${o.status}`)}</span>
              </div>

              <div className="order-card-meta">
                <span>🕒 {new Date(o.createdAt).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span>📍 {formatAddress(o.deliveryAddress)}</span>
                <span>
                  🛵 {partner?.name
                    ? <>{partner.name} <small className="muted">({t('od.partnerId')}: {String(partner._id || partner).slice(-6).toUpperCase()})</small></>
                    : <em className="muted">{t('od.notAssigned')}</em>}
                </span>
              </div>

              <p className="order-card-items">{o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</p>

              <div className="order-card-bottom">
                <strong>₹{o.pricing?.total}</strong>
                <span className="view-link">{t('od.viewDetails')} →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}