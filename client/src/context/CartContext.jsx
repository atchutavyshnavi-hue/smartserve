import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

// Cart lives in Redis on the backend (30-min sliding TTL) — this context
// is just a thin, always-in-sync client mirror of it, shared across
// pages so the navbar badge, the restaurant page and the cart page never
// drift apart.
export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState({ restaurant: null, items: [], subtotal: 0 });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!user || user.role !== 'customer') {
      setCart({ restaurant: null, items: [], subtotal: 0 });
      return;
    }
    setLoading(true);
    api.get('/cart')
      .then(({ data }) => setCart(data.data.cart))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(refresh, [refresh]);

  async function addItem(menuItemId, quantity = 1) {
    const { data } = await api.post('/cart/items', { menuItemId, quantity });
    setCart(data.data.cart);
    return data.data.cart;
  }

  async function updateQuantity(menuItemId, quantity) {
    const { data } = await api.patch(`/cart/items/${menuItemId}`, { quantity });
    setCart(data.data.cart);
  }

  async function removeItem(menuItemId) {
    const { data } = await api.delete(`/cart/items/${menuItemId}`);
    setCart(data.data.cart);
  }

  async function clearCart() {
    await api.delete('/cart');
    setCart({ restaurant: null, items: [], subtotal: 0 });
  }

  const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, loading, itemCount, refresh, addItem, updateQuantity, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
