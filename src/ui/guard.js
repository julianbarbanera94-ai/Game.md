// Guards against double-taps triggering a transaction twice. The cooldown is
// shared by every panel button because panels re-render (replacing their
// buttons) after each transaction, so a per-button flag would reset.
const ACTION_COOLDOWN_MS = 350;
let lastActionAt = 0;
export function guarded(fn) {
  return (e) => {
    const now = performance.now();
    if (now - lastActionAt < ACTION_COOLDOWN_MS) return;
    lastActionAt = now;
    fn(e);
  };
}

