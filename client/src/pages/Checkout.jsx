import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useCart } from '../context/CartContext';
import { useToast } from '../components/Toast';
import BackButton from '../components/BackButton';
import { useLanguage } from '../context/LanguageContext';

export default function Checkout() {
  const { cart, refresh } = useCart();
  const navigate = useNavigate();
  const showToast = useToast();
  const { t } = useLanguage();

  const [form, setForm] = useState({
    line1: '', city: '', state: '', pincode: '', zone: 'central', contactPhone: '', paymentMethod: 'cod', couponCode: '',
  });
  const [surge, setSurge] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/pricing/delivery-fee', { params: { zone: form.zone } }).then(({ data }) => setSurge(data.data));
  }, [form.zone]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/orders/checkout', {
        deliveryAddress: { line1: form.line1, city: form.city, state: form.state, pincode: form.pincode, zone: form.zone },
        contactPhone: form.contactPhone,
        paymentMethod: form.paymentMethod,
        couponCode: form.couponCode || undefined,
      });
      showToast(t('checkout.placed'), 'success');
      refresh();
      navigate(`/order/${data.data.order._id}`);
    } catch (err) {
      setError(err.response?.data?.message || t('checkout.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="empty-state">
        <p>{t('common.cartEmpty')}</p>
        <Link to="/restaurants" className="btn-primary-sm">{t('common.browse')}</Link>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <BackButton fallback="/cart" />
      <h2>{t('checkout.title')}</h2>
      <div className="checkout-grid">
        <form className="auth-card" onSubmit={handleSubmit}>
          <label>{t('checkout.address')}
            <input required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
          </label>
          <label>{t('checkout.city')}
            <input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <label>{t('checkout.state')}
            <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </label>
          <label>{t('checkout.pincode')}
            <input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
          </label>
          <label>{t('checkout.zone')}
            <select value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>
              <option value="north">{t('zone.north')}</option>
              <option value="south">{t('zone.south')}</option>
              <option value="east">{t('zone.east')}</option>
              <option value="west">{t('zone.west')}</option>
              <option value="central">{t('zone.central')}</option>
            </select>
          </label>
          <label>{t('checkout.phone')}
            <input required value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </label>
          <label>{t('checkout.coupon')}
            <input value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })} />
          </label>
          <label>{t('checkout.payment')}
            <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value="cod">{t('checkout.cod')}</option>
              <option value="online">{t('checkout.online')}</option>
            </select>
          </label>
          {error && <div className="alert-error">{error}</div>}
          <button className="btn-primary" disabled={submitting} type="submit">
            {submitting ? t('checkout.placing') : t('checkout.place')}
          </button>
        </form>

        <aside className="order-summary">
          <h3>{t('cart.summary')}</h3>
          {cart.items.map((item) => (
            <div key={item.menuItem} className="summary-row">
              <span>{item.name} × {item.quantity}</span>
              <span>₹{item.price * item.quantity}</span>
            </div>
          ))}
          <div className="summary-row"><span>{t('checkout.deliveryFee')}</span><span>₹{surge?.fee ?? '—'}</span></div>
          {surge?.isSurge && <div className="surge-banner">⚡ {surge.message}</div>}
          <div className="summary-row total"><strong>{t('cart.subtotal')}</strong><strong>₹{cart.subtotal}</strong></div>
          <p className="muted small">{t('checkout.finalNote')}</p>
        </aside>
      </div>
    </div>
  );
}