import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Reset your password</h2>
        {error && <div className="alert-error">{error}</div>}
        {sent ? (
          <p>If an account exists for that email, a reset link has been sent.</p>
        ) : (
          <>
            <label>Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="btn-primary" type="submit">Send reset link</button>
          </>
        )}
        <p className="muted"><Link to="/login">Back to login</Link></p>
      </form>
    </div>
  );
}
