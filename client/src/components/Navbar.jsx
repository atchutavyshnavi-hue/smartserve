import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import NotificationBell from './NotificationBell';
import LanguageSwitcher from './LanguageSwitcher';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isCustomer = user?.role === 'customer';
  const canBrowse = !user || isCustomer || user.role === 'admin';
  const dashboardPath = { restaurant_owner: '/restaurant-dashboard', delivery_partner: '/delivery-dashboard', admin: '/admin' }[user?.role];

  // Close the menu on navigation, outside click, or Escape.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate('/login');
  }

  const initials = user ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '';
  const linkClass = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`;

  return (
    <nav className="navbar">
      <Link to="/" className="brand">🍽️ <span>{t('brand')}</span></Link>

      {/* Only the everyday destinations live on the bar itself. */}
      <div className="nav-primary">
        {canBrowse && <NavLink to="/restaurants" className={linkClass}>{t('nav.restaurants')}</NavLink>}
        {isCustomer && <NavLink to="/orders" className={linkClass}>{t('nav.myOrders')}</NavLink>}
        {dashboardPath && <NavLink to={dashboardPath} className={linkClass}>{user.role === 'admin' ? t('nav.admin') : t('nav.dashboard')}</NavLink>}
      </div>

      <div className="nav-actions">
        <NavLink to="/" end className={({ isActive }) => `icon-btn home-btn ${isActive ? 'active' : ''}`}
          aria-label={t('nav.home')} title={t('nav.home')}>🏠</NavLink>
        {isCustomer && (
          <Link to="/cart" className="icon-btn cart-link" aria-label="Cart">
            🛒{itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
          </Link>
        )}
        {user && <NotificationBell />}
        {!user && (
          <>
            <Link to="/login" className="nav-item">{t('nav.login')}</Link>
            <Link to="/register" className="btn-primary-sm">{t('nav.signup')}</Link>
          </>
        )}

        <div className="menu-wrap" ref={menuRef}>
          <button
            className={`hamburger ${menuOpen ? 'open' : ''}`}
            aria-label={t('nav.menu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span /><span /><span />
          </button>

          {menuOpen && (
            <div className="menu-panel">
              {user && (
                <Link to="/profile" className="menu-user">
                  <span className="avatar-sm">{initials}</span>
                  <div><b>{user.name}</b><small>{user.email}</small></div>
                </Link>
              )}

              <div className="menu-section">
                {/* Mirrors the bar on small screens, where the bar's links are hidden. */}
                <Link to="/" className="menu-link mobile-only">🏠 {t('nav.home')}</Link>
                {canBrowse && <Link to="/restaurants" className="menu-link mobile-only">🍴 {t('nav.restaurants')}</Link>}
                {isCustomer && <Link to="/orders" className="menu-link mobile-only">🧾 {t('nav.myOrders')}</Link>}
                {dashboardPath && <Link to={dashboardPath} className="menu-link mobile-only">📊 {user.role === 'admin' ? t('nav.admin') : t('nav.dashboard')}</Link>}

                {(isCustomer || user?.role === 'admin') && <Link to="/scheduled-orders" className="menu-link">🗓️ {t('nav.scheduled')}</Link>}
                {(isCustomer || user?.role === 'admin') && <Link to="/subscriptions" className="menu-link">🔁 {t('nav.subscriptions')}</Link>}
                {user && <Link to="/profile" className="menu-link">👤 {t('nav.profile')}</Link>}
              </div>

              <div className="menu-section menu-lang">
                <span>🌐 {t('nav.language')}</span>
                <LanguageSwitcher />
              </div>

              {user && (
                <button className="menu-link menu-logout" onClick={handleLogout}>↩ {t('nav.logout')}</button>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}