const { redisClient } = require('../config/redis');
const MenuItem = require('../models/MenuItem');
const AppError = require('../utils/AppError');

// ---------------------------------------------------------------------
// CART — stored entirely in Redis, not MongoDB.
//
// Why Redis: a cart is transient, mutated constantly (every +/- tap),
// and doesn't need to survive forever — exactly the profile of data
// Redis is built for. MongoDB stores the permanent record (the Order)
// only once checkout succeeds.
//
// Keys used per user `u`:
//   cart:user:{u}            Hash: menuItemId -> quantity
//   cart:user:{u}:restaurant String: the single restaurant this cart belongs to
// Both keys share a 30-minute sliding expiry (EXPIRE 1800), refreshed
// on every mutation — this is section 12's "abandoned cart cleanup".
// ---------------------------------------------------------------------

const CART_TTL_SECONDS = 1800; // 30 minutes

function cartKey(userId) { return `cart:user:${userId}`; }
function cartRestaurantKey(userId) { return `cart:user:${userId}:restaurant`; }

async function touchExpiry(userId) {
  await redisClient.expire(cartKey(userId), CART_TTL_SECONDS);
  await redisClient.expire(cartRestaurantKey(userId), CART_TTL_SECONDS);
}

async function addItem(userId, menuItemId, quantity = 1) {
  const item = await MenuItem.findById(menuItemId);
  if (!item || !item.isAvailable) throw new AppError('Menu item not available', 400);

  const currentRestaurant = await redisClient.get(cartRestaurantKey(userId));
  if (currentRestaurant && currentRestaurant !== String(item.restaurant)) {
    throw new AppError(
      'Your cart has items from a different restaurant. Clear your cart to order from here.',
      409,
    );
  }

  await redisClient.hIncrBy(cartKey(userId), String(item._id), quantity);
  await redisClient.set(cartRestaurantKey(userId), String(item.restaurant));
  await touchExpiry(userId);
  return getCart(userId);
}

async function updateQuantity(userId, menuItemId, quantity) {
  if (quantity <= 0) return removeItem(userId, menuItemId);
  const exists = await redisClient.hExists(cartKey(userId), menuItemId);
  if (!exists) throw new AppError('Item not in cart', 404);
  await redisClient.hSet(cartKey(userId), menuItemId, String(quantity));
  await touchExpiry(userId);
  return getCart(userId);
}

async function removeItem(userId, menuItemId) {
  await redisClient.hDel(cartKey(userId), menuItemId);
  const remaining = await redisClient.hLen(cartKey(userId));
  if (remaining === 0) {
    await redisClient.del(cartRestaurantKey(userId));
  } else {
    await touchExpiry(userId);
  }
  return getCart(userId);
}

async function clearCart(userId) {
  await redisClient.del(cartKey(userId));
  await redisClient.del(cartRestaurantKey(userId));
}

// Reads the Redis hash, then hydrates it against MongoDB for
// authoritative name/price/availability — the frontend never gets to
// dictate a price; we always recompute from the source of truth.
async function getCart(userId) {
  const raw = await redisClient.hGetAll(cartKey(userId)); // { itemId: "qty", ... }
  const itemIds = Object.keys(raw);
  if (itemIds.length === 0) {
    return { restaurant: null, items: [], subtotal: 0 };
  }

  const menuItems = await MenuItem.find({ _id: { $in: itemIds } }).populate('restaurant', 'name zone');
  const items = menuItems.map((mi) => ({
    menuItem: mi._id,
    name: mi.name,
    price: mi.price,
    isVeg: mi.isVeg,
    isAvailable: mi.isAvailable,
    quantity: Number(raw[String(mi._id)] || 0),
  })).filter((i) => i.quantity > 0);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const restaurantId = await redisClient.get(cartRestaurantKey(userId));

  return { restaurant: restaurantId, items, subtotal };
}

module.exports = {
  CART_TTL_SECONDS, cartKey, cartRestaurantKey, addItem, updateQuantity, removeItem, clearCart, getCart, touchExpiry,
};
