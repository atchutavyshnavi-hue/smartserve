import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../components/Toast';
import BackButton from '../components/BackButton';

const CUISINES = ['Pizza', 'Burgers', 'Indian', 'Chinese', 'Desserts'];
const ZONES = ['North', 'South', 'East', 'West', 'Central'];
const EMPTY_ADDR = { label: 'Home', line1: '', city: '', state: '', pincode: '', zone: 'Central' };

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  return score; // 0..4
}

export default function Profile() {
  const { user, updateUser, persistSession } = useAuth();
  const { t, tn, lang, setLang, languages } = useLanguage();
  const showToast = useToast();
  const [tab, setTab] = useState('details');
  const [stats, setStats] = useState(null);
  const [restaurants, setRestaurants] = useState([]);

  const [details, setDetails] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [savingDetails, setSavingDetails] = useState(false);
  const [editing, setEditing] = useState(false);

  const [adding, setAdding] = useState(false);
  const [addr, setAddr] = useState(EMPTY_ADDR);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const isCustomer = user?.role === 'customer' || user?.role === 'admin';

  useEffect(() => {
    if (!user) return;
    if (user.role === 'customer') {
      api.get('/orders').then(({ data }) => {
        const orders = data.data.orders;
        const spent = orders.filter((o) => o.status !== 'cancelled').reduce((n, o) => n + (o.pricing?.total || 0), 0);
        setStats({ orders: orders.length, spent });
      }).catch(() => {});
    }
    if (user.role === 'restaurant_owner') {
      api.get('/restaurants/mine').then(({ data }) => setRestaurants(data.data.restaurants)).catch(() => {});
    }
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const tabs = ['details', ...(isCustomer ? ['addresses', 'preferences'] : []), 'security'];
  const addresses = user.addresses || [];
  const prefs = user.cuisinePreferences || [];
  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const memberSince = new Date(user.createdAt || Date.now())
    .toLocaleDateString(lang, { month: 'long', year: 'numeric' });
  const detailsChanged = details.name.trim() !== user.name || (details.phone || '') !== (user.phone || '');

  async function saveProfile(updates, successKey) {
    try {
      const { data } = await api.patch('/auth/profile', updates);
      updateUser(data.data.user);
      showToast(t(successKey), 'success');
      return true;
    } catch (err) {
      showToast(err.response?.data?.message || t('profile.saveFailed'), 'error');
      return false;
    }
  }

  async function submitDetails(e) {
    e.preventDefault();
    setSavingDetails(true);
    const ok = await saveProfile({ name: details.name.trim(), phone: details.phone }, 'profile.saved');
    setSavingDetails(false);
    if (ok) setEditing(false);
  }

  function startEdit() {
    setDetails({ name: user.name, phone: user.phone || '' });
    setTab('details');
    setEditing(true);
  }

  function cancelEdit() {
    setDetails({ name: user.name, phone: user.phone || '' });
    setEditing(false);
  }

  async function addAddress(e) {
    e.preventDefault();
    const list = [...addresses, { ...addr, isDefault: addresses.length === 0 }];
    if (await saveProfile({ addresses: list }, 'addr.saved')) { setAddr(EMPTY_ADDR); setAdding(false); }
  }

  function makeDefault(id) {
    saveProfile({ addresses: addresses.map((a) => ({ ...a, isDefault: a._id === id })) }, 'addr.saved');
  }

  function removeAddress(id) {
    const rest = addresses.filter((a) => a._id !== id);
    if (rest.length && !rest.some((a) => a.isDefault)) rest[0] = { ...rest[0], isDefault: true };
    saveProfile({ addresses: rest }, 'addr.removed');
  }

  function toggleCuisine(c) {
    const next = prefs.includes(c) ? prefs.filter((x) => x !== c) : [...prefs, c];
    saveProfile({ cuisinePreferences: next }, 'pref.saved');
  }

  async function submitPassword(e) {
    e.preventDefault();
    setPwError('');
    if (pw.next.length < 8) return setPwError(t('sec.short'));
    if (pw.next !== pw.confirm) return setPwError(t('sec.mismatch'));
    setSavingPw(true);
    try {
      const { data } = await api.patch('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next });
      persistSession(data.data); // server issues fresh tokens after a password change
      setPw({ current: '', next: '', confirm: '' });
      showToast(t('sec.updated'), 'success');
    } catch (err) {
      setPwError(err.response?.data?.message || t('sec.failed'));
    } finally {
      setSavingPw(false);
    }
  }

  const strength = passwordStrength(pw.next);
  const strengthLabel = strength <= 1 ? 'sec.weak' : strength <= 2 ? 'sec.ok' : 'sec.strong';

  return (
    <div className="profile-page">
      <BackButton fallback="/" />
      <div className="profile-hero">
        <div className="avatar">{initials}</div>
        <div>
          <h2>{user.name}</h2>
          <span className="role-badge">{t(`profile.role.${user.role}`)}</span>
          <p className="hero-sub">{user.email} · {t('profile.memberSince', { date: memberSince })}</p>
        </div>
        <button className="pen-btn hero-pen" onClick={startEdit} title={t('profile.editProfile')} aria-label={t('profile.editProfile')}>✏️</button>
      </div>

      <div className="stats-cards">
        {user.role === 'customer' && stats && (
          <>
            <div className="stat-card"><strong>🧾 {stats.orders}</strong><span>{t('profile.stat.orders')}</span></div>
            <div className="stat-card"><strong>💰 ₹{stats.spent}</strong><span>{t('profile.stat.spent')}</span></div>
            <div className="stat-card"><strong>📍 {addresses.length}</strong><span>{t('profile.stat.addresses')}</span></div>
          </>
        )}
        {user.role === 'delivery_partner' && user.zone && (
          <div className="stat-card"><strong>{t(`zone.${user.zone}`)}</strong><span>{t('profile.zone')}</span></div>
        )}
        {user.role === 'restaurant_owner' && restaurants.length > 0 && (
          <div className="stat-card wide">
            <strong>{restaurants.map((r) => tn(r.name)).join(', ')}</strong><span>{t('profile.restaurants')}</span>
          </div>
        )}
      </div>

      <div className="tab-row">
        {tabs.map((k) => (
          <button key={k} className={`tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {t(`profile.tab.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="profile-card">
          <div className="card-head">
            <h3>{t('profile.personal')}</h3>
            {!editing && (
              <button className="pen-btn" onClick={startEdit} title={t('profile.edit')} aria-label={t('profile.edit')}>✏️ <span>{t('profile.edit')}</span></button>
            )}
          </div>

          {editing ? (
            <form className="edit-form" onSubmit={submitDetails}>
              <label>{t('profile.name')}
                <input autoFocus required value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
              </label>
              <label>{t('profile.email')}
                <input value={user.email} disabled />
              </label>
              <label>{t('profile.phone')}
                <input type="tel" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} />
              </label>
              <div className="form-actions">
                <button className="btn-primary" type="submit" disabled={savingDetails || !detailsChanged}>
                  {savingDetails ? t('profile.saving') : t('profile.save')}
                </button>
                <button className="btn-ghost" type="button" onClick={cancelEdit}>{t('profile.cancel')}</button>
              </div>
            </form>
          ) : (
            <div className="info-list">
              <div className="info-row"><span className="info-icon">👤</span><div><small>{t('profile.name')}</small><b>{user.name}</b></div></div>
              <div className="info-row"><span className="info-icon">✉️</span><div><small>{t('profile.email')}</small><b>{user.email}</b></div></div>
              <div className="info-row"><span className="info-icon">📞</span><div><small>{t('profile.phone')}</small><b>{user.phone || <em>{t('profile.notSet')}</em>}</b></div></div>
            </div>
          )}

          <div className="lang-block">
            <small>🌐 {t('profile.language')}</small>
            <div className="chip-row">
              {languages.map((l) => (
                <button type="button" key={l.code} className={`chip ${lang === l.code ? 'selected' : ''}`}
                  onClick={() => setLang(l.code)}>{l.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'addresses' && (
        <div className="profile-card wide">
          <h3>{t('addr.title')}</h3>
          {addresses.length === 0 && !adding && <p className="muted">{t('addr.none')}</p>}
          {addresses.map((a) => (
            <div key={a._id} className={`address-card ${a.isDefault ? 'is-default' : ''}`}>
              <div>
                <strong>📍 {a.label}</strong>
                {a.isDefault && <span className="role-badge">{t('addr.default')}</span>}
                <p className="muted small">
                  {a.line1}, {a.city}{a.state ? `, ${a.state}` : ''}{a.pincode ? ` – ${a.pincode}` : ''}
                  {' '}({t(`zone.${(a.zone || 'Central').toLowerCase()}`)})
                </p>
              </div>
              <div>
                {!a.isDefault && <button className="btn-link" onClick={() => makeDefault(a._id)}>{t('addr.setDefault')}</button>}
                <button className="btn-link" onClick={() => removeAddress(a._id)}>{t('addr.remove')}</button>
              </div>
            </div>
          ))}

          {adding ? (
            <form onSubmit={addAddress} className="address-form">
              <input placeholder={t('addr.label')} value={addr.label} onChange={(e) => setAddr({ ...addr, label: e.target.value })} />
              <input required placeholder={t('addr.line1')} value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
              <input required placeholder={t('checkout.city')} value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
              <input placeholder={t('checkout.state')} value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} />
              <input placeholder={t('checkout.pincode')} value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value })} />
              <select value={addr.zone} onChange={(e) => setAddr({ ...addr, zone: e.target.value })}>
                {ZONES.map((z) => <option key={z} value={z}>{t(`zone.${z.toLowerCase()}`)}</option>)}
              </select>
              <div>
                <button className="btn-primary-sm" type="submit">{t('addr.save')}</button>
                <button className="btn-link" type="button" onClick={() => { setAdding(false); setAddr(EMPTY_ADDR); }}>{t('addr.cancel')}</button>
              </div>
            </form>
          ) : (
            <button className="btn-primary-sm" onClick={() => setAdding(true)}>{t('addr.add')}</button>
          )}
        </div>
      )}

      {tab === 'preferences' && (
        <div className="profile-card wide">
          <h3>{t('pref.title')}</h3>
          <p className="muted small">{t('pref.hint')}</p>
          <div className="chip-row">
            {CUISINES.map((c) => (
              <button key={c} type="button" className={`chip ${prefs.includes(c) ? 'selected' : ''}`}
                onClick={() => toggleCuisine(c)}>
                {prefs.includes(c) ? '✓ ' : ''}{tn(c)}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'security' && (
        <form className="profile-card" onSubmit={submitPassword}>
          <h3>{t('sec.title')}</h3>
          {pwError && <div className="alert-error">{pwError}</div>}
          <label>{t('sec.current')}
            <input type={showPw ? 'text' : 'password'} required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </label>
          <label>{t('sec.new')}
            <input type={showPw ? 'text' : 'password'} required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </label>
          {pw.next && (
            <div className="strength">
              <div className="strength-bar"><span className={`s${strength}`} style={{ width: `${(strength / 4) * 100}%` }} /></div>
              <span className="small muted">{t(strengthLabel)}</span>
            </div>
          )}
          <label>{t('sec.confirm')}
            <input type={showPw ? 'text' : 'password'} required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </label>
          <button type="button" className="btn-link" onClick={() => setShowPw(!showPw)}>{showPw ? t('sec.hide') : t('sec.show')}</button>
          <button className="btn-primary" type="submit" disabled={savingPw}>{t('sec.update')}</button>
        </form>
      )}
    </div>
  );
}