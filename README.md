# 🍽️ SmartServe — Smart Food Ordering Platform

SmartServe is a full-stack food ordering and delivery platform with four user roles (customer, restaurant owner, delivery partner, admin), real-time order tracking, and several features that are genuinely powered by **Redis** (group orders, surge pricing, trending restaurants, smart ETA, scheduled/subscription orders, flash deals). The UI is available in **English, Hindi, Telugu, Tamil and Kannada**.

---

## ✨ Features

### For customers
- Browse and search restaurants, filter by rating, sort by price/popularity
- Cart (kept in Redis, 30-minute sliding expiry), checkout with coupons, Cash on Delivery or mock online payment
- Live order tracking (status timeline updates without refreshing)
- **My Orders** with restaurant, bill number, date/time, delivery address and delivery partner; order detail page with full bill breakdown
- Group orders (shared cart, real-time via Redis Pub/Sub), scheduled orders, subscriptions
- Profile page: edit details, saved addresses, favourite cuisines, change password

### For restaurant owners
- Sign up with restaurant name and zone — the restaurant is created automatically
- Live notification for every new order, with order details
- Manage menu (add, delete, mark available/unavailable), accept → prepare → mark ready
- When food is marked **ready**, delivery partners in that zone are notified
- Stats: orders, revenue, 7-day chart, popular dishes, live prep time

### For delivery partners
- Available deliveries filtered by their zone; accept and update status
- Full delivery address, order id, items and phone number on every card
- Earnings summary

### Smart / Redis-powered features
| Feature | Redis structure |
|---|---|
| Cart | Hash `cart:user:{id}` + TTL |
| Group orders | Hash + Pub/Sub `group:{id}:events` |
| Surge pricing | Time-bucketed String counters `surge:{zone}:{bucket}` |
| Trending restaurants | Sorted Set `trending:zone:{zone}` (decayed every 30 min) |
| Smart ETA | Hash `restaurant:{id}:stats` |
| Scheduled / subscription orders | Sorted Set queues |
| Flash deals | Atomic counters |
| Real-time notifications | Pub/Sub `notify:{userId}` → Socket.IO |
| Duplicate-checkout protection | `SET NX PX` lock |

### Cancellation redirect
If a customer cancels an order that is already **out for delivery**, the cooked food is redirected to another nearby customer who ordered the same items and hasn't been prepared yet. The receiving customer simply sees a normal "Out for Delivery"; the restaurant and the rider are told what happened. If no match exists, the order is cancelled and refunded.

### Multi-language
Language switcher in the ☰ menu (and on the Profile page). Restaurant names and categories are shown in the chosen script too. Translations live in `client/src/i18n/`.

---

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, Axios, Socket.IO client, Recharts |
| Backend | Node.js, Express, Mongoose, Socket.IO, node-cron |
| Database | MongoDB (source of truth: users, restaurants, menu, orders…) |
| Cache / realtime | Redis (node-redis v4; main, publisher and subscriber clients) |
| Auth & security | JWT (access + refresh), bcrypt, helmet, cors, express-rate-limit |

> **MongoDB vs Redis:** orders, users and restaurants are stored permanently in MongoDB. Redis holds fast, short-lived data (cart, counters, rankings, queues, pub/sub).

---

## 📁 Project structure

```
smartserve/
├── server/
│   ├── config/         # DB + Redis connections
│   ├── controllers/    # Route handlers
│   ├── middleware/     # auth (protect / restrictTo), rate limiter, errors
│   ├── models/         # Mongoose schemas
│   ├── routes/         # Express routers (/api/...)
│   ├── services/       # Business logic (surge, ETA, redirect, notifications…)
│   ├── sockets/        # Socket.IO setup
│   ├── workers/        # Background workers
│   ├── utils/seed.js   # Demo data
│   └── server.js
└── client/
    └── src/
        ├── components/ # Navbar, NotificationBell, BackButton, RestaurantCard…
        ├── context/    # Auth, Cart, Language
        ├── i18n/       # translations.js, names.js
        ├── pages/      # One file per screen
        └── services/   # Axios instance
```

---

## ⚙️ Prerequisites

- **Node.js** 18+ (and npm)
- **MongoDB** running locally (`mongodb://127.0.0.1:27017`)
- **Redis** running locally (`redis://127.0.0.1:6379`) — verify with `redis-cli ping` → `PONG`

> On Windows, keep the project outside OneDrive (e.g. `C:\dev\smartserve`) and consider excluding it from Windows Defender scans to avoid file-lock errors during `npm install`.

---

## 🚀 Getting started

### 1. Server

```bash
cd server
npm install
```

Create `server/.env` (copy from `.env.example`):

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

MONGO_URI=mongodb://127.0.0.1:27017/smartserve
REDIS_URL=redis://127.0.0.1:6379

JWT_SECRET=change_this_to_a_long_random_secret
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=change_this_too
JWT_REFRESH_EXPIRES_IN=30d
```

Seed demo data (**run once**, on an empty database):

```bash
npm run seed
```

Start the API:

```bash
npm run dev
```

### 2. Client (in a second terminal)

```bash
cd client
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` and the WebSocket to the server on port 5000, so the server must be running.

---

## 🔑 Demo accounts (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin | admin@smartserve.com | Admin@1234 |
| Restaurant owner | owner1@smartserve.com | Owner@1234 |
| Customer | customer@smartserve.com | Customer@1234 |
| Delivery partner | rider@smartserve.com | Rider@1234 |

You can also sign up as a customer, restaurant owner (asks for restaurant name + zone) or delivery partner (asks for zone).

⚠️ **Re-seeding wipes all users, restaurants and menu items.** The seed script refuses to run if users already exist; to wipe and reseed on purpose, use `npm run seed -- --force`.

---

## 🧪 Trying the main flows

1. **Order flow** — log in as a customer → add items → checkout. Log in as the restaurant owner (another browser/profile) → you get a notification → *Accept → Preparing → Ready*. A rider in the same zone gets notified → *Accept → Out for delivery → Delivered*. The customer's order page updates live.
2. **Cancellation redirect** — Customer B places an order (same restaurant & items, same zone) and leaves it in *placed/accepted/preparing*. Customer A orders the same, and it is moved to *out for delivery*. Customer A cancels → the delivery is redirected to B's address. The redirect is only checked at the moment of cancellation.
3. **Language** — open ☰ → Language and pick Hindi/Telugu/Tamil/Kannada.

---

## 🔌 API overview

All routes are under `/api` and need `Authorization: Bearer <token>` unless noted.

| Area | Base path |
|---|---|
| Auth (register, login, profile, change/reset password) | `/auth` |
| Restaurants & menu | `/restaurants`, `/menu` |
| Cart | `/cart` |
| Orders (checkout, my orders, status, cancel, delivery) | `/orders` |
| Group orders | `/groups` |
| Coupons, pricing/surge, ETA, recommendations/trending | `/coupons`, `/pricing`, `/eta`, `/recommendations` |
| Scheduled orders, subscriptions, flash deals | `/scheduled-orders`, `/subscriptions`, `/flash-deals` |
| Notifications | `/notifications` |
| Admin | `/admin` |

Access is role-based: `protect` verifies the JWT and `restrictTo(...)` enforces roles on the server (the UI hides pages too, but the backend is authoritative).

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| `ECONNREFUSED` for `/api/...` in the client terminal | The server isn't running — start `npm run dev` in `server`. |
| `MongoDB uri undefined` | `server/.env` is missing or in the wrong folder. |
| `Cannot find module 'dotenv'` | Run `npm install` in `server` before `npm run seed`. |
| `ERR syntax error` on trending | Redis 5 doesn't support `ZRANGE … REV`; the code uses `ZREVRANGE` — make sure you have the latest `recommendation.service.js`. |
| "Too many requests" | Auth routes are rate-limited (200 / 15 min in development, 20 in production). Wait, or restart the server. |
| Vite `ws proxy error ECONNRESET/ECONNABORTED` | Harmless; happens when the server restarts. |
| Restaurant/orders disappeared | `npm run seed -- --force` wipes everything; avoid re-seeding. |
| Forgot password in dev | `POST /api/auth/forgot-password` returns a `resetToken`; then `POST /api/auth/reset-password/:token` with `{ "password": "..." }`. |

---

## 🌐 Adding a language

1. Add `{ code, label }` to `LANGUAGES` in `client/src/i18n/translations.js`.
2. Copy the `en` block, translate the values, and register it in `TRANSLATIONS`.
3. (Optional) add restaurant/category names in `client/src/i18n/names.js`. Names not listed are transliterated automatically and cached in the browser.

Missing keys fall back to English.

---

## 📌 Notes & limitations

- Payments are mocked (no real gateway).
- MongoDB is single-node, so there are no multi-document transactions; the redirect uses conditional atomic updates instead.
- Server-generated texts (notification messages, API errors) are English only.
- Dish names and customer-entered data are not translated.

---

## 📄 License

For educational / academic use.
