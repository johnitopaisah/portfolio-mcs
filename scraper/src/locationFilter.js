'use strict';

// Hard filter with a Remote/ambiguous safety net (design doc §3): reject
// postings whose location clearly doesn't match any of the target's
// locations, but never blind-drop a posting that's ambiguous or explicitly
// remote — false negatives there are costlier than the extra noise.
function matchesLocation(jobLocationText, targetLocations) {
  if (!targetLocations || targetLocations.length === 0) return true; // remote-open target

  const text = String(jobLocationText || '').trim().toLowerCase();
  if (!text) return true; // no location signal — let it through, safety net
  if (text.includes('remote')) return true; // explicit remote — safety net

  return targetLocations.some((loc) => text.includes(String(loc).toLowerCase()));
}

module.exports = { matchesLocation };
