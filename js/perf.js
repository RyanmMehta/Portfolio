// Small helpers for keeping heavy work out of the way of animations.

// Run work when the browser is idle, falling back to a short timeout.
export function whenIdle(fn, timeout = 2000) {
  if ('requestIdleCallback' in window) return requestIdleCallback(fn, { timeout });
  return setTimeout(fn, 200);
}
