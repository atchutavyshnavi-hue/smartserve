// Pure recurrence math for subscriptions — no I/O, easy to reason about
// and to unit-test in isolation from Redis/Mongo.

function parseTimeOfDay(timeOfDay) {
  const [h, m] = timeOfDay.split(':').map(Number);
  return { hours: h, minutes: m || 0 };
}

// Returns the next Date strictly AFTER `from` that matches the
// subscription's recurrence rule.
function computeNextRun({ frequency, timeOfDay, dayOfWeek, dayOfMonth }, from = new Date()) {
  const { hours, minutes } = parseTimeOfDay(timeOfDay);

  if (frequency === 'daily') {
    const next = new Date(from);
    next.setHours(hours, minutes, 0, 0);
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  if (frequency === 'weekly') {
    if (dayOfWeek === null || dayOfWeek === undefined) throw new Error('dayOfWeek is required for weekly subscriptions');
    const next = new Date(from);
    next.setHours(hours, minutes, 0, 0);
    // advance day-by-day until we land on the right weekday, strictly after `from`
    do {
      if (next.getDay() === dayOfWeek && next > from) break;
      next.setDate(next.getDate() + 1);
    } while (next.getDay() !== dayOfWeek);
    return next;
  }

  if (frequency === 'monthly') {
    if (!dayOfMonth) throw new Error('dayOfMonth is required for monthly subscriptions');
    const next = new Date(from.getFullYear(), from.getMonth(), dayOfMonth, hours, minutes, 0, 0);
    if (next <= from) next.setMonth(next.getMonth() + 1);
    return next;
  }

  throw new Error(`Unknown frequency: ${frequency}`);
}

module.exports = { computeNextRun };
