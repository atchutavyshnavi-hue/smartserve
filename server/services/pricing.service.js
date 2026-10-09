const TAX_RATE = 0.05; // 5% flat tax for demo purposes

// Base delivery fee before any surge adjustment. Phase 5 (surge pricing)
// replaces this with a Redis-driven zone-demand lookup — see
// services/surge.service.js once that phase lands. Kept here as the
// single fallback so checkout works before Phase 5 exists.
const BASE_DELIVERY_FEE = 30;

function calculateTax(subtotal) {
  return Math.round(subtotal * TAX_RATE);
}

function calculatePricing({ subtotal, deliveryFee = BASE_DELIVERY_FEE, discount = 0 }) {
  const tax = calculateTax(subtotal);
  const total = Math.max(subtotal + tax + deliveryFee - discount, 0);
  return { subtotal, tax, deliveryFee, discount, total: Math.round(total) };
}

module.exports = { TAX_RATE, BASE_DELIVERY_FEE, calculateTax, calculatePricing };
