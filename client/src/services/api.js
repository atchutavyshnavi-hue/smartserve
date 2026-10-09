import axios from 'axios';

// Central axios instance. Attaches the JWT to every request and
// redirects to /login on a 401 (expired/invalid token).
const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('smartserve_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isPasswordCheck = err.config?.url?.includes('/auth/change-password');
    if (err.response?.status === 401 && !isPasswordCheck) {
      localStorage.removeItem('smartserve_token');
      localStorage.removeItem('smartserve_user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;