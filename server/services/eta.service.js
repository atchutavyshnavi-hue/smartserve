const { redisClient } = require('../config/redis');
const Restaurant = require('../models/Restaurant');

// ---------------------------------------------------------------------
// SMART ETA — restaurant workload lives in a Redis Hash so it can be
// read/updated on every order without hammering MongoDB.
//
//   restaurant:{id}:stats   Hash: {
//     avg_prep_time        -- baseline, rarely changes (set from Restaurant doc)
//     current_prep_time     -- avg_prep_time adjusted for current load
//     active_orders          -- how many orders this restaurant has "in flight" right now
//     average_delivery_time -- rolling stat, informational
//   }
//
// ETA = prep time + rider assignment time + travel time + traffic
// ---------------------------------------------------------------------

function statsKey(restaurantId) { return `restaurant:${restaurantId}:stats`; }

// Called once when a restaurant is created, and lazily by getStats() if
// the hash doesn't exist yet (e.g. data seeded directly into Mongo).
async function initStats(restaurant) {
  await redisClient.hSet(statsKey(restaurant._id), {
    avg_prep_time: String(restaurant.avgPrepTimeMinutes || 20),
    current_prep_time: String(restaurant.avgPrepTimeMinutes || 20),
    active_orders: '0',
    average_delivery_time: String((restaurant.avgPrepTimeMinutes || 20) + 20),
  });
}

async function getStats(restaurantId) {
  let stats = await redisClient.hGetAll(statsKey(restaurantId));
  if (!stats || Object.keys(stats).length === 0) {
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return null;
    await initStats(restaurant);
    stats = await redisClient.hGetAll(statsKey(restaurantId));
  }
  return {
    avgPrepTime: Number(stats.avg_prep_time),
    currentPrepTime: Number(stats.current_prep_time),
    activeOrders: Number(stats.active_orders),
    averageDeliveryTime: Number(stats.average_delivery_time),
  };
}

// Recomputes current_prep_time from load: every 3 simultaneous active
// orders adds a minute of kitchen backlog, capped at +15 over baseline.
async function recalcCurrentPrepTime(restaurantId) {
  const stats = await getStats(restaurantId);
  if (!stats) return;
  const backlogMinutes = Math.min(Math.floor(stats.activeOrders / 3), 15);
  const currentPrepTime = stats.avgPrepTime + backlogMinutes;
  await redisClient.hSet(statsKey(restaurantId), 'current_prep_time', String(currentPrepTime));
}

// Called when an order is placed for this restaurant.
async function incrementActiveOrders(restaurantId) {
  await getStats(restaurantId); // ensures the hash exists first
  await redisClient.hIncrBy(statsKey(restaurantId), 'active_orders', 1);
  await recalcCurrentPrepTime(restaurantId);
}

// Called when an order reaches 'delivered' or 'cancelled' for this restaurant.
async function decrementActiveOrders(restaurantId) {
  const stats = await getStats(restaurantId);
  if (!stats || stats.activeOrders <= 0) return;
  await redisClient.hIncrBy(statsKey(restaurantId), 'active_orders', -1);
  await recalcCurrentPrepTime(restaurantId);
}

// Rider assignment time grows slightly with restaurant load (fewer
// idle riders nearby when a restaurant is swamped) — simulated, not
// pulled from a real rider-location service.
function calculateRiderAssignmentTime(activeOrders) {
  return Math.min(5 + Math.floor(activeOrders / 4), 15);
}

// No real geocoding/distance API here — zones stand in for distance.
// Same zone = short hop, different zone = a real cross-town trip.
function calculateTravelTime(restaurantZone, customerZone) {
  return restaurantZone === customerZone ? 12 : 20;
}

// Traffic is simulated: heavier during lunch (12-14) and dinner (19-21)
// hours, otherwise a light random variation — a real system would call
// a maps/traffic API here instead.
function simulateTraffic() {
  const hour = new Date().getHours();
  const isPeak = (hour >= 12 && hour < 14) || (hour >= 19 && hour < 21);
  if (isPeak) return { level: 'high', extraMinutes: 8 + Math.floor(Math.random() * 5) };
  const roll = Math.random();
  if (roll < 0.2) return { level: 'medium', extraMinutes: 3 + Math.floor(Math.random() * 3) };
  return { level: 'low', extraMinutes: Math.floor(Math.random() * 3) };
}

async function getETA(restaurant, customerZone) {
  const stats = await getStats(restaurant._id);
  const prepTime = stats.currentPrepTime;
  const riderAssignmentTime = calculateRiderAssignmentTime(stats.activeOrders);
  const travelTime = calculateTravelTime(restaurant.zone, customerZone);
  const traffic = simulateTraffic();

  const total = prepTime + riderAssignmentTime + travelTime + traffic.extraMinutes;
  const min = Math.max(total - 5, prepTime);
  const max = total + 3;

  return {
    breakdown: {
      preparationMinutes: prepTime,
      riderAssignmentMinutes: riderAssignmentTime,
      travelMinutes: travelTime,
      trafficLevel: traffic.level,
      trafficExtraMinutes: traffic.extraMinutes,
    },
    estimatedMinutes: total,
    rangeMinutes: { min, max },
    activeOrders: stats.activeOrders,
  };
}

module.exports = {
  initStats, getStats, incrementActiveOrders, decrementActiveOrders,
  calculateRiderAssignmentTime, calculateTravelTime, simulateTraffic, getETA,
};
