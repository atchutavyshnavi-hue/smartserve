import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useLanguage } from '../context/LanguageContext';

export default function Login() {
  const { login } = useAuth();
  const showToast = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.email, form.password);
      showToast(t('login.welcome'), 'success');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || t('login.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>{t('login.title')}</h2>
        {error && <div className="alert-error">{error}</div>}
        <label>{t('login.email')}
          <input type="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>{t('login.password')}
          <input type="password" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <Link to="/forgot-password" className="link-small">{t('login.forgot')}</Link>
        <button className="btn-primary" disabled={submitting} type="submit">
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>
        <p className="muted">{t('login.noAccount')} <Link to="/register">{t('nav.signup')}</Link></p>
        <p className="muted small">Demo: customer@smartserve.com / Customer@1234</p>
      </form>
    </div>
  );
}