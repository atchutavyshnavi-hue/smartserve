require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Category = require('../models/Category');
const Zone = require('../models/Zone');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const { connectRedis, redisClient } = require('../config/redis');
const etaService = require('../services/eta.service');

const ZONES = [
  { name: 'North Zone', code: 'north' },
  { name: 'South Zone', code: 'south' },
  { name: 'East Zone', code: 'east' },
  { name: 'West Zone', code: 'west' },
  { name: 'Central Zone', code: 'central' },
];

const DEFAULT_SURGE = [
  { minOrders: 0, maxOrders: 20, fee: 30 },
  { minOrders: 21, maxOrders: 50, fee: 40 },
  { minOrders: 51, maxOrders: 100, fee: 55 },
  { minOrders: 101, maxOrders: null, fee: 70 },
];

const CATEGORIES = ['Pizza', 'Burgers', 'Indian', 'Chinese', 'Desserts'];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  await connectRedis();
  console.log('Connected. Seeding...');

  await Promise.all([
    User.deleteMany({}), Category.deleteMany({}), Zone.deleteMany({}),
    Restaurant.deleteMany({}), MenuItem.deleteMany({}),
  ]);

  const zones = await Zone.insertMany(
    ZONES.map((z) => ({ ...z, surgeThresholds: DEFAULT_SURGE })),
  );

  const categories = await Category.insertMany(
    CATEGORIES.map((name) => ({ name, slug: name.toLowerCase() })),
  );

  const admin = await User.create({
    name: 'Admin', email: 'admin@smartserve.com', password: 'Admin@1234', role: 'admin',
  });
  const owners = await User.create([
    { name: 'Ravi Kumar', email: 'owner1@smartserve.com', password: 'Owner@1234', role: 'restaurant_owner' },
    { name: 'Anita Rao', email: 'owner2@smartserve.com', password: 'Owner@1234', role: 'restaurant_owner' },
  ]);
  const customer = await User.create({
    name: 'Test Customer', email: 'customer@smartserve.com', password: 'Customer@1234', role: 'customer',
  });
  const rider = await User.create({
    name: 'Test Rider', email: 'rider@smartserve.com', password: 'Rider@1234', role: 'delivery_partner',
  });

  const restaurantNames = [
    'Spice Route', 'Pizza Planet', 'Burger Barn', 'Dragon Wok', 'Sweet Tooth',
    'Tandoori Nights', 'Curry House', 'Noodle Bar', 'The Grill Room', 'Café Delight',
  ];

  const zoneCodes = zones.map((z) => z.code);
  const restaurants = [];
  for (let i = 0; i < restaurantNames.length; i += 1) {
    restaurants.push({
      name: restaurantNames[i],
      description: `${restaurantNames[i]} — great food, fast delivery.`,
      owner: owners[i % owners.length]._id,
      cuisines: [CATEGORIES[i % CATEGORIES.length]],
      category: [categories[i % categories.length]._id],
      address: { line1: `${100 + i} Main Rd`, city: 'Hyderabad', state: 'Telangana', pincode: '500001' },
      zone: zoneCodes[i % zoneCodes.length],
      priceForTwo: 200 + (i * 30),
      rating: (3.5 + (i % 5) * 0.3).toFixed(1),
      ratingCount: 20 + i * 5,
      avgPrepTimeMinutes: 15 + (i % 4) * 5,
      isFeatured: i < 4,
      tags: i % 2 === 0 ? ['fast delivery'] : ['pure veg'],
    });
  }
  const createdRestaurants = await Restaurant.insertMany(restaurants);

  // Seed Redis restaurant stats (Smart ETA, Phase 7) for each restaurant
  // so the demo has real data from the first request, not just empty hashes.
  await Promise.all(createdRestaurants.map((r) => etaService.initStats(r)));

  const dishNames = [
    'Margherita Pizza', 'Farmhouse Pizza', 'Classic Cheeseburger', 'Veg Burger',
    'Chicken Manchurian', 'Veg Fried Rice', 'Paneer Butter Masala', 'Butter Chicken',
    'Hakka Noodles', 'Spring Rolls', 'Gulab Jamun', 'Chocolate Brownie',
    'Masala Dosa', 'Chole Bhature', 'Tandoori Chicken', 'Veg Biryani',
    'Chicken Biryani', 'Cold Coffee', 'Mango Lassi', 'French Fries',
    'Garlic Bread', 'Pasta Alfredo', 'Sushi Roll', 'Momos',
    'Club Sandwich', 'Caesar Salad', 'Ice Cream Sundae', 'Cheesecake',
    'Fish Curry', 'Egg Curry',
  ];

  const menuItems = [];
  createdRestaurants.forEach((r, ri) => {
    for (let d = 0; d < 3; d += 1) {
      const idx = (ri * 3 + d) % dishNames.length;
      menuItems.push({
        restaurant: r._id,
        name: dishNames[idx],
        description: `Delicious ${dishNames[idx]} made fresh to order.`,
        price: 99 + ((ri + d) % 6) * 40,
        category: ['Starters', 'Main Course', 'Desserts'][d % 3],
        isVeg: idx % 3 !== 0,
        isPopular: d === 0,
      });
    }
  });
  await MenuItem.insertMany(menuItems);

  console.log('Seed complete:');
  console.log(`  Admin login:    admin@smartserve.com / Admin@1234`);
  console.log(`  Owner login:    owner1@smartserve.com / Owner@1234`);
  console.log(`  Customer login: customer@smartserve.com / Customer@1234`);
  console.log(`  Rider login:    rider@smartserve.com / Rider@1234`);
  console.log(`  ${createdRestaurants.length} restaurants, ${menuItems.length} menu items, ${zones.length} zones, ${categories.length} categories`);

  await mongoose.disconnect();
  await redisClient.quit();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
