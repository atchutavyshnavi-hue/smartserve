import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import BackButton from '../components/BackButton';
import { useLanguage } from '../context/LanguageContext';

export default function RestaurantDetail() {
  const { id } = useParams();
  const showToast = useToast();
  const { t, tn } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cart, addItem } = useCart();
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState(null);
  const [eta, setEta] = useState(null);
  const [addingId, setAddingId] = useState(null);

  useEffect(() => {
    api.get(`/restaurants/${id}`).then(({ data }) => setRestaurant(data.data.restaurant));
    api.get(`/restaurants/${id}/menu`).then(({ data }) => setMenu(data.data.menu));
    api.get(`/eta/${id}`).then(({ data }) => setEta(data.data));
  }, [id]);

  async function addToCart(item) {
    if (!user) { navigate('/login'); return; }
    if (user.role !== 'customer') { showToast(t('detail.onlyCustomers'), 'error'); return; }
    setAddingId(item._id);
    try {
      await addItem(item._id, 1);
      showToast(t('detail.added', { name: item.name }), 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not add to cart', 'error');
    } finally {
      setAddingId(null);
    }
  }

  async function startGroupOrder() {
    try {
      const { data } = await api.post('/groups', { restaurantId: id });
      navigate(`/group/${data.data.groupId}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not start group order', 'error');
    }
  }

  if (!restaurant) return <div className="page-loading">{t('detail.loading')}</div>;

  const byCategory = (menu || []).reduce((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="restaurant-detail-page">
      <BackButton fallback="/restaurants" />
      <header className="restaurant-header">
        <h1>{tn(restaurant.name)}</h1>
        <p className="muted">{restaurant.cuisines?.map(tn).join(', ')} · {restaurant.address?.city}</p>
        <div className="restaurant-card-meta">
          <span className="rating-badge">★ {restaurant.rating} ({restaurant.ratingCount})</span>
          <span>{t('detail.prep', { n: restaurant.avgPrepTimeMinutes })}</span>
          <span>{t('detail.forTwo', { n: restaurant.priceForTwo })}</span>
          <span className={restaurant.isOpen ? 'status-open' : 'status-closed'}>
            {restaurant.isOpen ? t('detail.open') : t('detail.closed')}
          </span>
        </div>
        {eta && (
          <p className="eta-banner">
            {t('detail.eta', { min: eta.rangeMinutes.min, max: eta.rangeMinutes.max })}
          </p>
        )}
        <button className="btn-primary-sm group-order-btn" onClick={startGroupOrder}>
          {t('detail.group')}
        </button>
      </header>

      {cart.items.length > 0 && cart.restaurant === id && (
        <div className="surge-banner" style={{ background: '#eef2ff', color: '#4338ca', borderColor: '#c7d2fe' }}>
          {t('detail.inCart', { n: cart.items.reduce((n, i) => n + i.quantity, 0) })}{' '}
          <Link to="/cart" style={{ textDecoration: 'underline', fontWeight: 600 }}>{t('detail.viewCart')}</Link>
        </div>
      )}

      {menu === null ? <p>{t('detail.loadingMenu')}</p> : Object.keys(byCategory).length === 0 ? (
        <p className="muted">{t('detail.noMenu')}</p>
      ) : (
        Object.entries(byCategory).map(([cat, items]) => (
          <section key={cat}>
            <h2>{cat}</h2>
            <div className="menu-list">
              {items.map((item) => (
                <div key={item._id} className="menu-item-card">
                  <div>
                    <h4>{item.isVeg ? '🟢' : '🔴'} {item.name}</h4>
                    <p className="muted">{item.description}</p>
                    <strong>₹{item.price}</strong>
                  </div>
                  <button
                    className="btn-primary-sm"
                    disabled={!item.isAvailable || addingId === item._id}
                    onClick={() => addToCart(item)}
                  >
                    {!item.isAvailable ? t('detail.unavailable') : addingId === item._id ? t('detail.adding') : t('detail.add')}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}