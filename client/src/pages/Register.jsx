import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useLanguage } from '../context/LanguageContext';

export default function Register() {
  const { register } = useAuth();
  const showToast = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '', role: 'customer', restaurantName: '', zone: 'central',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(form);
      showToast(t('reg.created'), 'success');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || t('reg.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>{t('reg.title')}</h2>
        {error && <div className="alert-error">{error}</div>}
        <label>{t('reg.name')}
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>{t('reg.email')}
          <input type="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>{t('reg.phone')}
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>{t('reg.password')}
          <input type="password" required minLength={8} value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <label>{t('reg.role')}
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="customer">{t('reg.customer')}</option>
            <option value="restaurant_owner">{t('reg.owner')}</option>
            <option value="delivery_partner">{t('reg.rider')}</option>
          </select>
        </label>

        {form.role === 'restaurant_owner' && (
          <label>{t('reg.restaurantName')}
            <input required value={form.restaurantName}
              onChange={(e) => setForm({ ...form, restaurantName: e.target.value })} />
          </label>
        )}

        {(form.role === 'restaurant_owner' || form.role === 'delivery_partner') && (
          <label>{form.role === 'restaurant_owner' ? t('reg.zoneOwner') : t('reg.zoneRider')}
            <select value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>
              <option value="north">{t('zone.north')}</option>
              <option value="south">{t('zone.south')}</option>
              <option value="east">{t('zone.east')}</option>
              <option value="west">{t('zone.west')}</option>
              <option value="central">{t('zone.central')}</option>
            </select>
          </label>
        )}

        <button className="btn-primary" disabled={submitting} type="submit">
          {submitting ? t('reg.submitting') : t('reg.submit')}
        </button>
        <p className="muted">{t('reg.haveAccount')} <Link to="/login">{t('reg.login')}</Link></p>
      </form>
    </div>
  );
}