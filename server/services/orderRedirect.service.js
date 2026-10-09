const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const paymentService = require('./payment.service');
const notificationService = require('./notification.service');

// ---------------------------------------------------------------------
// IN-FLIGHT CANCELLATION REDIRECT
//
// When a customer cancels an order that is already 'out_for_delivery',
// the food is already cooked and the rider is already moving — cancelling
// outright wastes it. Instead, we look for another order at the SAME
// restaurant, in the SAME delivery zone, with the EXACT same items and
// quantities, placed by a DIFFERENT customer, that hasn't been prepared
// yet — and hand this same physical delivery to them instead of cooking
// theirs from scratch.
//
// What each side sees:
//   - The cancelling customer: an ordinary "Cancelled" order (refunded if
//     paid online). Nothing about a redirect is shown to them.
//   - The receiving customer: their own order simply jumps straight to
//     "Out for Delivery" — indistinguishable from a normal fast order.
//     They are never told this is someone else's cancelled meal.
//   - The restaurant: an explicit notification that this order is already
//     prepared and moving, so the kitchen does not cook it again.
//   - The rider: notified their drop-off address/contact changed.
//
// Matching is intentionally conservative — an exact item+quantity match
// only, same restaurant, same zone (zone is the only "how near" signal
// this app has; there's no live GPS radius search here) — and it never
// chains (an order that is itself already part of one redirect is
// excluded from being matched again).
// ---------------------------------------------------------------------

const CANDIDATE_STATUSES = ['placed', 'accepted', 'preparing'];
const CANDIDATE_POOL_LIMIT = 20; // small pool scanned in JS for an exact item-set match

function itemSignature(items) {
  return items
    .map((i) => `${i.menuItem}:${i.quantity}`)
    .sort()
    .join('|');
}

// Finds the oldest still-unprepared order (different customer, same
// restaurant + zone + exact items) eligible to receive the redirect.
// Returns null if nothing matches.
async function findRedirectCandidate(cancelledOrder) {
  const wantedSignature = itemSignature(cancelledOrder.items);

  const pool = await Order.find({
    _id: { $ne: cancelledOrder._id },
    restaurant: cancelledOrder.restaurant,
    customer: { $ne: cancelledOrder.customer },
    'deliveryAddress.zone': cancelledOrder.deliveryAddress.zone,
    status: { $in: CANDIDATE_STATUSES },
    isGroupOrder: false,
    redirectedFromOrder: null,
    redirectedToOrder: null,
  }).sort('createdAt').limit(CANDIDATE_POOL_LIMIT);

  return pool.find((o) => itemSignature(o.items) === wantedSignature) || null;
}

// Attempts the handoff. Returns { redirected: false } if no eligible
// match exists (or one was lost to a race — see the guarded update
// below); the caller should then fall back to an ordinary cancellation.
// On success returns { redirected: true, receiver }.
async function attemptRedirect(cancelledOrder, io) {
  const candidate = await findRedirectCandidate(cancelledOrder);
  if (!candidate) return { redirected: false };

  // Re-assert the candidate is still eligible at the moment we commit —
  // a conditional update guards against a concurrent request grabbing it
  // first. (A full multi-document transaction would need a replica-set
  // MongoDB, which this project doesn't assume is available.)
  const receiver = await Order.findOneAndUpdate(
    { _id: candidate._id, status: { $in: CANDIDATE_STATUSES }, redirectedFromOrder: null },
    {
      $set: {
        status: cancelledOrder.status, // 'out_for_delivery'
        deliveryPartner: cancelledOrder.deliveryPartner,
        estimatedDeliveryMinutes: cancelledOrder.estimatedDeliveryMinutes,
        redirectedFromOrder: cancelledOrder._id,
        fulfilledViaRedirect: true,
      },
      $push: { statusHistory: { status: cancelledOrder.status, at: new Date() } },
    },
    { new: true },
  );
  if (!receiver) return { redirected: false }; // lost the race — caller falls back to a normal cancel

  cancelledOrder.redirectedToOrder = receiver._id;
  cancelledOrder.pushStatus('cancelled');
  if (cancelledOrder.paymentStatus === 'paid') {
    await paymentService.refund(cancelledOrder.payment);
    cancelledOrder.paymentStatus = 'refunded';
  }
  await cancelledOrder.save();

  // Receiving customer: identical to an ordinary status-update push, so
  // their own OrderDetail page just shows normal live progress.
  io.to(`order:${receiver._id}`).emit('order:status', { orderId: receiver._id, status: receiver.status });
  io.to(`user:${receiver.customer}`).emit('order:status', { orderId: receiver._id, status: receiver.status });

  // Rider: same physical trip, new drop-off details.
  if (receiver.deliveryPartner) {
    io.to(`user:${receiver.deliveryPartner}`).emit('delivery:redirected', {
      previousOrderId: cancelledOrder._id,
      orderId: receiver._id,
      deliveryAddress: receiver.deliveryAddress,
      contactPhone: receiver.contactPhone,
    });
    await notificationService.notify(receiver.deliveryPartner, {
      type: 'out_for_delivery',
      title: 'Delivery address updated',
      message: 'The customer for this delivery has changed — please check the updated address before drop-off.',
      data: { orderId: receiver._id },
    });
  }

  // Restaurant: told plainly so the kitchen doesn't cook this order again.
  const restaurant = await Restaurant.findById(receiver.restaurant);
  if (restaurant) {
    await notificationService.notify(restaurant.owner, {
      type: 'new_order',
      title: 'No prep needed for this order',
      message: `Order #${String(receiver._id).slice(-6).toUpperCase()} is already prepared and on its way — `
        + 'it was reassigned from a cancelled order with identical items. No further action needed.',
      data: { orderId: receiver._id },
    });
  }

  return { redirected: true, receiver };
}

module.exports = { findRedirectCandidate, attemptRedirect, itemSignature };
