const crypto = require('crypto');
const { redisClient } = require('../config/redis');
const Coupon = require('../models/Coupon');
const AppError = require('../utils/AppError');

// ---------------------------------------------------------------------
// FLASH DEALS — limited-time, limited-quantity offers, entirely in
// Redis (no MongoDB model — this is exactly the "temporary, high-speed"
// data Redis is for; a claimed deal mints a normal, permanent Coupon).
//
//   flash_deal:{dealId}            Hash: title, discountPercent,
//                                   restaurantId, couponsTotal, expiresAt
//   flash_deal:{dealId}:remaining  String counter, DECR'd per claim
//   flash_deal:{dealId}:claimed    Set of userIds who already claimed
//   flash_deals:active             Set of dealIds currently live
//
// The deal stops automatically two independent ways, matching the
// spec exactly:
//   - coupon limit reached  -> couponsRemaining hits 0, DECR guard below
//   - expiration time reached -> Redis EXPIRE removes the hash/counter
//     entirely; listActiveDeals() lazily evicts dead ids from the set.
//
// The DECR-then-check-negative pattern below has a small race window
// under very high concurrency (two claims could both pass the check
// before either writes back). A production system would replace it
// with a single Lua script (EVAL) so the check-and-decrement is
// atomic; documented here rather than silently pretending it's
// airtight.
// ---------------------------------------------------------------------

function dealKey(id) { return `flash_deal:${id}`; }
function remainingKey(id) { return `${dealKey(id)}:remaining`; }
function claimedKey(id) { return `${dealKey(id)}:claimed`; }
const ACTIVE_SET_KEY = 'flash_deals:active';

function generateDealId() {
  return crypto.randomBytes(4).toString('hex');
}

async function createDeal({ title, discountPercent, restaurantId, couponsTotal, expiresInMinutes }) {
  const dealId = generateDealId();
  const ttlSeconds = expiresInMinutes * 60;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  await redisClient.hSet(dealKey(dealId), {
    title,
    discountPercent: String(discountPercent),
    restaurantId: restaurantId || '',
    couponsTotal: String(couponsTotal),
    expiresAt: String(expiresAt),
  });
  await redisClient.expire(dealKey(dealId), ttlSeconds);
  await redisClient.set(remainingKey(dealId), String(couponsTotal));
  await redisClient.expire(remainingKey(dealId), ttlSeconds);
  await redisClient.sAdd(ACTIVE_SET_KEY, dealId);

  return getDeal(dealId);
}

async function getDeal(dealId) {
  const exists = await redisClient.exists(dealKey(dealId));
  if (!exists) return null;
  const [deal, remaining, ttl] = await Promise.all([
    redisClient.hGetAll(dealKey(dealId)),
    redisClient.get(remainingKey(dealId)),
    redisClient.ttl(dealKey(dealId)),
  ]);
  return {
    dealId,
    title: deal.title,
    discountPercent: Number(deal.discountPercent),
    restaurantId: deal.restaurantId || null,
    couponsTotal: Number(deal.couponsTotal),
    couponsRemaining: Number(remaining || 0),
    expiresInSeconds: ttl,
  };
}

// Lists active deals, lazily evicting any that have expired or sold out
// (both cases mean they should no longer be advertised).
async function listActiveDeals() {
  const ids = await redisClient.sMembers(ACTIVE_SET_KEY);
  const deals = [];
  for (const id of ids) {
    const deal = await getDeal(id);
    if (deal && deal.couponsRemaining > 0) {
      deals.push(deal);
    } else {
      await redisClient.sRem(ACTIVE_SET_KEY, id);
    }
  }
  return deals;
}

// Claiming mints a single-use Coupon (Mongo) scoped to this user, so
// redemption flows through the exact same server-validated coupon
// logic as any other coupon — no separate "flash deal price" path to
// keep in sync.
async function claimDeal(dealId, userId) {
  const deal = await getDeal(dealId);
  if (!deal) throw new AppError('This flash deal has expired or does not exist', 404);

  const alreadyClaimed = await redisClient.sIsMember(claimedKey(dealId), String(userId));
  if (alreadyClaimed) throw new AppError('You have already claimed this deal', 409);

  const remaining = await redisClient.decr(remainingKey(dealId));
  if (remaining < 0) {
    await redisClient.incr(remainingKey(dealId)); // revert the over-decrement
    throw new AppError('This flash deal is sold out', 409);
  }
  await redisClient.sAdd(claimedKey(dealId), String(userId));

  const code = `FLASH${dealId.toUpperCase()}${String(userId).slice(-4).toUpperCase()}`;
  const coupon = await Coupon.create({
    code,
    type: 'percentage',
    value: deal.discountPercent,
    minOrderAmount: 0,
    maxDiscount: null,
    expiresAt: new Date(Date.now() + deal.expiresInSeconds * 1000),
    usageLimit: 1,
    perUserLimit: 1,
    applicableUsers: [userId],
    isActive: true,
  });

  return { coupon, couponsRemaining: Math.max(remaining, 0) };
}

module.exports = { createDeal, getDeal, listActiveDeals, claimDeal };
