import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('smartserve_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('smartserve_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then(({ data }) => {
        setUser(data.data.user);
        localStorage.setItem('smartserve_user', JSON.stringify(data.data.user));
      })
      .catch(() => {
        localStorage.removeItem('smartserve_token');
        localStorage.removeItem('smartserve_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  function persistSession({ user: u, accessToken }) {
    localStorage.setItem('smartserve_token', accessToken);
    localStorage.setItem('smartserve_user', JSON.stringify(u));
    setUser(u);
  }

  function updateUser(u) {
    localStorage.setItem('smartserve_user', JSON.stringify(u));
    setUser(u);
  }

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    persistSession(data.data);
    return data.data.user;
  }

  async function register(payload) {
    const { data } = await api.post('/auth/register', payload);
    persistSession(data.data);
    return data.data.user;
  }

  function logout() {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('smartserve_token');
    localStorage.removeItem('smartserve_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, persistSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}