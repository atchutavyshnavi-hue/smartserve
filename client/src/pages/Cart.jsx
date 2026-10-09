import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../components/Toast';
import BackButton from '../components/BackButton';
import { useLanguage } from '../context/LanguageContext';

export default function Cart() {
  const { cart, loading, updateQuantity, removeItem, clearCart } = useCart();
  const showToast = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();

  async function changeQty(menuItemId, delta, current) {
    const next = current + delta;
    try {
      if (next <= 0) await removeItem(menuItemId);
      else await updateQuantity(menuItemId, next);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not update cart', 'error');
    }
  }

  if (loading && cart.items.length === 0) return <div className="page-loading">{t('cart.loading')}</div>;

  if (cart.items.length === 0) {
    return (
      <div className="empty-state">
        <p>{t('common.cartEmpty')}</p>
        <Link to="/restaurants" className="btn-primary-sm">{t('common.browse')}</Link>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <BackButton fallback="/restaurants" />
      <h2>{t('cart.title')}</h2>
      <div className="checkout-grid">
        <div className="menu-list">
          {cart.items.map((item) => (
            <div key={item.menuItem} className="menu-item-card">
              <div>
                <h4>{item.isVeg ? '🟢' : '🔴'} {item.name}</h4>
                <strong>₹{item.price}</strong>
                {!item.isAvailable && <p className="alert-error small">{t('cart.noLonger')}</p>}
              </div>
              <div className="qty-stepper">
                <button className="btn-primary-sm" onClick={() => changeQty(item.menuItem, -1, item.quantity)}>−</button>
                <span>{item.quantity}</span>
                <button className="btn-primary-sm" onClick={() => changeQty(item.menuItem, 1, item.quantity)}>+</button>
              </div>
            </div>
          ))}
          <button className="btn-link" onClick={() => clearCart()}>{t('cart.clear')}</button>
        </div>

        <aside className="order-summary">
          <h3>{t('cart.summary')}</h3>
          {cart.items.map((item) => (
            <div key={item.menuItem} className="summary-row">
              <span>{item.name} × {item.quantity}</span>
              <span>₹{item.price * item.quantity}</span>
            </div>
          ))}
          <div className="summary-row total"><strong>{t('cart.subtotal')}</strong><strong>₹{cart.subtotal}</strong></div>
          <p className="muted small">{t('cart.note')}</p>
          <button
            className="btn-primary"
            disabled={cart.items.some((i) => !i.isAvailable)}
            onClick={() => navigate('/checkout')}
          >
            {t('cart.checkout')}
          </button>
        </aside>
      </div>
    </div>
  );
}