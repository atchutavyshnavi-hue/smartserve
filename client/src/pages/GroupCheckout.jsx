import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../components/Toast';

export default function GroupCheckout() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();

  const [group, setGroup] = useState(null);
  const [surge, setSurge] = useState(null);
  const [form, setForm] = useState({
    line1: '', city: '', state: '', pincode: '', zone: 'central', contactPhone: '', paymentMethod: 'cod',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/groups/${groupId}`).then(({ data }) => setGroup(data.data.group)).catch((err) => {
      setError(err.response?.data?.message || 'Group order not found');
    });
  }, [groupId]);

  useEffect(() => {
    api.get('/pricing/delivery-fee', { params: { zone: form.zone } }).then(({ data }) => setSurge(data.data));
  }, [form.zone]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post(`/groups/${groupId}/checkout`, {
        deliveryAddress: { line1: form.line1, city: form.city, state: form.state, pincode: form.pincode, zone: form.zone },
        contactPhone: form.contactPhone,
        paymentMethod: form.paymentMethod,
      });
      showToast('Group order placed!', 'success');
      navigate(`/order/${data.data.order._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <div className="empty-state">{error}</div>;
  if (!group) return <div className="page-loading">Loading...</div>;

  return (
    <div className="checkout-page">
      <h2>Checkout — Group Order {groupId}</h2>
      <div className="checkout-grid">
        <form className="auth-card" onSubmit={handleSubmit}>
          <label>Address line
            <input required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
          </label>
          <label>City
            <input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <label>State
            <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </label>
          <label>Pincode
            <input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
          </label>
          <label>Delivery zone
            <select value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>
              <option value="north">North</option>
              <option value="south">South</option>
              <option value="east">East</option>
              <option value="west">West</option>
              <option value="central">Central</option>
            </select>
          </label>
          <label>Contact phone
            <input required value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </label>
          <label>Payment method
            <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value="cod">Cash on Delivery</option>
              <option value="online">Online Payment (mock)</option>
            </select>
          </label>
          {error && <div className="alert-error">{error}</div>}
          <button className="btn-primary" disabled={submitting} type="submit">
            {submitting ? 'Placing order...' : `Place order — ₹${group.subtotal}`}
          </button>
        </form>

        <aside className="order-summary">
          <h3>Order summary</h3>
          {group.items.map((item) => (
            <div key={item.menuItem} className="summary-row">
              <span>{item.name} × {item.quantity}</span>
              <span>₹{item.price * item.quantity}</span>
            </div>
          ))}
          <div className="summary-row"><span>Delivery fee</span><span>₹{surge?.fee ?? '—'}</span></div>
          {surge?.isSurge && <div className="surge-banner">⚡ {surge.message}</div>}
          <div className="summary-row total"><strong>Subtotal</strong><strong>₹{group.subtotal}</strong></div>
          <p className="muted small">Tax is calculated at checkout.</p>
        </aside>
      </div>
    </div>
  );
}
