const { redisClient } = require('../config/redis');
const Restaurant = require('../models/Restaurant');

// ---------------------------------------------------------------------
// TRENDING / RECOMMENDATIONS — Redis Sorted Set per zone.
//
//   trending:zone:{zone}   ZSET: member = restaurantId, score = order count
//
// ZINCRBY on every completed order keeps the score a running tally of
// recent popularity; the top of the set is the leaderboard.
//
// Decay: a cron job (see decayAllZones, scheduled in server.js) halves
// every zone's scores on an interval, via ZUNIONSTORE ... WEIGHTS 0.5
// (a single-key union just rescales it in place) — so "trending" tracks
// recent demand instead of an all-time total that only ever grows.
// ---------------------------------------------------------------------

function trendingKey(zone) { return `trending:zone:${zone}`; }
const DECAY_FACTOR = 0.5;

// Called when a customer's order is placed successfully — see
// order.controller.js / group.controller.js checkout.
async function recordCompletedOrder(zone, restaurantId) {
  await redisClient.zIncrBy(trendingKey(zone), 1, String(restaurantId));
}

// GET the top N trending restaurants for a zone, hydrated with Mongo data.
// Uses ZREVRANGE (via sendCommand) rather than ZRANGE ... REV, which
// requires Redis 6.2+ — older deployed Redis versions (5.x) only support
// the legacy command.
async function getTrending(zone, limit = 5) {
  const raw = await redisClient.sendCommand(['ZREVRANGE', trendingKey(zone), '0', String(limit - 1), 'WITHSCORES']);
  if (!raw || raw.length === 0) return [];

  const ranked = [];
  for (let i = 0; i < raw.length; i += 2) {
    ranked.push({ value: raw[i], score: Number(raw[i + 1]) });
  }

  const restaurants = await Restaurant.find({ _id: { $in: ranked.map((r) => r.value) } });
  const byId = new Map(restaurants.map((r) => [String(r._id), r]));

  return ranked
    .map((r) => ({ restaurant: byId.get(r.value), orderCount: r.score }))
    .filter((r) => r.restaurant); // drop any restaurant that was deleted since trending
}

// Halves every zone's trending scores. Called on a schedule (see
// server.js) so old activity fades out instead of accumulating forever.
async function decayAllZones() {
  for await (const key of redisClient.scanIterator({ MATCH: 'trending:zone:*', COUNT: 100 })) {
    // ZUNIONSTORE dest 1 src WEIGHTS 0.5 — a union of one key just
    // rescales its own scores; works unchanged on old Redis versions.
    await redisClient.sendCommand(['ZUNIONSTORE', key, '1', key, 'WEIGHTS', String(DECAY_FACTOR)]);
  }
}

// "Recommended for you" blends zone trending with the user's own
// cuisine preferences and rating — a lightweight, explainable scorer
// rather than a black box, in keeping with the spec's listed factors
// (zone, popularity, recent orders, rating, cuisine preference).
async function getRecommended(zone, cuisinePreferences = [], limit = 5) {
  const trending = await getTrending(zone, 20); // pull a wider pool, then re-rank
  if (trending.length === 0) {
    // No trending signal yet for this zone — fall back to top-rated open restaurants.
    const fallback = await Restaurant.find({ zone, isOpen: true }).sort('-rating').limit(limit);
    return fallback.map((restaurant) => ({ restaurant, score: restaurant.rating }));
  }

  const scored = trending.map(({ restaurant, orderCount }) => {
    const cuisineMatch = restaurant.cuisines.some((c) => cuisinePreferences.includes(c)) ? 2 : 0;
    const score = orderCount * 1 + restaurant.rating * 1 + cuisineMatch;
    return { restaurant, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

module.exports = { recordCompletedOrder, getTrending, getRecommended, decayAllZones };
