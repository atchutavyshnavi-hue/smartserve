const crypto = require('crypto');
const { redisClient, redisPub } = require('../config/redis');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const AppError = require('../utils/AppError');

// ---------------------------------------------------------------------
// GROUP ORDERING — real-time shared cart via Redis Hash + Pub/Sub.
//
// Keys per group `g`:
//   group:{g}:meta      Hash: { restaurantId, creatorId, status, createdAt }
//   group:{g}:members   Hash: userId -> JSON { name, joinedAt }
//   cart:group:{g}      Hash: "{menuItemId}:{userId}" -> quantity
//
// The cart hash field is "{itemId}:{userId}" rather than plain itemId.
// This is what makes "remove their own items" and "see who added each
// item" possible with a single Redis Hash — HGETALL still gives us the
// exact structure the spec asks for (item -> qty), we just fold the
// adder into the field name and aggregate on read.
//
// All three keys share a 6-hour sliding TTL — long enough for a real
// group order session, short enough not to leak forever.
//
// PUB/SUB: every mutation publishes a JSON event to channel
// `group:{g}`. server.js keeps one pattern-subscription open
// (PSUBSCRIBE group:*) and re-emits each message to the Socket.IO room
// `group:{g}`. This indirection (Redis Pub/Sub -> Socket.IO) is what
// lets the app scale to multiple Node.js instances: whichever instance
// handles the HTTP mutation publishes to Redis, and EVERY instance's
// Socket.IO layer (each subscribed to the same pattern) delivers it to
// its own locally-connected sockets.
// ---------------------------------------------------------------------

const GROUP_TTL_SECONDS = 6 * 60 * 60; // 6 hours

function metaKey(groupId) { return `group:${groupId}:meta`; }
function membersKey(groupId) { return `group:${groupId}:members`; }
function cartKey(groupId) { return `cart:group:${groupId}`; }

async function touchExpiry(groupId) {
  await Promise.all([
    redisClient.expire(metaKey(groupId), GROUP_TTL_SECONDS),
    redisClient.expire(membersKey(groupId), GROUP_TTL_SECONDS),
    redisClient.expire(cartKey(groupId), GROUP_TTL_SECONDS),
  ]);
}

async function publish(groupId, event) {
  await redisPub.publish(`group:${groupId}`, JSON.stringify({ groupId, at: Date.now(), ...event }));
}

function generateGroupId() {
  // Short, shareable, matches the spec's "GRP999" style.
  return `GRP${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function assertActiveGroup(groupId) {
  const meta = await redisClient.hGetAll(metaKey(groupId));
  if (!meta || !meta.restaurantId) throw new AppError('Group order not found or has expired', 404);
  if (meta.status !== 'active') throw new AppError('This group order has already been checked out', 409);
  return meta;
}

async function createGroup(creatorId, creatorName, restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new AppError('Restaurant not found', 404);

  const groupId = generateGroupId();
  await redisClient.hSet(metaKey(groupId), {
    restaurantId: String(restaurantId),
    creatorId: String(creatorId),
    status: 'active',
    createdAt: String(Date.now()),
  });
  await redisClient.hSet(membersKey(groupId), String(creatorId), JSON.stringify({
    name: creatorName, joinedAt: Date.now(),
  }));
  await touchExpiry(groupId);
  return groupId;
}

async function joinGroup(groupId, userId, userName) {
  await assertActiveGroup(groupId);
  await redisClient.hSet(membersKey(groupId), String(userId), JSON.stringify({
    name: userName, joinedAt: Date.now(),
  }));
  await touchExpiry(groupId);
  await publish(groupId, { type: 'member_joined', userId, name: userName });
  return getGroupState(groupId);
}

async function addItem(groupId, userId, menuItemId, quantity = 1) {
  const meta = await assertActiveGroup(groupId);
  const item = await MenuItem.findById(menuItemId);
  if (!item || !item.isAvailable) throw new AppError('Menu item not available', 400);
  if (String(item.restaurant) !== meta.restaurantId) {
    throw new AppError('This item is not on the group order\'s restaurant menu', 400);
  }

  const field = `${menuItemId}:${userId}`;
  const newQty = await redisClient.hIncrBy(cartKey(groupId), field, quantity);
  await touchExpiry(groupId);
  await publish(groupId, {
    type: 'item_added', menuItemId, userId, quantity: newQty, name: item.name, price: item.price,
  });
  return getGroupState(groupId);
}

async function updateQuantity(groupId, userId, menuItemId, quantity) {
  await assertActiveGroup(groupId);
  const field = `${menuItemId}:${userId}`;
  const exists = await redisClient.hExists(cartKey(groupId), field);
  if (!exists) throw new AppError('You have not added this item', 404);

  if (quantity <= 0) return removeItem(groupId, userId, menuItemId);

  await redisClient.hSet(cartKey(groupId), field, String(quantity));
  await touchExpiry(groupId);
  await publish(groupId, { type: 'item_updated', menuItemId, userId, quantity });
  return getGroupState(groupId);
}

async function removeItem(groupId, userId, menuItemId) {
  await assertActiveGroup(groupId);
  const field = `${menuItemId}:${userId}`;
  await redisClient.hDel(cartKey(groupId), field);
  await touchExpiry(groupId);
  await publish(groupId, { type: 'item_removed', menuItemId, userId });
  return getGroupState(groupId);
}

// Aggregates the "{itemId}:{userId} -> qty" hash into:
//  - a per-item total (what the group is ordering, summed across everyone)
//  - a per-line breakdown (who added what, for the "see who added each item" UI)
async function getGroupState(groupId) {
  const [meta, membersRaw, cartRaw] = await Promise.all([
    redisClient.hGetAll(metaKey(groupId)),
    redisClient.hGetAll(membersKey(groupId)),
    redisClient.hGetAll(cartKey(groupId)),
  ]);
  if (!meta || !meta.restaurantId) throw new AppError('Group order not found or has expired', 404);

  const members = Object.entries(membersRaw).map(([userId, json]) => ({ userId, ...JSON.parse(json) }));

  const itemIds = [...new Set(Object.keys(cartRaw).map((field) => field.split(':')[0]))];
  const menuItems = itemIds.length
    ? await MenuItem.find({ _id: { $in: itemIds } })
    : [];
  const menuItemMap = new Map(menuItems.map((mi) => [String(mi._id), mi]));

  const lines = Object.entries(cartRaw).map(([field, qty]) => {
    const [itemId, userId] = field.split(':');
    const mi = menuItemMap.get(itemId);
    return {
      menuItem: itemId,
      name: mi?.name || 'Unknown item',
      price: mi?.price || 0,
      addedBy: userId,
      quantity: Number(qty),
    };
  });

  const totalsByItem = new Map();
  lines.forEach((line) => {
    const existing = totalsByItem.get(line.menuItem) || { ...line, quantity: 0, addedBy: [] };
    existing.quantity += line.quantity;
    existing.addedBy = [...new Set([...existing.addedBy, line.addedBy])];
    totalsByItem.set(line.menuItem, existing);
  });

  const items = [...totalsByItem.values()];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return {
    groupId,
    restaurant: meta.restaurantId,
    creatorId: meta.creatorId,
    status: meta.status,
    members,
    items,       // aggregated, for the shared-cart display
    lines,       // raw per-user lines, for "who added what"
    subtotal,
  };
}

async function markCheckedOut(groupId) {
  await redisClient.hSet(metaKey(groupId), 'status', 'checked_out');
}

async function clearGroup(groupId) {
  await redisClient.del(metaKey(groupId));
  await redisClient.del(membersKey(groupId));
  await redisClient.del(cartKey(groupId));
}

module.exports = {
  GROUP_TTL_SECONDS,
  createGroup,
  joinGroup,
  addItem,
  updateQuantity,
  removeItem,
  getGroupState,
  markCheckedOut,
  clearGroup,
  publish,
};
