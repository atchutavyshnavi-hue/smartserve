const { redisClient } = require('../config/redis');
const Zone = require('../models/Zone');

// ---------------------------------------------------------------------
// SURGE PRICING — dynamic delivery fee based on recent demand per zone.
//
// The spec's naive version is a single key `active_orders:{zone}` that
// gets INCR'd and has its EXPIRE repeatedly pushed out. That's broken:
// every new order resets the 10-minute clock, so a zone that's merely
// "busy sometimes" can end up surged forever, and demand from 9
// minutes ago never actually falls out of the window on its own.
//
// Instead we use TIME BUCKETS: one Redis String per zone PER MINUTE,
// each independently expiring. "Demand in the last 10 minutes" is the
// sum of the current bucket and the previous 9 — a real sliding window,
// where old activity ages out on schedule regardless of new activity.
//
//   active_orders:{zone}:{minuteBucket}   String, INCR'd per order
//
// Each bucket's own TTL is a little longer than the window so a bucket
// is never read as "expired-but-still-relevant" — but no bucket is
// ever re-armed by later activity, which is exactly what makes the
// window meaningful.
// ---------------------------------------------------------------------

const BUCKET_SECONDS = 60;              // 1-minute buckets
const WINDOW_MINUTES = 10;              // the "10-minute demand window" from the spec
const BUCKET_TTL_SECONDS = (WINDOW_MINUTES + 2) * 60; // small buffer past the window

const DEFAULT_THRESHOLDS = [
  { minOrders: 0, maxOrders: 20, fee: 30 },
  { minOrders: 21, maxOrders: 50, fee: 40 },
  { minOrders: 51, maxOrders: 100, fee: 55 },
  { minOrders: 101, maxOrders: null, fee: 70 },
];

function currentBucketIndex() {
  return Math.floor(Date.now() / (BUCKET_SECONDS * 1000));
}

function bucketKey(zone, bucketIndex) {
  return `active_orders:${zone}:${bucketIndex}`;
}

// Called once per order placed, for the order's delivery zone.
async function recordOrder(zone) {
  const key = bucketKey(zone, currentBucketIndex());
  await redisClient.incr(key);
  await redisClient.expire(key, BUCKET_TTL_SECONDS);
}

// Sums the current bucket + the previous (WINDOW_MINUTES - 1) buckets.
// Buckets that have already expired (or never existed) come back as
// null from MGET and simply contribute 0 — that's the "aging out".
async function getActiveOrderCount(zone) {
  const idx = currentBucketIndex();
  const keys = Array.from({ length: WINDOW_MINUTES }, (_, i) => bucketKey(zone, idx - i));
  const values = await redisClient.mGet(keys);
  return values.reduce((sum, v) => sum + (v ? Number(v) : 0), 0);
}

function feeForCount(count, thresholds) {
  const match = thresholds.find(
    (t) => count >= t.minOrders && (t.maxOrders === null || t.maxOrders === undefined || count <= t.maxOrders),
  );
  return match ? match.fee : thresholds[thresholds.length - 1].fee;
}

// Main entry point used by checkout. Falls back to DEFAULT_THRESHOLDS
// if the zone hasn't been configured with custom ones in Mongo (admin
// can override per zone — see Zone model / admin dashboard, Phase 9).
async function getDynamicDeliveryFee(zoneCode) {
  const zoneDoc = await Zone.findOne({ code: zoneCode });
  const thresholds = zoneDoc?.surgeThresholds?.length ? zoneDoc.surgeThresholds : DEFAULT_THRESHOLDS;

  const activeOrders = await getActiveOrderCount(zoneCode);
  const fee = feeForCount(activeOrders, thresholds);
  const baseFee = thresholds[0].fee;
  const isSurge = fee > baseFee;

  return {
    zone: zoneCode,
    activeOrders,
    fee,
    isSurge,
    message: isSurge ? 'High demand in your area. Delivery fee has increased temporarily.' : null,
  };
}

module.exports = {
  BUCKET_SECONDS, WINDOW_MINUTES, DEFAULT_THRESHOLDS,
  recordOrder, getActiveOrderCount, getDynamicDeliveryFee,
};
